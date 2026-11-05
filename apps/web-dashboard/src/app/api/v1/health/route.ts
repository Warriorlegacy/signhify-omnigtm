import { getRepo } from '@/lib/api';

export const dynamic = 'force-dynamic';

/** Public liveness probe: no secrets, no pipeline data. */
export async function GET(): Promise<Response> {
  const started = Date.now();
  try {
    const repo = await getRepo();
    const heartbeat = await repo.heartbeat();
    return Response.json(
      {
        ok: true,
        service: 'signhify-omnigtm',
        version: '1.0.0',
        dialect: repo.dialect,
        heartbeat: heartbeat?.last_ping_at ?? null,
        uptimeMs: Math.round(process.uptime() * 1000),
        latencyMs: Date.now() - started,
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : 'unknown' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
