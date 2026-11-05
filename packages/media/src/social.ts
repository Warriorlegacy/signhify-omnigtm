import type { Repo } from '@omnigtm/core';

export interface CommentDmInput {
  contentItemId?: string | null;
  platform?: string;
  externalCommentId: string;
  commenterHandle: string;
  matchedKeyword: string;
}

/**
 * Comment-to-DM idempotency. Meta retries webhooks aggressively; the unique
 * constraint on external_comment_id is what stops duplicate DMs.
 */
export async function recordCommentDm(repo: Repo, input: CommentDmInput): Promise<boolean> {
  const existing = await repo.hasCommentDm(input.externalCommentId);
  if (existing) return false;
  await repo.insertCommentDm(input);
  return true;
}
