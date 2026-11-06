const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Contact entry is manual today (no enrichment provider), so this is the only
 * gate between an operator typo and a bounced real email.
 */
export function normaliseEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const value = raw.trim().toLowerCase();
  if (value.length > 254 || !EMAIL.test(value)) return null;
  return value;
}
