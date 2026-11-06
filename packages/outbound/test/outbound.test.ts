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

  const stored = await repo.getOpportunity(id);
  assert.equal(stored?.draft_subject, draft.subject, 'the exact draft subject is persisted');
  assert.equal(stored?.draft_body, draft.body, 'the exact draft body is persisted');

  // Omitting subject/body must reuse the persisted draft, not fail or resend a
  // model call. This is the path the dashboard's review panel uses.
  const result = await sendDraft(repo, { opportunityId: id, dryRun: true });
  assert.equal(result.status, 'DRY_RUN');

  const events = await repo.listOutreach(id);
  assert.equal(events.length, 1);
  assert.equal(events[0].status, 'DRY_RUN');
  assert.equal((await repo.getOpportunity(id))?.stage, 'DRAFT_READY');
});

test('a second real send is refused unless allowResend is explicit', async () => {
  const workspace = await repo.ensureWorkspace();
  const { id } = await repo.upsertOpportunity({
    workspaceId: workspace.id,
    track: 'B2B_SPRINT',
    source: 'test',
    externalId: 'duplicate-send',
    companyName: 'Twice Studio',
    roleTitle: 'Launch film',
    companyUrl: 'https://twice.example',
    sourceUrl: 'https://twice.example/contact',
    contactEmail: 'hello@twice.example',
    descriptionSnippet: 'Ships launch films.',
  });

  await repo.insertOutreach({
    opportunityId: id,
    senderMailbox: 'owner@studio.test',
    relayProvider: 'BREVO_HTTP',
    subject: 'First send',
    bodyText: 'Body',
    status: 'SENT',
  });

  await assert.rejects(
    () => sendDraft(repo, { opportunityId: id, subject: 'Second send', body: 'Body', dryRun: false }),
    /already received a real email/
  );

  // Dry runs never leave the building, so they stay available for inspection.
  const dry = await sendDraft(repo, { opportunityId: id, subject: 'Second send', body: 'Body', dryRun: true });
  assert.equal(dry.status, 'DRY_RUN');
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

test('Brevo HTTP relay is chosen from the API key alone and sends without SMTP credentials', async () => {
  const { loadMailboxes, dispatchEmail } = await import('../src/index.js');

  const saved = {
    BREVO_API_KEY: process.env.BREVO_API_KEY,
    BREVO_FROM_EMAIL: process.env.BREVO_FROM_EMAIL,
    BREVO_SMTP_KEY: process.env.BREVO_SMTP_KEY,
    BREVO_SMTP_USER: process.env.BREVO_SMTP_USER,
    BREVO_FROM_NAME: process.env.BREVO_FROM_NAME,
  };
  process.env.BREVO_API_KEY = 'xkeysib-test-key';
  process.env.BREVO_FROM_EMAIL = 'owner@studio.test';
  process.env.BREVO_FROM_NAME = 'Studio';
  delete process.env.BREVO_SMTP_KEY;
  delete process.env.BREVO_SMTP_USER;
  delete process.env.OMNIGTM_MAILBOXES;

  const originalFetch = globalThis.fetch;
  const captured: { url: string; init: RequestInit }[] = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    captured.push({ url: String(url), init });
    return {
      ok: true,
      status: 201,
      json: async () => ({ messageId: '<brevo-http-123@smtp-relay.mailin.fr>' }),
      text: async () => '',
    } as unknown as Response;
  }) as typeof fetch;

  try {
    const boxes = loadMailboxes();
    assert.equal(boxes.length, 1);
    assert.equal(boxes[0].provider, 'BREVO_HTTP');

    const result = await dispatchEmail(
      repo,
      boxes[0],
      { to: 'brevo-http-check@example.com', subject: 'Hello', body: 'Plain text body' },
      false
    );

    assert.equal(result.status, 'SENT');
    assert.equal(result.provider, 'BREVO_HTTP');
    assert.equal(result.messageId, '<brevo-http-123@smtp-relay.mailin.fr>');

    assert.equal(captured.length, 1, 'fetch should be called exactly once');
    const call = captured[0];
    assert.equal(call.url, 'https://api.brevo.com/v3/smtp/email');
    const headers = call.init.headers as Record<string, string>;
    assert.equal(headers['api-key'], 'xkeysib-test-key');
    const payload = JSON.parse(String(call.init.body));
    assert.equal(payload.sender.email, 'owner@studio.test');
    assert.equal(payload.to[0].email, 'brevo-http-check@example.com');
    assert.equal(payload.textContent, 'Plain text body');
  } finally {
    globalThis.fetch = originalFetch;
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});
