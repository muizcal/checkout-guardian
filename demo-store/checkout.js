// Demo store checkout logic (intentionally broken: 4 seeded bugs)
const crypto = require('crypto');
const PRICES = { tee: 19.99, mug: 12.5, hoodie: 49 }; // dollars

function cartTotal(cart) {
  // BUG 2: crashes when cart is empty/undefined
  return cart.items.reduce((sum, i) => sum + PRICES[i.sku] * i.qty, 0);
}

function buildSessionParams(cart, origin) {
  const line_items = cart.items.map((i) => ({
    price_data: {
      currency: 'usd',
      product_data: { name: i.sku },
      unit_amount: PRICES[i.sku], // BUG 1: dollars, Stripe expects integer cents
    },
    quantity: i.qty,
  }));
  return {
    mode: 'payment',
    line_items,
    success_url: `${origin}/success`, // BUG 3: missing {CHECKOUT_SESSION_ID}
    cancel_url: `${origin}/cart`,
  };
}

// Stripe-Signature header looks like: t=1700000000,v1=<hex hmac>
function verifyWebhook(rawBody, header, secret, now = Date.now() / 1000) {
  // BUG 4: Stripe signs `${timestamp}.${payload}`, and old timestamps must be rejected (replay protection)
  const parts = Object.fromEntries(header.split(',').map((p) => p.split('=')));
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return parts.v1 === expected;
}

module.exports = { PRICES, cartTotal, buildSessionParams, verifyWebhook };
