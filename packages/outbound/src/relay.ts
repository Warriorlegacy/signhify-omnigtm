import { createHash, randomUUID } from 'node:crypto';
import { Repo, log, optionalNumber, optionalSecret, requireSecret } from '@omnigtm/core';

export interface Mailbox {
  email: string;
  provider: 'BREVO_SMTP' | 'GMAIL_OAUTH';
  dailyCap: number;
  fromName?: string;
  refreshTokenEnv?: string;
}

export interface OutboundMessage {
  to: string;
  subject: string;
  body: string;
  replyTo?: string;
}

export interface DispatchResult {
  status: 'SENT' | 'DRY_RUN' | 'FAILED' | 'SUPPRESSED';
  mailbox: string | null;
  provider: 'BREVO_SMTP' | 'GMAIL_OAUTH' | 'DRY_RUN';
  messageId?: string;
  error?: string;
}

/**
 * Mailboxes come from OMNIGTM_MAILBOXES (JSON) so caps and providers are config,
 * not code. Example:
 * [{"email":"you@studio.com","provider":"BREVO_SMTP","dailyCap":35},
 *  {"email":"second@gmail.com","provider":"GMAIL_OAUTH","dailyCap":35,"refreshTokenEnv":"GMAIL_REFRESH_TOKEN_2"}]
 */
export function loadMailboxes(): Mailbox[] {
  const raw = optionalSecret('OMNIGTM_MAILBOXES');
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Mailbox[];
      if (Array.isArray(parsed)) {
        return parsed
          .filter((m) => m && typeof m.email === 'string' && (m.provider === 'BREVO_SMTP' || m.provider === 'GMAIL_OAUTH'))
          .map((m) => ({
            email: m.email,
            provider: m.provider,
            dailyCap: Number(m.dailyCap) > 0 ? Number(m.dailyCap) : 35,
            fromName: m.fromName,
            refreshTokenEnv: m.refreshTokenEnv,
          }));
      }
    } catch (error) {
      log.warn('OMNIGTM_MAILBOXES is not valid JSON', { error: error instanceof Error ? error.message : String(error) });
    }
  }
  const single = optionalSecret('BREVO_FROM_EMAIL');
  if (single) {
    return [{ email: single, provider: 'BREVO_SMTP', dailyCap: optionalNumber('BREVO_DAILY_CAP', 150), fromName: optionalSecret('BREVO_FROM_NAME') }];
  }
  return [];
}

/** Least-sent mailbox with remaining capacity. Null means "no capacity left". */
export async function selectMailbox(repo: Repo, mailboxes: Mailbox[]): Promise<Mailbox | null> {
  const withCounts: { mailbox: Mailbox; sent: number }[] = [];
  for (const mailbox of mailboxes) {
    const sent = await repo.sentTodayCount(mailbox.email);
    if (sent < mailbox.dailyCap) withCounts.push({ mailbox, sent });
  }
  if (withCounts.length === 0) return null;
  withCounts.sort((a, b) => a.sent - b.sent);
  return withCounts[0].mailbox;
}

function encodeHeader(value: string): string {
  return /^[\x20-\x7E]*$/.test(value) ? value : `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
}

function buildMime(message: OutboundMessage, from: string): string {
  const domain = from.split('@')[1] ?? 'localhost';
  const headers = [
    `From: ${from}`,
    `To: ${message.to}`,
    `Subject: ${encodeHeader(message.subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${randomUUID()}@${domain}>`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    'List-Unsubscribe: <mailto:unsubscribe@signhify.dpdns.org?subject=unsubscribe>',
  ];
  if (message.replyTo) headers.push(`Reply-To: ${message.replyTo}`);
  const body = Buffer.from(message.body, 'utf8').toString('base64').replace(/(.{76})/g, '$1\r\n');
  return `${headers.join('\r\n')}\r\n\r\n${body}`;
}

async function sendViaBrevo(mailbox: Mailbox, message: OutboundMessage): Promise<string> {
  const nodemailer = (await import('nodemailer')).default;
  const transport = nodemailer.createTransport({
    host: optionalSecret('BREVO_SMTP_HOST') ?? 'smtp-relay.brevo.com',
    port: optionalNumber('BREVO_SMTP_PORT', 587),
    secure: false,
    auth: { user: requireSecret('BREVO_SMTP_USER'), pass: requireSecret('BREVO_SMTP_KEY') },
  });
  const info = await transport.sendMail({
    from: mailbox.fromName ? `"${mailbox.fromName}" <${mailbox.email}>` : mailbox.email,
    to: message.to,
    replyTo: message.replyTo,
    subject: message.subject,
    text: message.body,
    headers: { 'List-Unsubscribe': '<mailto:unsubscribe@signhify.dpdns.org?subject=unsubscribe>' },
  });
  return info.messageId;
}

async function gmailAccessToken(refreshTokenEnv: string): Promise<string> {
  const clientId = requireSecret('GMAIL_CLIENT_ID');
  const clientSecret = requireSecret('GMAIL_CLIENT_SECRET');
  const refreshToken = requireSecret(refreshTokenEnv);
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token' }),
  });
  if (!res.ok) throw new Error(`Gmail token refresh failed: HTTP ${res.status}`);
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) throw new Error('Gmail token refresh returned no access_token');
  return json.access_token;
}

async function sendViaGmail(mailbox: Mailbox, message: OutboundMessage): Promise<string> {
  const env = mailbox.refreshTokenEnv ?? 'GMAIL_REFRESH_TOKEN';
  const token = await gmailAccessToken(env);
  const raw = Buffer.from(buildMime(message, mailbox.email), 'utf8').toString('base64url');
  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw }),
  });
  if (!res.ok) throw new Error(`Gmail send failed: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  const json = (await res.json()) as { id?: string };
  return json.id ?? createHash('sha256').update(raw).digest('hex').slice(0, 24);
}

export async function dispatchEmail(repo: Repo, mailbox: Mailbox, message: OutboundMessage, dryRun: boolean): Promise<DispatchResult> {
  if (await repo.isSuppressed(message.to)) {
    return { status: 'SUPPRESSED', mailbox: mailbox.email, provider: mailbox.provider };
  }
  if (dryRun) {
    return { status: 'DRY_RUN', mailbox: mailbox.email, provider: mailbox.provider };
  }
  try {
    const messageId = mailbox.provider === 'BREVO_SMTP' ? await sendViaBrevo(mailbox, message) : await sendViaGmail(mailbox, message);
    return { status: 'SENT', mailbox: mailbox.email, provider: mailbox.provider, messageId };
  } catch (error) {
    return { status: 'FAILED', mailbox: mailbox.email, provider: mailbox.provider, error: error instanceof Error ? error.message.slice(0, 300) : 'unknown' };
  }
}
