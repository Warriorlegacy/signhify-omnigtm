import { ValidationError } from '@omnigtm/core';
import { getRepo, readJson, withAuth } from '@/lib/api';
import { normaliseEmail } from '@/lib/email';

export const dynamic = 'force-dynamic';

/**
 * Manual contact entry. There is no enrichment provider, and a real send needs a
 * recipient, so the operator has to be able to attach one from the dashboard.
 */
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  return withAuth(async () => {
    const { id } = await context.params;
    const payload = await readJson<{ contactEmail?: unknown }>(request);
    const email = normaliseEmail(payload.contactEmail);
    if (!email) throw new ValidationError('contactEmail must be a valid email address');

    const repo = await getRepo();
    const opp = await repo.getOpportunity(id);
    if (!opp) return Response.json({ ok: false, error: 'Opportunity not found' }, { status: 404 });

    await repo.updateOpportunityStage(id, opp.stage, { contactEmail: email });
    return Response.json({ ok: true, contactEmail: email });
  });
}
