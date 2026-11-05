import { spawn } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

export interface RunResult {
  stdout: string;
  stderr: string;
}

export function runCommand(command: string, args: string[], timeoutMs = 300_000): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`${command} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${command} exited ${code}: ${stderr.slice(-600)}`));
    });
  });
}

let ffmpegChecked = false;

export async function ensureFfmpeg(): Promise<void> {
  if (ffmpegChecked) return;
  try {
    await runCommand('ffmpeg', ['-version'], 15_000);
  } catch {
    throw new Error('FFmpeg is not installed or not on PATH. Install it (winget install Gyan.FFmpeg) and retry.');
  }
  ffmpegChecked = true;
}

export async function probeVideo(file: string): Promise<{ width: number; height: number; durationS: number }> {
  const { stdout } = await runCommand('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,duration', '-of', 'json', file], 30_000);
  const json = JSON.parse(stdout) as { streams?: { width?: number; height?: number; duration?: string }[] };
  const stream = json.streams?.[0];
  return {
    width: Number(stream?.width ?? 1280),
    height: Number(stream?.height ?? 720),
    durationS: Number(stream?.duration ?? 0),
  };
}

export function dirSize(dir: string): { bytes: number; files: number } {
  if (!existsSync(dir)) return { bytes: 0, files: 0 };
  let bytes = 0;
  let files = 0;
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isFile()) {
      bytes += stat.size;
      files += 1;
    }
  }
  return { bytes, files };
}

/** Escape a value for use inside an FFmpeg filter argument. */
export function escapeFilterValue(value: string): string {
  return value.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'").replace(/,/g, '\\,');
}

const FONT_CANDIDATES = [
  process.env.OMNIGTM_FONT_FILE,
  'C:/Windows/Fonts/segoeuib.ttf',
  'C:/Windows/Fonts/arialbd.ttf',
  '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
  '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
  '/System/Library/Fonts/Supplemental/Arial Bold.ttf',
].filter(Boolean) as string[];

export function findFont(): string | null {
  return FONT_CANDIDATES.find((candidate) => existsSync(candidate)) ?? null;
}

export function wrapText(text: string, width: number): string {
  const words = text.replace(/\s+/g, ' ').trim().split(' ');
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    if ((line + ' ' + word).trim().length > width && line) {
      lines.push(line);
      line = word;
    } else {
      line = (line + ' ' + word).trim();
    }
  }
  if (line) lines.push(line);
  return lines.join('\n');
}
