import { scrubPii } from './redact.js';

type Level = 'debug' | 'info' | 'warn' | 'error';

const LEVELS: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const threshold = LEVELS[(process.env.OMNIGTM_LOG_LEVEL as Level) ?? 'info'] ?? 20;

function emit(level: Level, msg: string, meta?: Record<string, unknown>): void {
  if (LEVELS[level] < threshold) return;
  const line: Record<string, unknown> = { ts: new Date().toISOString(), level, msg: scrubPii(msg) };
  if (meta) line.meta = JSON.parse(scrubPii(JSON.stringify(meta)));
  const out = level === 'error' || level === 'warn' ? process.stderr : process.stdout;
  out.write(`${JSON.stringify(line)}\n`);
}

export const log = {
  debug: (msg: string, meta?: Record<string, unknown>) => emit('debug', msg, meta),
  info: (msg: string, meta?: Record<string, unknown>) => emit('info', msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => emit('warn', msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => emit('error', msg, meta),
};
