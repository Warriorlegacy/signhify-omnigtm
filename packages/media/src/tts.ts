import { existsSync } from 'node:fs';
import path from 'node:path';
import { optionalSecret } from '@omnigtm/core';
import { runCommand } from './ffmpeg.js';

export interface TtsResult {
  ok: boolean;
  path?: string;
  reason?: string;
}

/**
 * Kokoro-82M (Apache-2.0) adapter. Kokoro is not a Node package, so this shells
 * out to the bundled Python script. Missing Python/model is a soft failure: the
 * reel renders silent rather than blocking the pipeline.
 */
export async function synthesizeVoiceover(text: string, outWav: string): Promise<TtsResult> {
  const python = optionalSecret('KOKORO_PYTHON') ?? optionalSecret('PYTHON_BIN');
  if (!python) return { ok: false, reason: 'Set KOKORO_PYTHON (or PYTHON_BIN) to enable Kokoro TTS.' };
  const script = path.join(process.cwd(), 'scripts', 'kokoro_tts.py');
  if (!existsSync(script)) return { ok: false, reason: `Missing ${script}` };
  try {
    await runCommand(python, [script, '--text', text.slice(0, 4000), '--out', outWav, '--voice', optionalSecret('KOKORO_VOICE') ?? 'af_heart'], 600_000);
    return existsSync(outWav) ? { ok: true, path: outWav } : { ok: false, reason: 'Kokoro produced no output file.' };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message.slice(0, 240) : 'Kokoro failed' };
  }
}
