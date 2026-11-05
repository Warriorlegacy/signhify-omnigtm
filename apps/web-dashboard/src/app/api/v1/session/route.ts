import { ConfigurationError, optionalSecret, safeEqual } from '@omnigtm/core';
import { SESSION_COOKIE, sessionValue } from '@/lib/auth';
import { apiError, readJson } from '@/lib/api';

export const dynamic = 'force-dynamic';

/** Login: exchange the dashboard token for an httpOnly session cookie. */
export async function POST(request: Request): Promise<Response> {
  try {
    const expected = optionalSecret('OMNIGTM_DASHBOARD_TOKEN');
    if (!expected) {
      if (process.env.NODE_ENV === 'production') {
        throw new ConfigurationError('OMNIGTM_DASHBOARD_TOKEN is not configured on the server.');
      }
      return Response.json({ ok: true, mode: 'dev-open' });
    }
    const { token } = await readJson<{ token?: string }>(request);
    if (!token || !safeEqual(token, expected)) {
      return Response.json({ ok: false, error: 'Invalid dashboard token' }, { status: 401 });
    }
    const response = Response.json({ ok: true });
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    response.headers.append(
      'Set-Cookie',
      `${SESSION_COOKIE}=${sessionValue(expected)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=43200${secure}`
    );
    return response;
  } catch (error) {
    return apiError(error, error instanceof ConfigurationError ? 500 : 400);
  }
}

export async function DELETE(): Promise<Response> {
  const response = Response.json({ ok: true });
  response.headers.append('Set-Cookie', `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
  return response;
}
