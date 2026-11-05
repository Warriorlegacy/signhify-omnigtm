import { getGateway, getRepo, readJson, withAuth } from '@/lib/api';
import { createDraft } from '@omnigtm/outbound';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: Request): Promise<Response> {
  return withAuth(async () => {
    const { opportunityId } = await readJson<{ opportunityId?: string }>(request);
    if (!opportunityId) return Response.json({ ok: false, error: 'opportunityId is required' }, { status: 400 });
    const repo = await getRepo();
    const draft = await createDraft(repo, await getGateway(repo), opportunityId);
    return Response.json({ ok: true, draft });
  });
}
