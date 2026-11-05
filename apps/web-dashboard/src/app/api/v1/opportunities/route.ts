import { getRepo, withAuth } from '@/lib/api';
import type { Stage, Track } from '@omnigtm/core';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  return withAuth(async () => {
    const url = new URL(request.url);
    const repo = await getRepo();
    const rows = await repo.listOpportunities({
      track: (url.searchParams.get('track') as Track) || undefined,
      stage: (url.searchParams.get('stage') as Stage) || undefined,
      minScore: url.searchParams.has('minScore') ? Number(url.searchParams.get('minScore')) : undefined,
      q: url.searchParams.get('q') ?? undefined,
      limit: Number(url.searchParams.get('limit') ?? 50),
      offset: Number(url.searchParams.get('offset') ?? 0),
    });
    return Response.json({ ok: true, count: rows.length, opportunities: rows });
  });
}
