import { htmlToText } from '@omnigtm/core';
import { fetchJson, isRemote, type RawJob, type SourceResult } from './types.js';

interface RemotiveJob {
  id: number;
  url: string;
  title: string;
  company_name: string;
  category?: string;
  tags?: string[];
  job_type?: string;
  publication_date?: string;
  candidate_required_location?: string;
  salary?: string;
  description?: string;
}

interface RemotiveResponse {
  jobs: RemotiveJob[];
}

/**
 * Remotive public API. Their terms ask for link-back attribution, a 24h delay and
 * light polling — we fetch at most once per harvest run and always keep the source URL.
 */
export async function fetchRemotive(limit = 30): Promise<SourceResult> {
  const source = 'remotive:all';
  try {
    const data = await fetchJson<RemotiveResponse>(`https://remotive.com/api/remote-jobs?limit=${Math.min(limit, 50)}`);
    const jobs = (data.jobs ?? []).slice(0, limit).map<RawJob>((job) => {
      const text = htmlToText(job.description ?? '');
      return {
        source,
        externalId: String(job.id),
        companyName: job.company_name.trim(),
        title: job.title,
        url: job.url,
        location: job.candidate_required_location ?? 'Remote',
        remote: true,
        salary: job.salary || null,
        descriptionHtml: job.description,
        descriptionText: text,
        postedAt: job.publication_date ?? null,
      };
    });
    return { source, jobs };
  } catch (error) {
    return { source, jobs: [], error: error instanceof Error ? error.message : String(error) };
  }
}

interface ArbeitnowJob {
  slug: string;
  company_name: string;
  title: string;
  description: string;
  remote?: boolean;
  url: string;
  tags?: string[];
  job_types?: string[];
  location?: string;
  created_at?: number;
}

interface ArbeitnowResponse {
  data: ArbeitnowJob[];
}

/** Arbeitnow public job-board API (EU-heavy). No key required. */
export async function fetchArbeitnow(limit = 20): Promise<SourceResult> {
  const source = 'arbeitnow:all';
  try {
    const data = await fetchJson<ArbeitnowResponse>('https://www.arbeitnow.com/api/job-board-api');
    const jobs = (data.data ?? []).slice(0, limit).map<RawJob>((job) => {
      const text = htmlToText(job.description ?? '');
      return {
        source,
        externalId: job.slug,
        companyName: job.company_name,
        title: job.title,
        url: job.url,
        location: job.location ?? null,
        remote: Boolean(job.remote) || isRemote(`${job.location ?? ''} ${text.slice(0, 300)}`),
        descriptionHtml: job.description,
        descriptionText: text,
        postedAt: job.created_at ? new Date(job.created_at * 1000).toISOString() : null,
      };
    });
    return { source, jobs };
  } catch (error) {
    return { source, jobs: [], error: error instanceof Error ? error.message : String(error) };
  }
}
