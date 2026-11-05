/**
 * Strict environment access. Zero plaintext secret fallbacks — ever.
 * A missing production secret is a configuration error, not a default value.
 */

export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

/** Caller-supplied input was rejected. Routes map this to HTTP 400, not 500. */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export const isOfflineTest = (): boolean => process.env.OMNIGTM_OFFLINE_TEST === '1';

export function optionalSecret(name: string): string | undefined {
  const value = process.env[name];
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Read a required secret. Throws in production; in offline tests returns a
 * deterministic mock so the suite never needs live credentials.
 */
export function requireSecret(name: string, allowOfflineMock = true): string {
  const value = optionalSecret(name);
  if (value) return value;
  if (allowOfflineMock && isOfflineTest()) return `mock-offline-${name.toLowerCase()}`;
  throw new ConfigurationError(
    `Missing required environment variable '${name}'. ` +
      'Plaintext secret fallbacks are prohibited — set it in .env.local or the platform dashboard.'
  );
}

export function optionalNumber(name: string, fallback: number): number {
  const raw = optionalSecret(name);
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function flag(name: string, fallback = false): boolean {
  const raw = optionalSecret(name);
  if (raw === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(raw.toLowerCase());
}

export function publicBaseUrl(): string {
  return (optionalSecret('OMNIGTM_PUBLIC_BASE_URL') ?? 'http://localhost:3000').replace(/\/+$/, '');
}

/** Comma-separated list helper (e.g. workspace slugs, allowed origins). */
export function listEnv(name: string): string[] {
  const raw = optionalSecret(name);
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}
