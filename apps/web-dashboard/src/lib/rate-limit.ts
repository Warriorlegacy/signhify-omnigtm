/**
 * Fixed-window rate limiter for the login endpoint.
 *
 * ponytail: in-process Map, so it resets on deploy and is per-instance. The free
 * Render service runs one instance; a second instance or a real brute-force
 * threat needs a shared store (Postgres or Redis) behind the same interface.
 */
interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
const MAX_TRACKED_KEYS = 10_000;

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

/** Render overwrites X-Forwarded-For; fall back cleanly for local runs. */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]?.trim() || 'unknown';
  return request.headers.get('x-real-ip')?.trim() || 'unknown';
}

export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  if (buckets.size > MAX_TRACKED_KEYS) {
    for (const [candidate, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(candidate);
    }
  }

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: Math.max(0, limit - 1), retryAfterSeconds: 0 };
  }

  bucket.count += 1;
  if (bucket.count > limit) {
    return { ok: false, remaining: 0, retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) };
  }
  return { ok: true, remaining: Math.max(0, limit - bucket.count), retryAfterSeconds: 0 };
}

/** A successful login should not leave the caller's window half-consumed. */
export function clearRateLimit(key: string): void {
  buckets.delete(key);
}
