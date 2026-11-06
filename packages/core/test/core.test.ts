import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ConfigurationError, containsSecret, idempotencyKey, requireSecret, scrubSecrets, safeEqual, seal, open, sealJson, openJson } from '../src/index.js';

test('requireSecret throws ConfigurationError instead of falling back to plaintext', () => {
  const previous = process.env.OMNIGTM_OFFLINE_TEST;
  delete process.env.OMNIGTM_OFFLINE_TEST;
  try {
    assert.throws(() => requireSecret('OMNIGTM_DEFINITELY_UNSET', false), ConfigurationError);
  } finally {
    if (previous !== undefined) process.env.OMNIGTM_OFFLINE_TEST = previous;
  }
});

test('seal/open round-trips and does not leak plaintext', () => {
  process.env.OMNIGTM_OFFLINE_TEST = '1';
  const sealed = seal('sk-live-super-secret-value');
  assert.ok(!sealed.includes('super-secret'));
  assert.equal(open(sealed), 'sk-live-super-secret-value');
  assert.deepEqual(openJson(sealJson({ a: 1 })), { a: 1 });
});

test('scrubSecrets removes credentials from model output', () => {
  const dirty = 'conn postgresql://admin:supersecret@db.internal:5432/prod and key gsk_abcdefghijklmnop';
  const clean = scrubSecrets(dirty);
  assert.ok(!clean.includes('supersecret'));
  assert.ok(!containsSecret(clean));
  assert.match(clean, /\[REDACTED_SECRET\]/);
});

test('idempotency keys are stable 24-char hashes', () => {
  const a = idempotencyKey('ashby', 'mastra', 'role-1');
  assert.equal(a, idempotencyKey('ashby', 'mastra', 'role-1'));
  assert.equal(a.length, 24);
  assert.notEqual(a, idempotencyKey('ashby', 'mastra', 'role-2'));
});

test('safeEqual compares without early exit', () => {
  assert.equal(safeEqual('token-abc', 'token-abc'), true);
  assert.equal(safeEqual('token-abc', 'token-abd'), false);
  assert.equal(safeEqual('short', 'longer-value'), false);
});

test('retention sweep removes expired cache rows and keeps live ones', async () => {
  const { mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');

  const previousPath = process.env.OMNIGTM_DB_PATH;
  process.env.OMNIGTM_OFFLINE_TEST = '1';
  process.env.OMNIGTM_DB_PATH = join(mkdtempSync(join(tmpdir(), 'omnigtm-retain-')), 'retain.db');
  try {
    const { Repo, closeDb } = await import('../src/index.js');
    const repo = await Repo.open();
    await repo.cachePut('expired-key', { text: 'old' }, -5);
    await repo.cachePut('live-key', { text: 'new' }, 60);

    const removed = await repo.pruneExpired();
    assert.equal(removed.cache, 1, 'only the expired cache row is deleted');

    const live = (await repo.cacheGet('live-key')) as { text: string } | null;
    assert.deepEqual(live, { text: 'new' });
    assert.equal(await repo.cacheGet('expired-key'), null);
    await closeDb();
  } finally {
    if (previousPath === undefined) delete process.env.OMNIGTM_DB_PATH;
    else process.env.OMNIGTM_DB_PATH = previousPath;
  }
});

test('cache expiry fits a millisecond epoch (Postgres INTEGER would overflow)', async () => {
  const { readFileSync, mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');

  // Pin the DDL: Postgres INTEGER maxes at 2_147_483_647, and Date.now() is ~1.79e12.
  const src = readFileSync(new URL('../src/db.ts', import.meta.url), 'utf8');
  assert.match(src, /expires_at BIGINT NOT NULL/);
  assert.ok(Date.now() > 2_147_483_647, 'a millisecond epoch exceeds Postgres INTEGER');

  // Behavioural check on the SQLite driver: the epoch round-trips intact.
  const previousPath = process.env.OMNIGTM_DB_PATH;
  process.env.OMNIGTM_OFFLINE_TEST = '1';
  process.env.OMNIGTM_DB_PATH = join(mkdtempSync(join(tmpdir(), 'omnigtm-')), 'cache.db');
  try {
    const { Repo, closeDb } = await import('../src/index.js');
    const repo = await Repo.open();
    await repo.cachePut('k1', { text: 'hello' }, 60);
    const hit = (await repo.cacheGet('k1')) as { text: string } | null;
    assert.deepEqual(hit, { text: 'hello' });
    await closeDb();
  } finally {
    if (previousPath === undefined) delete process.env.OMNIGTM_DB_PATH;
    else process.env.OMNIGTM_DB_PATH = previousPath;
  }
});

test('an inbound reply advances only the contacted lead to REPLIED', async () => {
  const { mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');

  const previousPath = process.env.OMNIGTM_DB_PATH;
  process.env.OMNIGTM_OFFLINE_TEST = '1';
  process.env.OMNIGTM_DB_PATH = join(mkdtempSync(join(tmpdir(), 'omnigtm-reply-')), 'reply.db');
  try {
    const { Repo, closeDb } = await import('../src/index.js');
    const repo = await Repo.open();
    const workspace = await repo.ensureWorkspace();
    const { id } = await repo.upsertOpportunity({
      workspaceId: workspace.id,
      track: 'REMOTE_JOB',
      source: 'test',
      externalId: 'reply-tracking',
      companyName: 'Reply Labs',
      roleTitle: 'Agent engineer',
      contactEmail: 'Ada@Example.com',
      companyUrl: 'https://reply.example',
      sourceUrl: 'https://reply.example/jobs',
      descriptionSnippet: 'Builds agents.',
      stage: 'SENT',
    });

    assert.equal(await repo.markReplied('nobody@example.com'), 0, 'unknown senders do not move the pipeline');
    assert.equal(await repo.markReplied('ada@example.com'), 1, 'the contacted address is matched case-insensitively');
    assert.equal((await repo.getOpportunity(id))?.stage, 'REPLIED');
    assert.equal(await repo.markReplied('ada@example.com'), 0, 'an already-replied lead is not counted twice');
    await closeDb();
  } finally {
    if (previousPath === undefined) delete process.env.OMNIGTM_DB_PATH;
    else process.env.OMNIGTM_DB_PATH = previousPath;
  }
});
