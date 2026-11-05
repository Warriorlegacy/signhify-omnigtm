'use client';

import { useEffect, useRef, useState } from 'react';

interface ScrollPreviewProps {
  slug: string;
  frameCount: number;
  width: number;
  height: number;
  fps: number;
  title?: string;
  subtitle?: string;
}

const frameUrl = (slug: string, index: number) => `/api/v1/media/frames/${slug}/frame_${String(index).padStart(4, '0')}.webp`;

/**
 * Scroll-scrubbed frame player. The whole "3D" effect is a canvas plus a
 * preloaded window of WebP frames - no WebGL context, no Three.js download.
 */
export function ScrollPreview({ slug, frameCount, width, height, fps, title, subtitle }: ScrollPreviewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const railRef = useRef<HTMLSpanElement>(null);
  const cache = useRef(new Map<number, HTMLImageElement>());
  const current = useRef(-1);
  const [reduced, setReduced] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(media.matches);
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;

    const image = (index: number): HTMLImageElement => {
      const cached = cache.current.get(index);
      if (cached) return cached;
      const img = new Image();
      img.decoding = 'async';
      img.src = frameUrl(slug, index);
      cache.current.set(index, img);
      return img;
    };

    const draw = (index: number) => {
      const img = image(index);
      if (!img.complete) {
        img.addEventListener('load', () => draw(index), { once: true });
        return;
      }
      if (index !== current.current) {
        ctx.drawImage(img, 0, 0, width, height);
        current.current = index;
      }
    };

    // Keep a moving window of frames decoded so scrubbing never shows a gap.
    const preload = (index: number) => {
      for (let offset = -12; offset <= 24; offset += 1) {
        const target = index + offset;
        if (target >= 1 && target <= frameCount) image(target);
      }
      if (cache.current.size > 160) {
        const keep = new Set<number>();
        for (let offset = -12; offset <= 24; offset += 1) keep.add(index + offset);
        for (const key of [...cache.current.keys()]) if (!keep.has(key)) cache.current.delete(key);
      }
    };

    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const el = scrollRef.current;
        if (!el) return;
        const max = el.scrollHeight - el.clientHeight;
        const progress = max > 0 ? Math.min(1, Math.max(0, el.scrollTop / max)) : 0;
        const index = 1 + Math.round(progress * (frameCount - 1));
        draw(index);
        preload(index);
        if (railRef.current) railRef.current.style.height = `${Math.round(progress * 100)}%`;
      });
    };

    draw(1);
    preload(1);
    setReady(true);
    const el = scrollRef.current;
    el?.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => {
      el?.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(raf);
    };
  }, [slug, frameCount, width, height]);

  if (reduced) {
    return (
      <div className="preview-static">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={frameUrl(slug, 1)} alt={title ?? 'Static preview frame'} />
        <div className="preview-overlay">
          <h1>{title ?? 'Scroll-reactive 3D preview'}</h1>
          <p>{subtitle ?? `Reduced motion enabled - showing a single frame from a ${frameCount}-frame ${fps} FPS sequence.`}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="preview-shell">
      <div className="preview-scroll" ref={scrollRef}>
        <div className="preview-track">
          <div className="preview-stage">
            <canvas ref={canvasRef} className="preview-canvas" aria-label={title ?? 'Scroll-scrubbed 3D preview'} />
            <div className="preview-hint">Scroll to scrub · {frameCount} frames</div>
            <div className="preview-overlay">
              <h1>{title ?? 'Scroll-reactive 3D preview'}</h1>
              <p>{subtitle ?? `${frameCount} WebP frames at ${fps} FPS · ${width}×${height} · zero WebGL bundle`}</p>
            </div>
          </div>
        </div>
      </div>
      <div className="preview-rail" aria-hidden="true"><span ref={railRef} style={{ height: '0%' }} /></div>
      {ready ? null : <div className="preview-hint" style={{ left: 26, right: 'auto' }}>Loading frames…</div>}
    </div>
  );
}
