import { Repo, ValidationError, publicBaseUrl, type Opportunity } from '@omnigtm/core';
import { draftOutreach, type AiGateway } from '@omnigtm/ai-gateway';
import { dispatchEmail, loadMailboxes, selectMailbox } from './relay.js';

export interface DraftResult {
  opportunityId: string;
  subject: string;
  body: string;
  provider: string;
  repaired: boolean;
  previewUrl: string;
}

export async function createDraft(repo: Repo, gateway: AiGateway, opportunityId: string): Promise<DraftResult> {
  const opp = await repo.getOpportunity(opportunityId);
  if (!opp) throw new Error(`Opportunity ${opportunityId} not found`);
  const previewUrl = opp.preview_asset_url ?? `${publicBaseUrl()}/preview/demo`;
  const draft = await draftOutreach(gateway, {
    companyName: opp.company_name,
    roleTitle: opp.role_title,
    sourceText: `${opp.description_snippet}\n${opp.pain_point_summary}\nSource: ${opp.source_url}`,
    previewUrl,
    track: opp.track,
    contactName: opp.decision_maker_name,
  });
  // Persist before the stage change: the review screen and the send endpoint
  // must use the same bytes that the model produced.
  await repo.saveDraft(opp.id, draft.result.subject, draft.result.body);
  await repo.updateOpportunityStage(opp.id, 'DRAFT_READY', { previewAssetUrl: previewUrl });
  return {
    opportunityId: opp.id,
    subject: draft.result.subject,
    body: draft.result.body,
    provider: draft.provider,
    repaired: draft.repaired,
    previewUrl,
  };
}

export interface SendResult {
  status: string;
  mailbox: string | null;
  provider: string;
  error?: string;
}

export async function sendDraft(
  repo: Repo,
  input: { opportunityId: string; subject?: string; body?: string; dryRun: boolean; mailboxEmail?: string; allowResend?: boolean }
): Promise<SendResult> {
  const opp: Opportunity | undefined = await repo.getOpportunity(input.opportunityId);
  if (!opp) throw new Error(`Opportunity ${input.opportunityId} not found`);
  if (!opp.contact_email) throw new Error('Opportunity has no contact email — enrich it before sending.');

  // Callers may send the copy explicitly (edited in the UI) or omit it and let
  // the persisted draft be used. Never send an empty message.
  const subject = input.subject?.trim() || opp.draft_subject?.trim() || '';
  const body = input.body?.trim() || opp.draft_body?.trim() || '';
  if (!subject || !body) {
    throw new ValidationError('No draft on this opportunity. Generate one first or pass subject and body.');
  }

  // A retry or a double-click must not mail the same person twice. Dry runs are
  // excluded because they never leave the building.
  if (!input.dryRun && !input.allowResend && (await repo.hasSentOutreach(opp.id))) {
    throw new ValidationError('This opportunity already received a real email. Pass allowResend: true for a deliberate follow-up.');
  }

  const mailboxes = loadMailboxes();
  if (input.mailboxEmail) {
    const chosen = mailboxes.find((m) => m.email === input.mailboxEmail);
    if (!chosen) throw new Error(`Mailbox ${input.mailboxEmail} is not configured in OMNIGTM_MAILBOXES`);
    const result = await dispatchEmail(repo, chosen, { to: opp.contact_email, subject, body }, input.dryRun);
    return record(repo, opp, { subject, body }, result);
  }

  if (mailboxes.length === 0) {
    if (!input.dryRun) throw new Error('No mailboxes configured. Set OMNIGTM_MAILBOXES or BREVO_FROM_EMAIL, or use dryRun.');
    const result = await dispatchEmail(repo, { email: 'dry-run@local', provider: 'BREVO_SMTP', dailyCap: 1 }, { to: opp.contact_email, subject, body }, true);
    return record(repo, opp, { subject, body }, result);
  }

  const mailbox = await selectMailbox(repo, mailboxes);
  if (!mailbox) throw new Error('All mailboxes reached their daily cap. Raise a cap or wait for the next UTC day.');
  const result = await dispatchEmail(repo, mailbox, { to: opp.contact_email, subject, body }, input.dryRun);
  return record(repo, opp, { subject, body }, result);
}

async function record(
  repo: Repo,
  opp: Opportunity,
  input: { subject: string; body: string },
  result: { status: string; mailbox: string | null; provider: string; messageId?: string; error?: string }
): Promise<SendResult> {
  await repo.insertOutreach({
    opportunityId: opp.id,
    senderMailbox: result.mailbox ?? 'none',
    relayProvider:
      result.status === 'DRY_RUN'
        ? 'DRY_RUN'
        : result.provider === 'GMAIL_OAUTH'
          ? 'GMAIL_OAUTH'
          : result.provider === 'BREVO_HTTP'
            ? 'BREVO_HTTP'
            : 'BREVO_SMTP',
    subject: input.subject,
    bodyText: input.body,
    messageIdHeader: result.messageId ?? null,
    status: result.status,
    error: result.error ?? null,
  });
  if (result.status === 'SENT') {
    await repo.updateOpportunityStage(opp.id, 'SENT');
  }
  return { status: result.status, mailbox: result.mailbox, provider: result.provider, error: result.error };
}
