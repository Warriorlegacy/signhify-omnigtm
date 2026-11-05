import { Repo, truncate, type OpportunityInput, type Track } from '@omnigtm/core';
import { scoreOpportunity, type AiGateway } from '@omnigtm/ai-gateway';
import { B2B_LEADS } from './b2b.js';
import { heuristicScore } from './score.js';
import { DEFAULT_SOURCES, fetchAll } from './sources/index.js';
import type { RawJob } from './sources/types.js';

function originOf(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return url;
  }
}

export interface HarvestOptions {
  repo: Repo;
  gateway?: AiGateway | null;
  sources?: string[];
  track?: Track | 'BOTH';
  limitPerSource?: number;
  /** Re-score the shortlist with the LLM. Disabled when no gateway is supplied. */
  useLlm?: boolean;
  /** Only send opportunities at or above this heuristic score to the LLM. */
  llmMinScore?: number;
  /** Hard cap on LLM calls per harvest, protecting free-tier quota. */
  llmBudget?: number;
}

export interface HarvestReport {
  scanned: number;
  inserted: number;
  updated: number;
  skipped: number;
  llmScored: number;
  provider: string | null;
  durationMs: number;
  sources: { source: string; jobs: number; error?: string }[];
  errors: string[];
}

export async function harvest(options: HarvestOptions): Promise<HarvestReport> {
  const started = Date.now();
  const {
    repo,
    gateway = null,
    sources = DEFAULT_SOURCES,
    track = 'BOTH',
    limitPerSource = 30,
    useLlm = Boolean(gateway),
    llmMinScore = 55,
    llmBudget = 6,
  } = options;

  const workspace = await repo.ensureWorkspace();
  const report: HarvestReport = {
    scanned: 0,
    inserted: 0,
    updated: 0,
    skipped: 0,
    llmScored: 0,
    provider: null,
    durationMs: 0,
    sources: [],
    errors: [],
  };

  const shortlist: { id: string; job: RawJob; score: number }[] = [];

  if (track === 'REMOTE_JOB' || track === 'BOTH') {
    const results = await fetchAll(sources, limitPerSource);
    for (const result of results) {
      report.sources.push({ source: result.source, jobs: result.jobs.length, error: result.error });
      if (result.error) report.errors.push(`${result.source}: ${result.error}`);
      for (const job of result.jobs) {
        report.scanned += 1;
        const existing = await repo.findByCompanyRole(job.companyName, job.title);
        if (existing) {
          report.skipped += 1;
          continue;
        }
        const heuristic = heuristicScore(job);
        const input: OpportunityInput = {
          workspaceId: workspace.id,
          track: 'REMOTE_JOB',
          source: job.source,
          externalId: job.externalId,
          companyName: job.companyName,
          roleTitle: truncate(job.title, 160),
          companyUrl: originOf(job.url),
          sourceUrl: job.url,
          location: job.location ?? null,
          remote: job.remote,
          salaryText: job.salary ?? null,
          descriptionSnippet: truncate(job.descriptionText, 1200),
          painPointSummary: '',
          fitScore: heuristic.score,
          fitReasons: heuristic.reasons,
          stage: 'DISCOVERED',
        };
        const { id, inserted } = await repo.upsertOpportunity(input);
        if (inserted) report.inserted += 1;
        else report.updated += 1;
        if (heuristic.score >= llmMinScore) shortlist.push({ id, job, score: heuristic.score });
      }
    }
  }

  if (track === 'B2B_SPRINT' || track === 'BOTH') {
    for (const lead of B2B_LEADS) {
      report.scanned += 1;
      const existing = await repo.findByCompanyRole(lead.companyName, lead.roleTitle);
      if (existing) {
        report.skipped += 1;
        continue;
      }
      const { inserted } = await repo.upsertOpportunity({
        workspaceId: workspace.id,
        track: 'B2B_SPRINT',
        source: 'seed:b2b',
        externalId: lead.id,
        companyName: lead.companyName,
        roleTitle: lead.roleTitle,
        companyUrl: lead.companyUrl,
        sourceUrl: lead.sourceUrl,
        location: lead.location,
        remote: /remote/i.test(lead.location),
        descriptionSnippet: lead.painPointSummary,
        painPointSummary: lead.painPointSummary,
        fitScore: lead.fitScore,
        fitReasons: lead.fitReasons,
        stage: 'DISCOVERED',
      });
      if (inserted) report.inserted += 1;
      else report.updated += 1;
    }
  }

  if (useLlm && gateway && shortlist.length > 0) {
    const picks = shortlist.sort((a, b) => b.score - a.score).slice(0, Math.max(0, llmBudget));
    for (const pick of picks) {
      try {
        const scored = await scoreOpportunity(gateway, {
          companyName: pick.job.companyName,
          roleTitle: pick.job.title,
          track: 'REMOTE_JOB',
          location: pick.job.location,
          sourceText: pick.job.descriptionText.slice(0, 3500),
        });
        await repo.updateOpportunityScore(pick.id, {
          fitScore: scored.result.fit_score,
          fitReasons: scored.result.reasons,
          painPointSummary: scored.result.pain_point_summary || scored.result.outreach_angle,
        });
        report.llmScored += 1;
        report.provider = scored.provider;
      } catch (error) {
        report.errors.push(`llm score failed for ${pick.job.companyName}: ${error instanceof Error ? error.message.slice(0, 160) : 'unknown'}`);
      }
    }
  }

  report.durationMs = Date.now() - started;
  return report;
}
