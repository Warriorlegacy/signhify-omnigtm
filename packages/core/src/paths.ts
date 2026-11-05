import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

let cached: string | null = null;

/**
 * Monorepo root, found by walking up to the nearest package.json that declares
 * workspaces. `next start` runs with apps/web-dashboard as cwd, so anchoring
 * runtime state on cwd would silently create a second, empty database.
 */
export function projectRoot(start = process.cwd()): string {
  if (cached) return cached;
  let dir = path.resolve(start);
  for (let depth = 0; depth < 8; depth += 1) {
    const manifest = path.join(dir, 'package.json');
    if (existsSync(manifest)) {
      try {
        const json = JSON.parse(readFileSync(manifest, 'utf8')) as { workspaces?: unknown };
        if (json.workspaces) {
          cached = dir;
          return dir;
        }
      } catch {
        // Unreadable manifest is not a root candidate.
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  cached = path.resolve(start);
  return cached;
}

/** Absolute path for runtime state, honouring an explicit env override. */
export function statePath(override: string | undefined, ...segments: string[]): string {
  if (override) return path.resolve(override);
  return path.join(projectRoot(), '.data', ...segments);
}
