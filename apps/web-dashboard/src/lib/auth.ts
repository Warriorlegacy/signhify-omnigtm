import { createHash } from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ConfigurationError, isOfflineTest, optionalSecret, safeEqual } from '@omnigtm/core';

export const SESSION_COOKIE = 'omnigtm_session';

export function sessionValue(token: string): string {
  return createHash('sha256').update(`omnigtm-session:${token}`).digest('hex');
}

export function dashboardToken(): string | null {
  return optionalSecret('OMNIGTM_DASHBOARD_TOKEN') ?? null;
}

/** True when the caller presented the dashboard token. */
export async function hasSession(): Promise<boolean> {
  const token = dashboardToken();
  // Fail closed: only the offline test harness runs without a token. A missing
  // token must never depend on NODE_ENV being spelled exactly 'production'.
  if (!token) return isOfflineTest();
  const cookie = (await cookies()).get(SESSION_COOKIE)?.value;
  return Boolean(cookie) && safeEqual(cookie as string, sessionValue(token));
}

/**
 * Page guard. A missing token is a configuration error, not an open door -
 * mutations and pipeline data must never be public by accident.
 */
export async function requireSessionPage(): Promise<void> {
  if (process.env.NEXT_PHASE === 'phase-production-build') return;
  if (!dashboardToken() && !isOfflineTest()) {
    throw new ConfigurationError('OMNIGTM_DASHBOARD_TOKEN must be set.');
  }
  if (!(await hasSession())) redirect('/login?next=/');
}

export class UnauthorizedError extends Error {
  constructor() {
    super('Unauthorized');
    this.name = 'UnauthorizedError';
  }
}

/** API guard - throws UnauthorizedError which the route wrapper turns into a 401. */
export async function requireSessionApi(): Promise<void> {
  if (process.env.NEXT_PHASE === 'phase-production-build') return;
  if (!dashboardToken() && !isOfflineTest()) {
    throw new ConfigurationError('OMNIGTM_DASHBOARD_TOKEN must be set.');
  }
  if (!(await hasSession())) throw new UnauthorizedError();
}
