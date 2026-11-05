import { addEndpoint, listEndpoints, removeEndpoint } from '@omnigtm/ai-gateway';
import { getRepo, readJson, withAuth } from '@/lib/api';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  return withAuth(async () => {
    const repo = await getRepo();
    return Response.json({ ok: true, endpoints: await listEndpoints(repo) });
  });
}

export async function POST(request: Request): Promise<Response> {
  return withAuth(async () => {
    const body = await readJson<{ label?: string; baseUrl?: string; model?: string; apiKey?: string; priority?: number }>(request);
    if (!body.label || !body.baseUrl) {
      return Response.json({ ok: false, error: 'label and baseUrl are required' }, { status: 400 });
    }
    const repo = await getRepo();
    const endpoint = await addEndpoint(repo, {
      label: body.label,
      baseUrl: body.baseUrl,
      model: body.model ?? 'auto',
      apiKey: body.apiKey,
      priority: body.priority,
    });
    return Response.json({ ok: true, endpoint: { ...endpoint, apiKey: undefined, hasKey: Boolean(endpoint.apiKey) } });
  });
}

export async function DELETE(request: Request): Promise<Response> {
  return withAuth(async () => {
    const id = new URL(request.url).searchParams.get('id');
    if (!id) return Response.json({ ok: false, error: 'id query parameter is required' }, { status: 400 });
    const repo = await getRepo();
    const removed = await removeEndpoint(repo, id);
    return Response.json({ ok: removed, error: removed ? undefined : 'Endpoint not found' }, { status: removed ? 200 : 404 });
  });
}
