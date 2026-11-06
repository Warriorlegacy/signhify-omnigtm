/**
 * Inbound-email payload normalisation.
 *
 * Providers disagree on field names (SendGrid `from`/`text`, Mailgun
 * `sender`/`body-plain`, Postmark `From`/`TextBody`, Brevo event objects), so the
 * route accepts all of them and this module reduces them to two shapes:
 * replies for `handleInboundReply`, and provider events that mean "suppress".
 */

export interface InboundReply {
  email: string;
  text: string;
}

export interface InboundEvent {
  email: string;
  event: string;
}

export interface ParsedInbound {
  replies: InboundReply[];
  events: InboundEvent[];
}

/** Events that mean the address must never be emailed again. */
export const SUPPRESSION_EVENTS = new Set([
  'hard_bounce',
  'hardbounce',
  'blocked',
  'spam',
  'complaint',
  'unsubscribed',
  'invalid',
  'invalid_email',
]);

const EMAIL_PATTERN = /[^\s<>"'(),;:]+@[^\s<>"'(),;:]+\.[A-Za-z]{2,}/;

/** `"Ada <ada@example.com>"` and `ada@example.com` both yield the bare address. */
export function extractEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const match = raw.match(EMAIL_PATTERN);
  return match ? match[0].toLowerCase() : null;
}

function pick(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

function addressOf(record: Record<string, unknown>): string | null {
  const direct = pick(record, ['from', 'sender', 'From', 'Sender', 'email', 'Email', 'from_email', 'fromEmail']);
  if (direct) {
    // Postmark's `From` is already a bare address; SendGrid's is display-form.
    return extractEmail(direct);
  }
  const full = record.FromFull;
  if (full && typeof full === 'object') return extractEmail((full as Record<string, unknown>).Email);
  return null;
}

function textOf(record: Record<string, unknown>): string {
  // Body first. `handleInboundReply` anchors STOP at the start on purpose, so a
  // quoted "Reply STOP" footer further down a thread must not suppress the
  // sender. A subject-only STOP still matches through the leading whitespace.
  return [
    pick(record, ['text', 'TextBody', 'body-plain', 'body', 'Body', 'stripped-text']),
    pick(record, ['subject', 'Subject']),
  ]
    .filter(Boolean)
    .join('\n');
}

function reduce(records: Record<string, unknown>[]): ParsedInbound {
  const parsed: ParsedInbound = { replies: [], events: [] };
  for (const record of records) {
    const email = addressOf(record);
    if (!email) continue;
    const event = pick(record, ['event', 'Event', 'type'])?.toLowerCase().replace(/\s+/g, '_');
    if (event && SUPPRESSION_EVENTS.has(event)) {
      parsed.events.push({ email, event });
      continue;
    }
    const text = textOf(record);
    if (text) parsed.replies.push({ email, text });
  }
  return parsed;
}

/** JSON from Postmark, Brevo (single object or batch) and generic forwarders. */
export function parseInboundJson(body: unknown): ParsedInbound {
  if (Array.isArray(body)) {
    return reduce(body.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object'));
  }
  if (!body || typeof body !== 'object') return { replies: [], events: [] };
  const record = body as Record<string, unknown>;
  // Brevo batches transactional events under `items`.
  if (Array.isArray(record.items)) return parseInboundJson(record.items);
  return reduce([record]);
}

/** Form-encoded providers: SendGrid Inbound Parse and Mailgun routes. */
export function parseInboundForm(form: FormData): ParsedInbound {
  const record: Record<string, unknown> = {};
  for (const [key, value] of form.entries()) {
    if (typeof value === 'string') record[key] = value;
  }
  return reduce([record]);
}
