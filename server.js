// Dashboard server: serves the UI, streams agent progress over SSE, exposes the last report.
const http = require('http'), fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const port = process.env.PORT || 8080;
let running = false, last = 0;
const send = (res, code, type, body) => { res.writeHead(code, { 'content-type': type }); res.end(body); };

http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/run') {
    if (running) return send(res, 409, 'text/plain', 'A run is already in progress');
    if (Date.now() - last < 15000) return send(res, 429, 'text/plain', 'Please wait a few seconds between runs');
    running = true;
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
    const p = spawn(process.execPath, ['agent/agent.js'], { cwd: __dirname, env: process.env });
    let buf = '';
    p.stdout.on('data', (d) => {
      buf += d; let i;
      while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (l) res.write(`data: ${l}\n\n`); }
    });
    p.stderr.on('data', (d) => console.error(String(d)));
    p.on('close', () => { running = false; last = Date.now(); res.write('event: end\ndata: {}\n\n'); res.end(); });
    return;
  }
  if (u.pathname === '/report') {
    try { return send(res, 200, 'application/json', fs.readFileSync(path.join(__dirname, 'report.json'))); }
    catch { return send(res, 404, 'application/json', '{}'); }
  }
  send(res, 200, 'text/html; charset=utf-8', fs.readFileSync(path.join(__dirname, 'public/index.html')));
}).listen(port, () => console.log('CheckoutGuardian dashboard on', port));
