import { createHash, randomUUID } from 'node:crypto';

/** Deterministic 24-char SHA-256 idempotency key (ECC-07). */
export function idempotencyKey(...parts: (string | number | undefined | null)[]): string {
  const material = parts.filter((p) => p !== undefined && p !== null).join(':');
  return createHash('sha256').update(material, 'utf8').digest('hex').slice(0, 24);
}

export function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function uuid(): string {
  return randomUUID();
}

export function nowIso(): string {
  return new Date().toISOString();
}

/** URL-safe slug for previews and topics. */
export function slugify(input: string, fallback = 'item'): string {
  const slug = input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return slug || fallback;
}
