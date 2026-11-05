import type { Repo } from '@omnigtm/core';

const STOP_PATTERN = /^\s*(stop|unsubscribe|remove me|opt out|opt-out)\b/i;
const BOUNCE_PATTERN = /\b(mailbox unavailable|address not found|delivery (to the following recipients )?failed|550 5\.1\.1)\b/i;

/**
 * Inbound reply triage. "Reply STOP" is the promise made in every outbound email,
 * so it has to be enforced server-side, not just in copy.
 */
export async function handleInboundReply(repo: Repo, input: { from: string; text: string }): Promise<{ suppressed: boolean; reason?: string }> {
  const email = input.from.trim().toLowerCase();
  if (!email.includes('@')) return { suppressed: false };
  if (STOP_PATTERN.test(input.text)) {
    await repo.suppress(email, 'reply_stop');
    return { suppressed: true, reason: 'reply_stop' };
  }
  if (BOUNCE_PATTERN.test(input.text)) {
    await repo.suppress(email, 'hard_bounce');
    return { suppressed: true, reason: 'hard_bounce' };
  }
  return { suppressed: false };
}
