import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normaliseEmail } from './email.js';

test('normaliseEmail trims, lowercases and rejects junk', () => {
  assert.equal(normaliseEmail('  Ada@Example.COM '), 'ada@example.com');
  assert.equal(normaliseEmail('ada@example.com'), 'ada@example.com');
  assert.equal(normaliseEmail('ada@example'), null);
  assert.equal(normaliseEmail('not an email'), null);
  assert.equal(normaliseEmail(''), null);
  assert.equal(normaliseEmail(undefined), null);
  assert.equal(normaliseEmail(`${'a'.repeat(250)}@example.com`), null);
});
