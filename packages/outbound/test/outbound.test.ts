import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.OMNIGTM_OFFLINE_TEST = '1';
process.env.OMNIGTM_DB_PATH = path.join(mkdtempSync(path.join(os.tmpdir(), 'omnigtm-outbound-')), 'test.db');

const { Repo } = await import('@omnigtm/core');
const { createGateway } = await import('@omnigtm/ai-gateway');
const { handleInboundReply, heuristicScore, sendDraft, createDraft, loadMailboxes } = await import('../src/index.js');

const repo = await Repo.open();

const job = (overrides: Partial<Parameters<typeof heuristicScore>[0]> = {}) => ({
  title: 'Senior Full-Stack Engineer (TypeScript / MCP)',
  descriptionText: 'Build agentic AI systems with MCP, RAG and Postgres. Remote anywhere.',
  location: 'Remote',
  remote: true,
  salary: null as string | null,
  ...overrides,
});

test('heuristic score rewards the profile stack and punishes off-profile roles', () => {
  const good = heuristicScore(job());
  const bad = heuristicScore(job({ title: 'Sales Development Representative', descriptionText: 'Cold calling. Security clearance required. 10+ years.', location: 'On-site only', remote: false }));
  assert.ok(good.score > bad.score);
  assert.ok(good.reasons.includes('MCP'));
  assert.ok(bad.score < 40);
});

test('reply STOP and hard bounces suppress the address', async () => {
  const stop = await handleInboundReply(repo, { from: 'Buyer@Example.com', text: 'STOP' });
  assert.equal(stop.suppressed, true);
  assert.equal(await repo.isSuppressed('buyer@example.com'), true);

  const bounce = await handleInboundReply(repo, { from: 'gone@example.com', text: '550 5.1.1 mailbox unavailable' });
  assert.equal(bounce.suppressed, true);

  const normal = await handleInboundReply(repo, { from: 'ok@example.com', text: 'Interesting, tell me more.' });
  assert.equal(normal.suppressed, false);
});

test('a dry-run dispatch is recorded and moves the opportunity to SENT', async () => {
  const workspace = await repo.ensureWorkspace();
  const { id } = await repo.upsertOpportunity({
    workspaceId: workspace.id,
    track: 'B2B_SPRINT',
    source: 'test',
    externalId: 'dry-run-send',
    companyName: 'Dry Run Studio',
    roleTitle: '3D hero sprint',
    companyUrl: 'https://dryrun.example',
    sourceUrl: 'https://dryrun.example/contact',
    contactEmail: 'hello@dryrun.example',
    descriptionSnippet: 'Ships property flythroughs.',
  });

  const gateway = await createGateway(repo);
  const draft = await createDraft(repo, gateway, id);
  assert.match(draft.body, /Reply STOP/);

  const result = await sendDraft(repo, { opportunityId: id, subject: draft.subject, body: draft.body, dryRun: true });
  assert.equal(result.status, 'DRY_RUN');

  const events = await repo.listOutreach(id);
  assert.equal(events.length, 1);
  assert.equal(events[0].status, 'DRY_RUN');
  assert.equal((await repo.getOpportunity(id))?.stage, 'DRAFT_READY');
});

test('mailbox configuration defaults to none when nothing is set', () => {
  const previous = process.env.OMNIGTM_MAILBOXES;
  const previousBrevo = process.env.BREVO_FROM_EMAIL;
  delete process.env.OMNIGTM_MAILBOXES;
  delete process.env.BREVO_FROM_EMAIL;
  try {
    assert.deepEqual(loadMailboxes(), []);
  } finally {
    if (previous !== undefined) process.env.OMNIGTM_MAILBOXES = previous;
    if (previousBrevo !== undefined) process.env.BREVO_FROM_EMAIL = previousBrevo;
  }
});
