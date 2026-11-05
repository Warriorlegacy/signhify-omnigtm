import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Minimal .env loader for CLI entrypoints (Next.js already loads .env.local).
 * Never overrides an existing process env value; never logs values.
 */
export function loadEnvFiles(dir = process.cwd()): void {
  for (const file of ['.env.local', '.env']) {
    const full = path.join(dir, file);
    if (!existsSync(full)) continue;
    const text = readFileSync(full, 'utf8');
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = value;
    }
  }
}
