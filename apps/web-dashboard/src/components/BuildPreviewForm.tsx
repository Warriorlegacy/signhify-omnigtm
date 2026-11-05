'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function BuildPreviewForm() {
  const router = useRouter();
  const [slug, setSlug] = useState('demo');
  const [inputPath, setInputPath] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ slug: string; frameCount: number; bundleBytes: number; viewerUrl: string } | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/v1/media/render-3d-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, inputPath: inputPath.trim() || undefined }),
      });
      const json = (await res.json()) as { ok: boolean; error?: string; preview?: { slug: string; frameCount: number; bundleBytes: number; viewerUrl: string } };
      if (!res.ok || !json.ok || !json.preview) throw new Error(json.error ?? `HTTP ${res.status}`);
      setResult(json.preview);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Render failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid" style={{ gap: 12 }}>
      <div className="form-row">
        <div className="field">
          <label htmlFor="slug">Slug</label>
          <input id="slug" value={slug} onChange={(event) => setSlug(event.target.value)} placeholder="demo" required />
        </div>
        <div className="field" style={{ flex: '2 1 260px' }}>
          <label htmlFor="inputPath">Source MP4 (server path, optional)</label>
          <input id="inputPath" value={inputPath} onChange={(event) => setInputPath(event.target.value)} placeholder="C:\\media\\flythrough.mp4 — blank builds the synthetic demo" />
        </div>
        <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Slicing…' : 'Build 60 FPS preview'}</button>
      </div>
      <p className="small dim">
        8s clip → 480 WebP frames at 1280px. The viewer scroll-scrubs the frames on a canvas, so there is no Three.js
        bundle and no WebGL cost on mobile.
      </p>
      {error ? <div className="notice" data-tone="rose">{error}</div> : null}
      {result ? (
        <div className="notice" data-tone="green">
          Built <strong>{result.slug}</strong> · {result.frameCount} frames · {(result.bundleBytes / 1024 / 1024).toFixed(2)} MB.{' '}
          <a href={`/preview/${result.slug}`}><strong>Open the scroll preview →</strong></a>
        </div>
      ) : null}
    </form>
  );
}
