import { log } from '@omnigtm/core';
import { getRepo } from '@/lib/api';

export const dynamic = 'force-dynamic';

/** Public liveness probe: no secrets, no pipeline data, no driver internals. */
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
    // The probe is public. Log the driver error, return a stable message; a
    // Postgres error can otherwise disclose hosts, users and SQL fragments.
    log.error('health check failed', {
      message: error instanceof Error ? error.message : String(error),
      latencyMs: Date.now() - started,
    });
    return Response.json(
      { ok: false, error: 'database unavailable' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
