import { getGateway, getRepo, withAuth } from '@/lib/api';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  return withAuth(async () => {
    const repo = await getRepo();
    const gateway = await getGateway(repo);
    const [usage, stats] = await Promise.all([repo.usageByProvider(7), repo.stats()]);
    return Response.json({
      ok: true,
      providers: gateway.health(),
      usage,
      stats: {
        llmCalls: stats.llmCalls,
        cacheHits: stats.llmCacheHits,
        avgLatencyMs: stats.llmAvgLatencyMs,
      },
    });
  });
}
