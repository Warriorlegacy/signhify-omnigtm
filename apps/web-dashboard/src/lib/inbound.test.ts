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

test('Brevo nested payload message headers are unwrapped for reply and address', () => {
  const parsed = parseInboundJson({
    event: 'rejected',
    email: 'report@brevo.com',
    payload: {
      message: {
        headers: {
          'text-plain': 'STOP',
          subject: 'Re: your note',
          sender: { email: 'buyer@example.com', name: 'Buyer' },
        },
      },
    },
  });
  assert.equal(parsed.replies.length, 1);
  assert.equal(parsed.replies[0].email, 'buyer@example.com');
  assert.ok(parsed.replies[0].text.startsWith('STOP'));
  assert.equal(parsed.events.length, 0);
});

test('Brevo nested payload with hard_bounce event suppresses the top-level email', () => {
  const parsed = parseInboundJson({
    event: 'hard_bounce',
    email: 'gone@example.com',
    payload: {
      message: {
        headers: {
          'text-plain': '550 mailbox unavailable',
        },
      },
    },
  });
  // Events are extracted from the top-level fields, not from nested payload
  assert.equal(parsed.events.length, 1);
  assert.equal(parsed.events[0].email, 'gone@example.com');
  assert.equal(parsed.events[0].event, 'hard_bounce');
  assert.equal(parsed.replies.length, 0);
});
