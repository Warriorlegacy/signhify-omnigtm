import { Repo, log, publicBaseUrl, slugify } from '@omnigtm/core';
import { createGateway, generateReelScript, type AiGateway } from '@omnigtm/ai-gateway';
import { createDraft, sendDraft } from '@omnigtm/outbound';
import { createDemoPreview, mediaRoot, renderReel, sliceVideo } from '@omnigtm/media';
import path from 'node:path';

/**
 * Tool layer for the MCP server. Kept transport-free so the same functions are
 * unit-testable and reusable by the dashboard API routes.
 */

export interface ToolContext {
  repo: Repo;
  gateway: AiGateway;
}

export async function createContext(): Promise<ToolContext> {
  const repo = await Repo.open();
  return { repo, gateway: await createGateway(repo) };
}

export interface ToolOutcome {
  /** Human/model readable payload. */
  data: unknown;
  /** True when the call is waiting for a human decision. */
  requiresConfirmation?: boolean;
  /** Tool annotations surface this in the MCP client. */
  sideEffect: 'read' | 'write';
}

export async function searchOpportunities(
  ctx: ToolContext,
  args: { track?: 'B2B_SPRINT' | 'REMOTE_JOB'; stage?: string; minScore?: number; q?: string; limit?: number }
): Promise<ToolOutcome> {
  const rows = await ctx.repo.listOpportunities({
    track: args.track,
    stage: args.stage as never,
    minScore: args.minScore,
    q: args.q,
    limit: Math.min(Math.max(Number(args.limit) || 20, 1), 100),
  });
  return {
    sideEffect: 'read',
    data: {
      count: rows.length,
      opportunities: rows.map((row) => ({
        id: row.id,
        track: row.track,
        company: row.company_name,
        role: row.role_title,
        stage: row.stage,
        fitScore: row.fit_score,
        remote: Boolean(row.remote),
        location: row.location,
        sourceUrl: row.source_url,
        painPoint: row.pain_point_summary,
      })),
    },
  };
}

export async function build3dPreview(
  ctx: ToolContext,
  args: { slug?: string; inputPath?: string; fps?: number; width?: number; sourceUrl?: string }
): Promise<ToolOutcome> {
  const slug = slugify(args.slug ?? 'demo', 'demo');
  const result = args.inputPath
    ? await sliceVideo({ inputPath: args.inputPath, slug, fps: args.fps ?? 60, width: args.width ?? 1280 })
    : await createDemoPreview(slug);

  await ctx.repo.upsertPreview({
    slug,
    sourceUrl: args.sourceUrl ?? args.inputPath ?? 'synthetic:ffmpeg-gradients',
    frameCount: result.manifest.frameCount,
    bundleBytes: result.manifest.bundleBytes,
    fps: result.manifest.fps,
    width: result.manifest.width,
    height: result.manifest.height,
    manifest: result.manifest,
  });

  const base = publicBaseUrl();
  return {
    sideEffect: 'write',
    data: {
      slug,
      frameCount: result.manifest.frameCount,
      fps: result.manifest.fps,
      width: result.manifest.width,
      height: result.manifest.height,
      bundleBytes: result.manifest.bundleBytes,
      viewerUrl: `${base}/preview/${slug}`,
      frameUrlTemplate: `${base}/api/v1/media/frames/${slug}/frame_%04d.webp`,
      manifestPath: path.join(mediaRoot(), slug, 'manifest.json'),
    },
  };
}

export async function renderSocialReel(
  ctx: ToolContext,
  args: { topic: string; pillar?: string; preset?: 'full' | 'fast'; ctaKeyword?: string; publishTo?: 'instagram' | 'linkedin' | 'youtube' }
): Promise<ToolOutcome> {
  const pillar = args.pillar ?? 'Zero-Burn FOSS Replacements';
  const generated = await generateReelScript(ctx.gateway, { topic: args.topic, pillar, ctaKeyword: args.ctaKeyword });
  const workspace = await ctx.repo.ensureWorkspace();
  const topicHash = slugify(args.topic, 'reel');

  const contentId = await ctx.repo.upsertContent({
    workspaceId: workspace.id,
    topicHash,
    pillar,
    title: generated.result.title,
    hookLine: generated.result.hook,
    script: generated.result,
    viralityScore: generated.result.virality_score,
    ctaKeyword: args.ctaKeyword ?? 'FOSS',
    status: 'PLANNED',
  });

  const outPath = path.join(mediaRoot(), 'reels', `${contentId}.mp4`);
  const render = await renderReel({ script: generated.result, outPath, preset: args.preset ?? 'fast' });
  await ctx.repo.markContent(contentId, { status: 'RENDERED', mp4Url: `/api/v1/media/reels/${contentId}/file` });

  // Publishing needs a public HTTPS URL; never publish implicitly.
  const publish = args.publishTo
    ? { requested: args.publishTo, deferred: 'Publishing requires a public video URL and a human approval step.' }
    : null;

  log.info('mcp reel rendered', { contentId, bytes: render.bytes, provider: generated.provider });
  return {
    sideEffect: 'write',
    data: {
      contentId,
      title: generated.result.title,
      hook: generated.result.hook,
      viralityScore: generated.result.virality_score,
      gatePassed: generated.gatePassed,
      provider: generated.provider,
      render,
      downloadUrl: `${publicBaseUrl()}/api/v1/media/reels/${contentId}/file`,
      publish,
    },
  };
}

export async function draftOutreachTool(
  ctx: ToolContext,
  args: { opportunityId: string }
): Promise<ToolOutcome> {
  const draft = await createDraft(ctx.repo, ctx.gateway, args.opportunityId);
  return { sideEffect: 'write', data: draft };
}

/**
 * Sending is the one genuinely irreversible action, so it is gated behind an
 * explicit confirm flag. Without it the tool returns the exact draft for review.
 */
export async function dispatchOutreach(
  ctx: ToolContext,
  args: { opportunityId: string; subject?: string; body?: string; confirm?: boolean; dryRun?: boolean; allowResend?: boolean; mailboxEmail?: string }
): Promise<ToolOutcome> {
  const opp = await ctx.repo.getOpportunity(args.opportunityId);
  if (!opp) throw new Error(`Opportunity ${args.opportunityId} not found`);

  // Only spend a model call when the caller has not supplied the copy.
  const draft =
    args.subject?.trim() && args.body?.trim()
      ? { subject: args.subject.trim(), body: args.body.trim(), previewUrl: opp.preview_asset_url ?? '' }
      : await createDraft(ctx.repo, ctx.gateway, args.opportunityId);
  const subject = args.subject?.trim() || draft.subject;
  const body = args.body?.trim() || draft.body;

  if (!args.confirm) {
    return {
      sideEffect: 'write',
      requiresConfirmation: true,
      data: {
        requiresConfirmation: true,
        reason: 'Sending email is irreversible. Re-call with confirm: true after reviewing the draft.',
        to: opp.contact_email,
        subject,
        body,
      },
    };
  }

  const result = await sendDraft(ctx.repo, {
    opportunityId: args.opportunityId,
    subject,
    body,
    dryRun: args.dryRun !== false,
    allowResend: args.allowResend === true,
    mailboxEmail: args.mailboxEmail,
  });
  return { sideEffect: 'write', data: result };
}
