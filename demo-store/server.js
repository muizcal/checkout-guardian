const http = require('http');
const { cartTotal, buildSessionParams } = require('./checkout');
const port = process.env.PORT || 3000;
const safe = (f) => { try { return f(); } catch (e) { return 'ERROR: ' + e.message; } };
http.createServer((req, res) => {
  res.setHeader('content-type', 'application/json');
  const cart = { items: [{ sku: 'tee', qty: 2 }] };
  const s = safe(() => buildSessionParams(cart, `http://localhost:${port}`));
  res.end(JSON.stringify({
    unit_amount_for_tee: s.line_items ? s.line_items[0].price_data.unit_amount : s,
    success_url: s.success_url,
    empty_cart_total: safe(() => cartTotal({})),
  }, null, 1));
}).listen(port);
