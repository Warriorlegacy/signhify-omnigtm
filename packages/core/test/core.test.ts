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
