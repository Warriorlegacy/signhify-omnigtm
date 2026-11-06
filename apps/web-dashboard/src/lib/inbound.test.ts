import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractEmail, parseInboundForm, parseInboundJson, SUPPRESSION_EVENTS } from './inbound.js';

test('extractEmail handles display names, plain addresses and junk', () => {
  assert.equal(extractEmail('Ada Lovelace <ada@example.com>'), 'ada@example.com');
  assert.equal(extractEmail('ada@example.com'), 'ada@example.com');
  assert.equal(extractEmail('"Ada, PM" <ada@example.com>'), 'ada@example.com');
  assert.equal(extractEmail('no address here'), null);
  assert.equal(extractEmail(undefined), null);
});

test('Postmark-style JSON becomes a reply with subject and body', () => {
  const parsed = parseInboundJson({
    From: 'ada@example.com',
    Subject: 'Re: your note',
    TextBody: 'STOP',
  });
  assert.equal(parsed.replies.length, 1);
  assert.equal(parsed.replies[0].email, 'ada@example.com');
  // The body must lead: STOP is anchored at the start so a quoted footer cannot
  // accidentally unsubscribe an ordinary reply.
  assert.ok(parsed.replies[0].text.startsWith('STOP'));
  assert.match(parsed.replies[0].text, /Re: your note/);
});

test('Brevo hard-bounce events become suppressions, not replies', () => {
  const parsed = parseInboundJson({
    event: 'hard_bounce',
    email: 'gone@example.com',
    reason: '550 5.1.1 mailbox unavailable',
  });
  assert.equal(parsed.replies.length, 0);
  assert.deepEqual(parsed.events, [{ email: 'gone@example.com', event: 'hard_bounce' }]);
  assert.ok(SUPPRESSION_EVENTS.has('unsubscribed'));
});

test('batched provider events and form payloads are reduced the same way', () => {
  const batch = parseInboundJson({ items: [{ event: 'spam', email: 'spam@example.com' }] });
  assert.equal(batch.events[0]?.event, 'spam');

  const form = new FormData();
  form.set('from', 'Grace <grace@example.com>');
  form.set('subject', 'unsubscribe');
  form.set('text', 'please remove me');
  const parsed = parseInboundForm(form);
  assert.equal(parsed.replies[0]?.email, 'grace@example.com');
  assert.match(parsed.replies[0]?.text ?? '', /please remove me/);
});

test('a payload without an address is ignored instead of throwing', () => {
  assert.deepEqual(parseInboundJson({ text: 'STOP' }), { replies: [], events: [] });
  assert.deepEqual(parseInboundJson(null), { replies: [], events: [] });
});
