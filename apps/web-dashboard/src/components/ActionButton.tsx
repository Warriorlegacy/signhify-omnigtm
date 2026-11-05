'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface ActionButtonProps {
  label: string;
  path: string;
  body?: unknown;
  method?: 'POST' | 'DELETE';
  variant?: 'primary' | 'ghost' | 'danger';
  size?: 'sm';
  confirmText?: string;
  onDone?: string;
}

/** One reusable mutation button: posts JSON, surfaces the response, refreshes data. */
export function ActionButton({ label, path, body, method = 'POST', variant, size, confirmText, onDone }: ActionButtonProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(path, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || json.ok === false) throw new Error(json.error ?? `HTTP ${res.status}`);
      setResult(json);
      router.refresh();
      if (onDone) window.location.assign(onDone);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  }

  const className = ['btn', size === 'sm' ? 'btn-sm' : '', variant === 'primary' ? 'btn-primary' : variant === 'danger' ? 'btn-danger' : variant === 'ghost' ? 'btn-ghost' : '']
    .filter(Boolean)
    .join(' ');

  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 8, maxWidth: '100%' }}>
      <button type="button" className={className} onClick={run} disabled={busy}>
        {busy ? 'Working…' : label}
      </button>
      {error ? <span className="notice" data-tone="rose" style={{ fontSize: 12 }}>{error}</span> : null}
      {result ? (
        <details>
          <summary className="small dim" style={{ cursor: 'pointer' }}>Result</summary>
          <pre className="pre" style={{ marginTop: 8 }}>{JSON.stringify(result, null, 2)}</pre>
        </details>
      ) : null}
    </span>
  );
}
