import { discoverModels, parseBaseUrl } from '@omnigtm/ai-gateway';
import { readJson, withAuth } from '@/lib/api';

export const dynamic = 'force-dynamic';

/**
 * Probe an OpenAI-compatible gateway before saving it. The token is used for
 * this one request only and is never echoed back or logged.
 */
export async function POST(request: Request): Promise<Response> {
  return withAuth(async () => {
    const body = await readJson<{ baseUrl?: string; apiKey?: string }>(request);
    if (!body.baseUrl) return Response.json({ ok: false, error: 'baseUrl is required' }, { status: 400 });
    try {
      parseBaseUrl(body.baseUrl);
    } catch (error) {
      return Response.json({ ok: false, error: error instanceof Error ? error.message : 'Invalid baseUrl' }, { status: 400 });
    }
    const result = await discoverModels({ baseUrl: body.baseUrl, apiKey: body.apiKey });
    return Response.json(result, { status: result.ok ? 200 : 502 });
  });
}
