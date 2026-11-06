import { ConfigurationError, isOfflineTest, optionalSecret, safeEqual } from '@omnigtm/core';
import { SESSION_COOKIE, sessionValue } from '@/lib/auth';
import { apiError, readJson } from '@/lib/api';
import { clearRateLimit, clientIp, rateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

/** 10 failed/attempted logins per IP per 15 minutes. */
const LOGIN_LIMIT = 10;
const LOGIN_WINDOW_MS = 15 * 60_000;

/** Login: exchange the dashboard token for an httpOnly session cookie. */
export async function POST(request: Request): Promise<Response> {
  const ip = clientIp(request);
  const key = `login:${ip}`;
  const gate = rateLimit(key, LOGIN_LIMIT, LOGIN_WINDOW_MS);
  if (!gate.ok) {
    return Response.json(
      { ok: false, error: 'Too many login attempts. Try again later.' },
      { status: 429, headers: { 'Retry-After': String(gate.retryAfterSeconds), 'Cache-Control': 'no-store' } }
    );
  }

  try {
    const expected = optionalSecret('OMNIGTM_DASHBOARD_TOKEN');
    // Same fail-closed rule as hasSession(): only the offline harness may run
    // without a token. A non-production deploy must not open itself.
    if (!expected) {
      if (isOfflineTest()) return Response.json({ ok: true, mode: 'offline-test' });
      throw new ConfigurationError('OMNIGTM_DASHBOARD_TOKEN is not configured on the server.');
    }
    const { token } = await readJson<{ token?: string }>(request);
    if (!token || !safeEqual(token, expected)) {
      return Response.json({ ok: false, error: 'Invalid dashboard token' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
    }
    clearRateLimit(key);
    const response = Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    response.headers.append(
      'Set-Cookie',
      `${SESSION_COOKIE}=${sessionValue(expected)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=43200${secure}`
    );
    return response;
  } catch (error) {
    return apiError(error, error instanceof ConfigurationError ? 503 : 400);
  }
}

export async function DELETE(): Promise<Response> {
  const response = Response.json({ ok: true });
  response.headers.append('Set-Cookie', `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
  return response;
}
