'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface OutreachPanelProps {
  opportunityId: string;
  company: string;
  subject: string | null;
  body: string | null;
  contactEmail: string | null;
  alreadySent: boolean;
}

/**
 * Review-before-send. The persisted draft is prefilled and editable; the real
 * send is a separate, explicit action with a confirm dialog.
 */
export function OutreachPanel({ opportunityId, company, subject, body, contactEmail, alreadySent }: OutreachPanelProps) {
  const router = useRouter();
  const [email, setEmail] = useState(contactEmail ?? '');
  const [draftSubject, setDraftSubject] = useState(subject ?? '');
  const [draftBody, setDraftBody] = useState(body ?? '');
  const [allowResend, setAllowResend] = useState(false);
  const [busy, setBusy] = useState<'email' | 'dry' | 'send' | null>(null);
  const [notice, setNotice] = useState<{ tone: 'rose' | 'green'; text: string } | null>(null);

  const hasDraft = Boolean(subject || body);
  const hasEmail = Boolean(email.trim());

  async function saveContact() {
    const value = email.trim();
    if (!value) {
      setNotice({ tone: 'rose', text: 'Enter a contact email first.' });
      return;
    }
    setBusy('email');
    setNotice(null);
    try {
      const res = await fetch(`/api/v1/opportunities/${opportunityId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactEmail: value }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string; contactEmail?: string };
      if (!res.ok || json.ok === false) throw new Error(json.error ?? `HTTP ${res.status}`);
      setEmail(json.contactEmail ?? value);
      setNotice({ tone: 'green', text: `Contact saved: ${json.contactEmail ?? value}` });
      router.refresh();
    } catch (error) {
      setNotice({ tone: 'rose', text: error instanceof Error ? error.message : 'Request failed' });
    } finally {
      setBusy(null);
    }
  }

  async function dispatch(dryRun: boolean) {
    if (!draftSubject.trim() || !draftBody.trim()) {
      setNotice({ tone: 'rose', text: 'Subject and body cannot be empty.' });
      return;
    }
    if (!dryRun && !window.confirm(`Send this email to ${email.trim() || company}? This leaves the server.`)) return;
    setBusy(dryRun ? 'dry' : 'send');
    setNotice(null);
    try {
      const res = await fetch('/api/v1/outreach/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          opportunityId,
          subject: draftSubject,
          body: draftBody,
          confirm: true,
          dryRun,
          allowResend: alreadySent ? allowResend : undefined,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string; result?: { status?: string; provider?: string } };
      if (!res.ok || json.ok === false) throw new Error(json.error ?? `HTTP ${res.status}`);
      const status = json.result?.status ?? 'DONE';
      setNotice({
        tone: status === 'FAILED' ? 'rose' : 'green',
        text: status === 'DRY_RUN' ? 'Dry run recorded — nothing left the server.' : `Relay status: ${status}${json.result?.provider ? ` via ${json.result.provider}` : ''}.`,
      });
      router.refresh();
    } catch (error) {
      setNotice({ tone: 'rose', text: error instanceof Error ? error.message : 'Request failed' });
    } finally {
      setBusy(null);
    }
  }

  if (!hasDraft) {
    return <span className="small dim">No draft yet — generate one to review and send.</span>;
  }

  return (
    <details className="outreach-panel">
      <summary className="small" style={{ cursor: 'pointer' }}>Review draft</summary>
      <div className="grid" style={{ gap: 8, marginTop: 8, minWidth: 320 }}>
        <div className="field">
          <label htmlFor={`email-${opportunityId}`}>Contact email</label>
          <div className="row" style={{ gap: 6 }}>
            <input
              id={`email-${opportunityId}`}
              type="email"
              value={email}
              maxLength={254}
              placeholder="name@company.com"
              autoComplete="email"
              onChange={(event) => setEmail(event.target.value)}
            />
            <button
              className="btn btn-sm"
              type="button"
              onClick={saveContact}
              disabled={busy !== null || !hasEmail || email.trim().toLowerCase() === (contactEmail ?? '').toLowerCase()}
            >
              {busy === 'email' ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
        <div className="field">
          <label htmlFor={`subject-${opportunityId}`}>Subject</label>
          <input
            id={`subject-${opportunityId}`}
            value={draftSubject}
            maxLength={140}
            onChange={(event) => setDraftSubject(event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor={`body-${opportunityId}`}>Body</label>
          <textarea
            id={`body-${opportunityId}`}
            value={draftBody}
            rows={8}
            maxLength={4000}
            onChange={(event) => setDraftBody(event.target.value)}
          />
        </div>
        {alreadySent ? (
          <label className="small dim" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="checkbox" checked={allowResend} onChange={(event) => setAllowResend(event.target.checked)} />
            Already emailed once — allow a deliberate follow-up
          </label>
        ) : null}
        <div className="row" style={{ gap: 6 }}>
          <button className="btn btn-sm" type="button" onClick={() => dispatch(true)} disabled={busy !== null}>
            {busy === 'dry' ? 'Recording…' : 'Dry run'}
          </button>
          <button
            className="btn btn-sm btn-danger"
            type="button"
            onClick={() => dispatch(false)}
            disabled={busy !== null || !hasEmail || (alreadySent && !allowResend)}
            title={hasEmail ? undefined : 'No contact email on this opportunity'}
          >
            {busy === 'send' ? 'Sending…' : 'Send'}
          </button>
        </div>
        {!hasEmail ? <div className="small dim">No contact email — add one above before a real send.</div> : null}
        {notice ? <div className="notice" data-tone={notice.tone}>{notice.text}</div> : null}
      </div>
    </details>
  );
}
