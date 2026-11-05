import { mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ensureFfmpeg, escapeFilterValue, findFont, runCommand, wrapText } from './ffmpeg.js';

export interface ReelScript {
  title: string;
  hook: string;
  beats: string[];
  cta: string;
}

export type ReelPreset = 'full' | 'fast';

export interface RenderResult {
  outPath: string;
  preset: ReelPreset;
  width: number;
  height: number;
  fps: number;
  durationS: number;
  bytes: number;
  audio: boolean;
}

interface PresetConfig {
  width: number;
  height: number;
  fps: number;
  duration: number;
  hook: [number, number];
  beatsStart: number;
  beatGap: number;
  beatHold: number;
  terminal: [number, number];
  cta: [number, number];
  hookSize: number;
  beatSize: number;
  ctaSize: number;
  wrap: number;
}

const PRESETS: Record<ReelPreset, PresetConfig> = {
  full: {
    width: 1080,
    height: 1920,
    fps: 60,
    duration: 45,
    hook: [0.2, 4.4],
    beatsStart: 5,
    beatGap: 2.6,
    beatHold: 2.3,
    terminal: [18, 35],
    cta: [35, 44.6],
    hookSize: 66,
    beatSize: 40,
    ctaSize: 54,
    wrap: 26,
  },
  fast: {
    width: 720,
    height: 1280,
    fps: 30,
    duration: 15,
    hook: [0.2, 3],
    beatsStart: 3,
    beatGap: 1.8,
    beatHold: 1.6,
    terminal: [7.5, 11],
    cta: [11, 14.6],
    hookSize: 46,
    beatSize: 28,
    ctaSize: 36,
    wrap: 32,
  },
};

function textFile(dir: string, name: string, content: string): string {
  const file = path.join(dir, `${name}.txt`);
  writeFileSync(file, content.replace(/\r/g, ''), 'utf8');
  return file;
}

function drawText(options: {
  font: string;
  file: string;
  color: string;
  size: number;
  y: number;
  from: number;
  to: number;
}): string {
  return [
    `drawtext=fontfile='${escapeFilterValue(options.font)}'`,
    `textfile='${escapeFilterValue(options.file)}'`,
    `fontcolor=${options.color}`,
    `fontsize=${options.size}`,
    'x=(w-text_w)/2',
    `y=${options.y}`,
    `enable='between(t,${options.from},${options.to})'`,
  ].join(':');
}

/**
 * One drawtext per line. Multi-line textfile rendering is inconsistent across
 * FFmpeg builds (a newline can come out as a missing-glyph box), so lines are
 * laid out explicitly.
 */
function drawBlock(options: {
  dir: string;
  name: string;
  font: string;
  text: string;
  color: string;
  size: number;
  y: number;
  from: number;
  to: number;
  lineHeight?: number;
}): string[] {
  const lines = options.text.split('\n').filter((line) => line.length > 0);
  return lines.map((line, index) =>
    drawText({
      font: options.font,
      file: textFile(options.dir, `${options.name}_${index}`, line),
      color: options.color,
      size: options.size,
      y: Math.round(options.y + index * (options.lineHeight ?? options.size * 1.35)),
      from: options.from,
      to: options.to,
    })
  );
}

/**
 * FFmpeg-first reel renderer: no Remotion licence, no headless Chrome, no render
 * farm. The optional React/Remotion composition lives in ./remotion.
 */
export async function renderReel(input: {
  script: ReelScript;
  outPath: string;
  preset?: ReelPreset;
  audioPath?: string;
  workDir?: string;
}): Promise<RenderResult> {
  await ensureFfmpeg();
  const preset = PRESETS[input.preset ?? 'full'];
  const font = findFont();
  if (!font) throw new Error('No usable font found. Set OMNIGTM_FONT_FILE to a .ttf path.');

  const workDir = input.workDir ?? path.join(os.tmpdir(), `omnigtm-reel-${Date.now()}`);
  mkdirSync(workDir, { recursive: true });
  mkdirSync(path.dirname(input.outPath), { recursive: true });

  const filters: string[] = [
    'drawbox=x=0:y=0:w=iw:h=8:color=0x38BDF8@0.95:t=fill',
    `drawbox=x=0:y=ih-10:w='iw*min(t/${preset.duration},1)':h=10:color=0x10B981@0.95:t=fill`,
  ];

  filters.push(...drawBlock({ dir: workDir, name: 'brand', font, text: 'SIGNHIFY.STUDIO · $0 STACK', color: '0x38BDF8', size: Math.round(preset.hookSize * 0.42), y: Math.round(preset.height * 0.045), from: 0, to: preset.duration }));

  filters.push(...drawBlock({ dir: workDir, name: 'hook', font, text: wrapText(input.script.hook, preset.wrap), color: '0xF9FAFB', size: preset.hookSize, y: Math.round(preset.height * 0.28), from: preset.hook[0], to: preset.hook[1] }));

  input.script.beats.slice(0, 5).forEach((beat, index) => {
    const from = preset.beatsStart + index * preset.beatGap;
    filters.push(
      ...drawBlock({
        dir: workDir,
        name: `beat_${index}`,
        font,
        text: wrapText(`→ ${beat}`, preset.wrap + 6),
        color: '0xE5E7EB',
        size: preset.beatSize,
        y: Math.round(preset.height * 0.24),
        from,
        to: from + preset.beatHold,
      })
    );
  });

  ['$ git clone github.com/Warriorlegacy/signhify-omnigtm', '$ docker compose up -d --build', '✓ 5 services live · $0.00/month'].forEach((line, index) => {
    filters.push(
      ...drawBlock({
        dir: workDir,
        name: `term_${index}`,
        font,
        text: line,
        color: '0x10B981',
        size: Math.round(preset.beatSize * 0.72),
        y: Math.round(preset.height * 0.52) + index * Math.round(preset.beatSize * 1.8),
        from: preset.terminal[0] + index * 1.1,
        to: preset.terminal[1],
      })
    );
  });

  const ctaLines = wrapText(input.script.cta, preset.wrap - 2).split('\n');
  const ctaLineHeight = Math.round(preset.ctaSize * 1.35);
  const ctaHeight = ctaLines.length * ctaLineHeight + 44;
  const ctaWidth = Math.min(preset.width - 60, Math.round(Math.max(...ctaLines.map((l) => l.length)) * preset.ctaSize * 0.56) + 56);
  const ctaY = Math.round(preset.height * 0.66);
  filters.push(`drawbox=x=(iw-${ctaWidth})/2:y=${ctaY - 22}:w=${ctaWidth}:h=${ctaHeight}:color=0x10B981:t=fill:enable='between(t,${preset.cta[0]},${preset.cta[1]})'`);
  filters.push(...drawBlock({ dir: workDir, name: 'cta', font, text: wrapText(input.script.cta, preset.wrap - 2), color: '0x04120B', size: preset.ctaSize, y: ctaY, from: preset.cta[0], to: preset.cta[1], lineHeight: ctaLineHeight }));

  filters.push(...drawBlock({ dir: workDir, name: 'footer', font, text: 'Piyush Raj Singh · Stop posting. Start shipping.', color: '0x9CA3AF', size: Math.round(preset.hookSize * 0.34), y: preset.height - 150, from: 0, to: preset.duration }));

  const args = ['-y', '-v', 'error', '-f', 'lavfi', '-i', `color=c=0x090D16:s=${preset.width}x${preset.height}:d=${preset.duration}:r=${preset.fps}`];
  const hasAudio = Boolean(input.audioPath);
  if (hasAudio) args.push('-i', input.audioPath as string);
  args.push('-vf', filters.join(','), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart');
  if (hasAudio) args.push('-c:a', 'aac', '-b:a', '128k', '-shortest');
  args.push(input.outPath);

  await runCommand('ffmpeg', args, 900_000);
  const bytes = statSync(input.outPath).size;
  rmSync(workDir, { recursive: true, force: true });

  return { outPath: input.outPath, preset: input.preset ?? 'full', width: preset.width, height: preset.height, fps: preset.fps, durationS: preset.duration, bytes, audio: hasAudio };
}

/** Cheap poster/thumbnail frame for the dashboard (no full render). */
export async function renderPoster(input: { script: ReelScript; outPath: string; width?: number }): Promise<string> {
  await ensureFfmpeg();
  const font = findFont();
  if (!font) throw new Error('No usable font found. Set OMNIGTM_FONT_FILE.');
  const width = input.width ?? 1080;
  const height = Math.round(width * 1.777);
  const workDir = path.join(os.tmpdir(), `omnigtm-poster-${Date.now()}`);
  mkdirSync(workDir, { recursive: true });
  mkdirSync(path.dirname(input.outPath), { recursive: true });

  const filters: string[] = ['drawbox=x=0:y=0:w=iw:h=10:color=0x38BDF8:t=fill'];
  filters.push(...drawBlock({ dir: workDir, name: 'brand', font, text: 'SIGNHIFY.STUDIO · 60 FPS', color: '0x38BDF8', size: Math.round(width * 0.028), y: Math.round(height * 0.06), from: 0, to: 10 }));
  filters.push(...drawBlock({ dir: workDir, name: 'hook', font, text: wrapText(input.script.hook, 24), color: '0xF9FAFB', size: Math.round(width * 0.07), y: Math.round(height * 0.34), from: 0, to: 10 }));
  filters.push(...drawBlock({ dir: workDir, name: 'cta', font, text: wrapText(input.script.cta, 28), color: '0x10B981', size: Math.round(width * 0.042), y: Math.round(height * 0.62), from: 0, to: 10 }));

  await runCommand('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', `color=c=0x090D16:s=${width}x${height}:d=1:r=1`, '-vf', filters.join(','), '-frames:v', '1', input.outPath], 120_000);
  rmSync(workDir, { recursive: true, force: true });
  return input.outPath;
}
