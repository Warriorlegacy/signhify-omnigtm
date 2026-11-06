import { createHmac, timingSafeEqual } from 'node:crypto';
import { optionalSecret, safeEqual } from '@omnigtm/core';
import { recordCommentDm, sendInstagramPrivateReply } from '@omnigtm/media';
import { getRepo } from '@/lib/api';

export const dynamic = 'force-dynamic';

/** Meta webhook verification handshake. */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');
  const expected = optionalSecret('IG_WEBHOOK_VERIFY_TOKEN');
  if (mode === 'subscribe' && expected && token && safeEqual(token, expected) && challenge) {
    return new Response(challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } });
  }
  return new Response('Forbidden', { status: 403 });
}

interface InstagramWebhook {
  entry?: {
    changes?: {
      field?: string;
      value?: { id?: string; text?: string; from?: { username?: string; id?: string }; media?: { id?: string } };
    }[];
  }[];
}

function validSignature(raw: string, header: string | null, secret: string): boolean {
  if (!header?.startsWith('sha256=')) return false;
  const expected = createHmac('sha256', secret).update(raw, 'utf8').digest('hex');
  const provided = header.slice('sha256='.length);
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(provided, 'hex'), Buffer.from(expected, 'hex'));
}

/**
 * Comment-to-DM. Every reply is idempotent on the comment id, so Meta's retries
 * cannot double-DM a commenter.
 */
export async function POST(request: Request): Promise<Response> {
  // Meta payloads are small. Cap before parsing so a leaked signature secret is
  // not the only thing standing between the process and an oversized body.
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > 1_000_000) return Response.json({ ok: false, error: 'Payload too large' }, { status: 413 });
  const raw = await request.text();
  if (raw.length > 1_000_000) return Response.json({ ok: false, error: 'Payload too large' }, { status: 413 });
  const secret = optionalSecret('IG_WEBHOOK_SECRET');
  if (!secret) {
    // No secret configured means the integration is off - never accept unsigned input.
    return Response.json({ ok: false, error: 'Instagram webhook is not configured' }, { status: 503 });
  }
  if (!validSignature(raw, request.headers.get('x-hub-signature-256'), secret)) {
    return Response.json({ ok: false, error: 'Invalid signature' }, { status: 401 });
  }

  let payload: InstagramWebhook;
  try {
    payload = JSON.parse(raw) as InstagramWebhook;
  } catch {
    return Response.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const keyword = (optionalSecret('OMNIGTM_CTA_KEYWORD') ?? 'FOSS').toUpperCase();
  const repo = await getRepo();
  const handled: { commentId: string; sent: boolean; reason?: string }[] = [];

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      const commentId = value?.id;
      const text = value?.text ?? '';
      if (change.field !== 'comments' || !commentId || !text.toUpperCase().includes(keyword)) continue;
      const isNew = await recordCommentDm(repo, {
        contentItemId: null,
        externalCommentId: commentId,
        commenterHandle: value?.from?.username ?? 'unknown',
        matchedKeyword: keyword,
      });
      if (!isNew) {
        handled.push({ commentId, sent: false, reason: 'already replied' });
        continue;
      }
      const reply = await sendInstagramPrivateReply({
        commentId,
        message: `Thanks for the interest! The full $0 GTM + 3D repo: ${optionalSecret('OMNIGTM_PUBLIC_BASE_URL') ?? 'https://github.com/Warriorlegacy/signhify-omnigtm'}`,
      });
      handled.push({ commentId, sent: reply.ok, reason: reply.error });
    }
  }

  return Response.json({ ok: true, handled });
}
