const test = require('node:test');
const assert = require('node:assert');
const { cartTotal, buildSessionParams } = require('../checkout');

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
