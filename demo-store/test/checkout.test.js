const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const { cartTotal, buildSessionParams, verifyWebhook } = require('../checkout');

test('line item amounts are integer cents', () => {
  const p = buildSessionParams({ items: [{ sku: 'tee', qty: 1 }] }, 'https://x.test');
  assert.strictEqual(p.line_items[0].price_data.unit_amount, 1999);
});

test('success_url contains the session id placeholder', () => {
  const p = buildSessionParams({ items: [{ sku: 'mug', qty: 1 }] }, 'https://x.test');
  assert.ok(p.success_url.includes('{CHECKOUT_SESSION_ID}'));
});

test('empty cart returns 0 instead of crashing', () => {
  assert.strictEqual(cartTotal({ items: [] }), 0);
  assert.strictEqual(cartTotal({}), 0);
});

test('cart total is correct for mixed items', () => {
  assert.strictEqual(Math.round(cartTotal({ items: [{ sku: 'tee', qty: 2 }, { sku: 'mug', qty: 1 }] }) * 100) / 100, 52.48);
});

const sign = (body, secret, t) => `t=${t},v1=${crypto.createHmac('sha256', secret).update(`${t}.${body}`).digest('hex')}`;

test('webhook: a correctly signed event is accepted', () => {
  assert.strictEqual(verifyWebhook('{"id":"evt_1"}', sign('{"id":"evt_1"}', 'whsec_test', 1000), 'whsec_test', 1000), true);
});

test('webhook: a tampered body is rejected', () => {
  assert.strictEqual(verifyWebhook('{"id":"evt_2"}', sign('{"id":"evt_1"}', 'whsec_test', 1000), 'whsec_test', 1000), false);
});

test('webhook: a signature older than 5 minutes is rejected', () => {
  assert.strictEqual(verifyWebhook('{"id":"evt_1"}', sign('{"id":"evt_1"}', 'whsec_test', 1000), 'whsec_test', 1400), false);
});
