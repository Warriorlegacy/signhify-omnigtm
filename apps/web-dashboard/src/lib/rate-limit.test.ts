import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clearRateLimit, clientIp, rateLimit } from './rate-limit.js';

test('rate limit blocks after the window allowance and clears on success', () => {
  const key = `test:${Date.now()}:${Math.random()}`;
  assert.equal(rateLimit(key, 2, 60_000).ok, true);
  assert.equal(rateLimit(key, 2, 60_000).ok, true);

  const blocked = rateLimit(key, 2, 60_000);
  assert.equal(blocked.ok, false);
  assert.ok(blocked.retryAfterSeconds >= 1 && blocked.retryAfterSeconds <= 60);

  clearRateLimit(key);
  assert.equal(rateLimit(key, 2, 60_000).ok, true);
});

test('client IP uses the first forwarded hop and falls back safely', () => {
  assert.equal(clientIp(new Request('http://localhost', { headers: { 'x-forwarded-for': '203.0.113.9, 10.0.0.1' } })), '203.0.113.9');
  assert.equal(clientIp(new Request('http://localhost', { headers: { 'x-real-ip': '203.0.113.10' } })), '203.0.113.10');
  assert.equal(clientIp(new Request('http://localhost')), 'unknown');
});
