import { getRepo, readJson, withAuth } from '@/lib/api';
import { sendDraft } from '@omnigtm/outbound';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface Body {
  opportunityId?: string;
  subject?: string;
  body?: string;
  confirm?: boolean;
  dryRun?: boolean;
  allowResend?: boolean;
  mailboxEmail?: string;
}

/**
 * Irreversible endpoint. `confirm: true` is mandatory even for a dry run, so a
 * stray click or an over-eager agent cannot send mail by accident.
 */
export async function POST(request: Request): Promise<Response> {
  return withAuth(async () => {
    const payload = await readJson<Body>(request);
    if (!payload.opportunityId) return Response.json({ ok: false, error: 'opportunityId is required' }, { status: 400 });
    if (payload.confirm !== true) {
      return Response.json({ ok: false, error: 'confirm: true is required to dispatch outreach' }, { status: 428 });
    }
    const repo = await getRepo();
    const result = await sendDraft(repo, {
      opportunityId: payload.opportunityId,
      subject: payload.subject,
      body: payload.body,
      dryRun: payload.dryRun !== false,
      allowResend: payload.allowResend === true,
      mailboxEmail: payload.mailboxEmail,
    });
    return Response.json({ ok: result.status !== 'FAILED', result });
  });
}
