import { getRepo, readJson, withAuth } from '@/lib/api';
import { harvest } from '@omnigtm/outbound';
import type { Track } from '@omnigtm/core';
import { getGateway } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface Body {
  sources?: string[];
  track?: Track | 'BOTH';
  limitPerSource?: number;
  useLlm?: boolean;
  llmBudget?: number;
}

export async function POST(request: Request): Promise<Response> {
  return withAuth(async () => {
    const body = await readJson<Body>(request).catch(() => ({} as Body));
    const repo = await getRepo();
    const report = await harvest({
      repo,
      gateway: body.useLlm === false ? null : await getGateway(repo),
      sources: body.sources,
      track: body.track ?? 'BOTH',
      limitPerSource: Math.min(Math.max(body.limitPerSource ?? 30, 1), 100),
      useLlm: body.useLlm !== false,
      llmBudget: Math.min(Math.max(body.llmBudget ?? 6, 0), 25),
    });
    return Response.json({ ok: true, report });
  });
}
