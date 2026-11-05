'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function LoginPage() {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      router.replace('/');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-card card">
        <div className="brand" style={{ marginBottom: 20 }}>
          <div className="brand-mark">S</div>
          <div>
            <div className="brand-name">Signhify OmniGTM</div>
            <div className="brand-sub">Operator access</div>
          </div>
        </div>
        <p className="muted small" style={{ marginBottom: 18 }}>
          Paste the dashboard token from <span className="mono">OMNIGTM_DASHBOARD_TOKEN</span>. It is stored as an
          httpOnly session cookie and never sent to a third party.
        </p>
        <form onSubmit={submit} className="grid">
          <div className="field">
            <label htmlFor="token">Dashboard token</label>
            <input
              id="token"
              type="password"
              autoComplete="current-password"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              placeholder="••••••••••••••••"
              required
            />
          </div>
          {error ? <div className="notice" data-tone="rose">{error}</div> : null}
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? 'Verifying…' : 'Enter dashboard'}
          </button>
        </form>
      </div>
    </div>
  );
}
