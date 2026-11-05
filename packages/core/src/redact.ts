/**
 * Secret + PII redaction. Applied to every prompt context chunk (untrusted web
 * content) and to every model output before it is persisted or displayed.
 */

const SECRET_PATTERNS: RegExp[] = [
  /postgres(?:ql)?:\/\/[^\s"'<>]+/gi,
  /mysql:\/\/[^\s"'<>]+/gi,
  /mongodb(?:\+srv)?:\/\/[^\s"'<>]+/gi,
  /redis:\/\/[^\s"'<>]+/gi,
  /\bsk-[A-Za-z0-9_-]{12,}\b/g,
  /\bsk-or-v1-[A-Za-z0-9_-]{8,}\b/g,
  /\bgsk_[A-Za-z0-9_-]{8,}\b/g,
  /\bxai-[A-Za-z0-9_-]{8,}\b/g,
  /\bAIza[0-9A-Za-z_-]{15,}\b/g,
  /\bxsmtpsib-[A-Za-z0-9_-]{8,}\b/g,
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
  /\b(?:api[_-]?key|secret|password|token)\s*[:=]\s*["']?[A-Za-z0-9_\-./+]{12,}["']?/gi,
];

export const REDACTED = '[REDACTED_SECRET]';

export function scrubSecrets(text: string): string {
  if (!text) return '';
  return SECRET_PATTERNS.reduce((acc, re) => acc.replace(re, REDACTED), text);
}

export function containsSecret(text: string): boolean {
  return SECRET_PATTERNS.some((re) => {
    re.lastIndex = 0;
    return re.test(text);
  });
}

/** Light PII scrub used for logs and for outbound copy review (keeps company domains). */
export function scrubPii(text: string): string {
  return scrubSecrets(text)
    .replace(/\b(?:\+91[-\s]?)?[6-9]\d{9}\b/g, '[REDACTED_PHONE]')
    .replace(/\b\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g, '[REDACTED_ID]');
}

/** Normalise HTML scraped from ATS boards into readable text. */
export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<\/(p|div|li|h[1-6]|tr|section)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}
