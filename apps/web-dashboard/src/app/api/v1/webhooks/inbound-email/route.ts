import { optionalSecret, safeEqual } from '@omnigtm/core';
import { handleInboundReply } from '@omnigtm/outbound';
import { getRepo } from '@/lib/api';
import { parseInboundForm, parseInboundJson, SUPPRESSION_EVENTS } from '@/lib/inbound';

export const dynamic = 'force-dynamic';

/** Replies and events are tiny; anything larger is not a real provider call. */
const MAX_BYTES = 256 * 1024;

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

/**
 * Inbound email and provider-event webhook.
 *
 * Every outbound mail promises "Reply STOP", so the promise has to reach the
 * suppression table without a human in the loop. Point a SendGrid Inbound Parse,
 * Mailgun route, Postmark inbound stream, Brevo event webhook or a plain
 * forwarder here. `OMNIGTM_INBOUND_WEBHOOK_SECRET` is required and may be sent as
 * `x-omnigtm-secret` or `?secret=` (Brevo only supports URL-based tokens).
 */
export async function POST(request: Request): Promise<Response> {
  const expected = optionalSecret('OMNIGTM_INBOUND_WEBHOOK_SECRET');
  // Fail closed: without a secret this endpoint would let anyone suppress any
  // address in the workspace.
  if (!expected) return json({ ok: false, error: 'Inbound webhook is not configured' }, 503);

  const url = new URL(request.url);
  const provided = request.headers.get('x-omnigtm-secret') ?? url.searchParams.get('secret') ?? '';
  if (!safeEqual(provided, expected)) return json({ ok: false, error: 'Unauthorized' }, 401);

  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > MAX_BYTES) return json({ ok: false, error: 'Payload too large' }, 413);

  const contentType = request.headers.get('content-type') ?? '';
  let parsed;
  try {
    if (contentType.includes('application/json')) {
      const raw = await request.text();
      if (raw.length > MAX_BYTES) return json({ ok: false, error: 'Payload too large' }, 413);
      parsed = parseInboundJson(JSON.parse(raw));
    } else {
      parsed = parseInboundForm(await request.formData());
    }
  } catch {
    return json({ ok: false, error: 'Unreadable payload' }, 400);
  }

  const repo = await getRepo();
  let suppressed = 0;
  let replied = 0;
  for (const reply of parsed.replies) {
    const result = await handleInboundReply(repo, { from: reply.email, text: reply.text });
    if (result.suppressed) {
      suppressed += 1;
      continue;
    }
    replied += await repo.markReplied(reply.email);
  }
  for (const event of parsed.events) {
    if (!SUPPRESSION_EVENTS.has(event.event)) continue;
    await repo.suppress(event.email, event.event);
    suppressed += 1;
  }

  return json({ ok: true, replies: parsed.replies.length, events: parsed.events.length, replied, suppressed });
}
