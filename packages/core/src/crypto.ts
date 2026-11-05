import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { ConfigurationError, isOfflineTest, optionalSecret } from './env.js';

/**
 * AES-256-GCM envelope for BYOK tokens stored in Postgres.
 * Ciphertext format: v1:<iv-b64>:<tag-b64>:<ciphertext-b64>
 */

function keyBytes(): Buffer {
  const raw = optionalSecret('OMNIGTM_ENCRYPTION_KEY');
  if (!raw) {
    if (isOfflineTest()) return createHash('sha256').update('omnigtm-offline-test-key').digest();
    throw new ConfigurationError(
      "Missing 'OMNIGTM_ENCRYPTION_KEY'. Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
    );
  }
  const hex = raw.length === 64 && /^[0-9a-f]+$/i.test(raw) ? Buffer.from(raw, 'hex') : null;
  if (hex) return hex;
  const b64 = Buffer.from(raw, 'base64');
  if (b64.length === 32) return b64;
  throw new ConfigurationError("'OMNIGTM_ENCRYPTION_KEY' must be 32 bytes (64 hex chars or base64).");
}

export function seal(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyBytes(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${ct.toString('base64')}`;
}

export function open(sealed: string): string {
  const [version, ivB64, tagB64, ctB64] = sealed.split(':');
  if (version !== 'v1' || !ivB64 || !tagB64 || !ctB64) {
    throw new Error('Malformed ciphertext envelope');
  }
  const decipher = createDecipheriv('aes-256-gcm', keyBytes(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64')), decipher.final()]).toString('utf8');
}

export function sealJson(value: unknown): string {
  return seal(JSON.stringify(value));
}

export function openJson<T>(sealed: string): T {
  return JSON.parse(open(sealed)) as T;
}

/** Constant-time-ish comparison for dashboard tokens / webhook signatures. */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  let diff = 0;
  for (let i = 0; i < ha.length; i += 1) diff |= ha[i] ^ hb[i];
  return diff === 0 && a.length === b.length;
}
