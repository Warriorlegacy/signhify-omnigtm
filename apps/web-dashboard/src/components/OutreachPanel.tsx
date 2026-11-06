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
  const [draftSubject, setDraftSubject] = useState(subject ?? '');
  const [draftBody, setDraftBody] = useState(body ?? '');
  const [allowResend, setAllowResend] = useState(false);
  const [busy, setBusy] = useState<'dry' | 'send' | null>(null);
  const [notice, setNotice] = useState<{ tone: 'rose' | 'green'; text: string } | null>(null);

  const hasDraft = Boolean(subject || body);

  async function dispatch(dryRun: boolean) {
    if (!draftSubject.trim() || !draftBody.trim()) {
      setNotice({ tone: 'rose', text: 'Subject and body cannot be empty.' });
      return;
    }
    if (!dryRun && !window.confirm(`Send this email to ${contactEmail ?? company}? This leaves the server.`)) return;
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
            disabled={busy !== null || !contactEmail || (alreadySent && !allowResend)}
            title={contactEmail ? undefined : 'No contact email on this opportunity'}
          >
            {busy === 'send' ? 'Sending…' : 'Send'}
          </button>
        </div>
        {!contactEmail ? <div className="small dim">No contact email — enrich this lead before a real send.</div> : null}
        {notice ? <div className="notice" data-tone={notice.tone}>{notice.text}</div> : null}
      </div>
    </details>
  );
}
