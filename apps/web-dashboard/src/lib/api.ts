import { Repo, log } from '@omnigtm/core';
import { createGateway, type AiGateway } from '@omnigtm/ai-gateway';
import { ConfigurationError, ValidationError } from '@omnigtm/core';
import { requireSessionApi, UnauthorizedError } from './auth';

let repoPromise: Promise<Repo> | null = null;

export async function getRepo(): Promise<Repo> {
  if (!repoPromise) repoPromise = Repo.open();
  return repoPromise;
}

export async function getGateway(repo?: Repo): Promise<AiGateway> {
  return createGateway(repo ?? (await getRepo()));
}

/** Uniform JSON error envelope for every API route. */
export function apiError(error: unknown, status = 500): Response {
  const message = error instanceof Error ? error.message : String(error);
  log.warn('api error', { message: message.slice(0, 240), status });
  return Response.json({ ok: false, error: message }, { status });
}

export async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new Error('Request body must be valid JSON');
  }
}

/** Auth wrapper for API routes: 401 for a missing session, 500 for config errors. */
export async function withAuth(fn: () => Promise<Response>): Promise<Response> {
  try {
    await requireSessionApi();
    return await fn();
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return Response.json({ ok: false, error: 'Unauthorized - sign in at /login' }, { status: 401 });
    }
    if (error instanceof ValidationError) return apiError(error, 400);
    if (error instanceof ConfigurationError) return apiError(error, 500);
    return apiError(error);
  }
}
