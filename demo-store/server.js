const http = require('http');
const { cartTotal, buildSessionParams } = require('./checkout');
const port = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.setHeader('content-type', 'application/json');
  try {
    const cart = { items: [{ sku: 'tee', qty: 2 }] };
    res.end(JSON.stringify({ total: cartTotal(cart), session: buildSessionParams(cart, `http://localhost:${port}`) }, null, 2));
  } catch (e) { res.statusCode = 500; res.end(JSON.stringify({ error: e.message })); }
}).listen(port, () => console.log('store on', port));
