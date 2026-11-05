import { createWriteStream, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { loadEnvFiles } from '@omnigtm/core';
import { createDemoPreview, sliceVideo } from '../preview.js';

loadEnvFiles();

function arg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  return idx === -1 ? undefined : process.argv[idx + 1];
}

async function download(url: string, out: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`Download failed: HTTP ${res.status}`);
  mkdirSync(path.dirname(out), { recursive: true });
  await pipeline(Readable.fromWeb(res.body as never), createWriteStream(out));
  return out;
}

async function main(): Promise<void> {
  if (process.argv.includes('--demo')) {
    const result = await createDemoPreview(arg('slug') ?? 'demo');
    console.log(JSON.stringify(result.manifest, null, 2));
    return;
  }
  const input = arg('input');
  const slug = arg('slug');
  if (!input || !slug) throw new Error('Usage: preview --input <file|url> --slug <slug> [--fps 60] [--width 1280]  (or --demo)');
  let sourcePath = input;
  if (/^https?:\/\//.test(input)) {
    sourcePath = await download(input, path.join(process.cwd(), '.data', 'downloads', `${slug}.mp4`));
  }
  if (!existsSync(sourcePath)) throw new Error(`Input not found: ${sourcePath}`);
  const result = await sliceVideo({
    inputPath: sourcePath,
    slug,
    fps: Number(arg('fps') ?? 60),
    width: Number(arg('width') ?? 1280),
    quality: Number(arg('quality') ?? 80),
  });
  console.log(JSON.stringify(result.manifest, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
