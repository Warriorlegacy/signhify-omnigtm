import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { dirSize, ensureFfmpeg, probeVideo, runCommand } from './ffmpeg.js';
import { statePath } from '@omnigtm/core';

export interface PreviewManifest {
  slug: string;
  fps: number;
  frameCount: number;
  width: number;
  height: number;
  bundleBytes: number;
  framePattern: string;
  generatedAt: string;
  source: string;
}

export interface SliceResult {
  slug: string;
  framesDir: string;
  manifest: PreviewManifest;
}

export function mediaRoot(): string {
  return statePath(process.env.OMNIGTM_MEDIA_DIR, 'previews');
}

export function previewDir(slug: string): string {
  return path.join(mediaRoot(), slug);
}

export function framesDir(slug: string): string {
  return path.join(previewDir(slug), 'frames');
}

export function frameFile(slug: string, index: number): string {
  const padded = String(index).padStart(4, '0');
  return path.join(framesDir(slug), `frame_${padded}.webp`);
}

export function readManifest(slug: string): PreviewManifest | null {
  const file = path.join(previewDir(slug), 'manifest.json');
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as PreviewManifest;
  } catch {
    return null;
  }
}

/**
 * 8s MP4 -> 60 FPS progressive WebP frames.
 * 60 * 8 = 480 frames at 1280px is roughly 4 MB, which is the whole point:
 * a scroll-scrubbed "3D" experience with no WebGL bundle.
 */
export async function sliceVideo(input: {
  inputPath: string;
  slug: string;
  fps?: number;
  width?: number;
  quality?: number;
  maxFrames?: number;
}): Promise<SliceResult> {
  await ensureFfmpeg();
  const { inputPath, slug, fps = 60, width = 1280, quality = 80, maxFrames = 600 } = input;
  if (!existsSync(inputPath)) throw new Error(`Source video not found: ${inputPath}`);

  const outDir = framesDir(slug);
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  const probe = await probeVideo(inputPath);
  const outPattern = path.join(outDir, 'frame_%04d.webp');
  await runCommand(
    'ffmpeg',
    [
      '-y',
      '-v',
      'error',
      '-i',
      inputPath,
      '-vf',
      `fps=${fps},scale=${width}:-2`,
      '-c:v',
      'libwebp',
      '-quality',
      String(quality),
      '-compression_level',
      '6',
      '-frames:v',
      String(maxFrames),
      outPattern,
    ],
    600_000
  );

  const { bytes, files } = dirSize(outDir);
  if (files === 0) throw new Error('FFmpeg produced no frames — check the source video codec.');

  const manifest: PreviewManifest = {
    slug,
    fps,
    frameCount: files,
    width,
    height: Math.round((probe.height / probe.width) * width) || probe.height,
    bundleBytes: bytes,
    framePattern: 'frame_%04d.webp',
    generatedAt: new Date().toISOString(),
    source: path.basename(inputPath),
  };
  writeFileSync(path.join(previewDir(slug), 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
  return { slug, framesDir: outDir, manifest };
}

/** Synthetic demo clip so a fresh install has a working preview with zero assets. */
export async function createDemoPreview(slug = 'demo'): Promise<SliceResult> {
  await ensureFfmpeg();
  const dir = previewDir(slug);
  mkdirSync(dir, { recursive: true });
  const source = path.join(dir, 'source.mp4');
  if (!existsSync(source)) {
    await runCommand(
      'ffmpeg',
      [
        '-y',
        '-v',
        'error',
        '-f',
        'lavfi',
        '-i',
        'gradients=s=1280x720:d=8:speed=0.035:c0=0x090D16:c1=0x1E3A8A:c2=0x06B6D4:c3=0x111827:n=4:type=spiral',
        '-vf',
        'format=yuv420p',
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-crf',
        '22',
        source,
      ],
      180_000
    );
  }
  return sliceVideo({ inputPath: source, slug, fps: 60, width: 1280, quality: 78, maxFrames: 480 });
}
