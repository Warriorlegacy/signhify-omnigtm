'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function ReelForm() {
  const router = useRouter();
  const [topic, setTopic] = useState('The $0 stack that replaced Clay, Instantly and Creatomate');
  const [pillar, setPillar] = useState('Zero-Burn FOSS Replacements');
  const [preset, setPreset] = useState<'fast' | 'full'>('fast');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ contentId: string; title: string; viralityScore: number; gatePassed: boolean; provider: string; downloadUrl: string } | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/v1/media/reels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, pillar, preset }),
      });
      const json = (await res.json()) as { ok: boolean; error?: string; reel?: { contentId: string; title: string; viralityScore: number; gatePassed: boolean; provider: string; downloadUrl: string } };
      if (!res.ok || !json.ok || !json.reel) throw new Error(json.error ?? `HTTP ${res.status}`);
      setResult(json.reel);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Render failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid" style={{ gap: 12 }}>
      <div className="field">
        <label htmlFor="topic">Topic</label>
        <input id="topic" value={topic} onChange={(event) => setTopic(event.target.value)} required minLength={4} />
      </div>
      <div className="form-row">
        <div className="field">
          <label htmlFor="pillar">Pillar</label>
          <input id="pillar" value={pillar} onChange={(event) => setPillar(event.target.value)} />
        </div>
        <div className="field" style={{ flex: '0 0 200px' }}>
          <label htmlFor="preset">Preset</label>
          <select id="preset" value={preset} onChange={(event) => setPreset(event.target.value as 'fast' | 'full')}>
            <option value="fast">Fast · 720×1280 @30fps · 15s</option>
            <option value="full">Full · 1080×1920 @60fps · 45s</option>
          </select>
        </div>
        <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Rendering…' : 'Render reel'}</button>
      </div>
      {error ? <div className="notice" data-tone="rose">{error}</div> : null}
      {result ? (
        <div className="notice" data-tone={result.gatePassed ? 'green' : 'rose'}>
          <strong>{result.title}</strong> · virality {result.viralityScore}/100 · gate {result.gatePassed ? 'passed' : 'failed'} · {result.provider}.{' '}
          <a href={result.downloadUrl}><strong>Download MP4 →</strong></a>
        </div>
      ) : null}
      <p className="small dim">
        Publishing is never implicit: a reel has to clear the virality gate and a human has to approve the upload.
      </p>
    </form>
  );
}
