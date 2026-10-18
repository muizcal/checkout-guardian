// CheckoutGuardian AI: diagnose -> write -> execute -> recover -> prove
// Usage: node agent/agent.js [--local]
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const STORE = path.join(__dirname, '..', 'demo-store');
const MAX_ATTEMPTS = 3;
const LOCAL = process.argv.includes('--local');
const emit = (stage, data = {}) => console.log(JSON.stringify({ t: Date.now(), stage, ...data }));

const readStore = () => ({
  'checkout.js': fs.readFileSync(path.join(STORE, 'checkout.js'), 'utf8'),
  'server.js': fs.readFileSync(path.join(STORE, 'server.js'), 'utf8'),
  'test/checkout.test.js': fs.readFileSync(path.join(STORE, 'test/checkout.test.js'), 'utf8'),
});

const probeCmd = (dir) => 'cd ' + dir + ' && (PORT=3111 node server.js >/dev/null 2>&1 & P=$!; sleep 1; node -e "fetch(\'http://localhost:3111\').then(r=>r.text()).then(console.log)"; kill $P)';
const parseProbe = (t = '') => { try { return JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1)); } catch { return String(t).slice(0, 300) || null; } };

async function makeRunner() {
  if (LOCAL) {
    const dir = fs.mkdtempSync('/tmp/cg-');
    return {
      async write(f) { for (const [p, c] of Object.entries(f)) { fs.mkdirSync(path.dirname(path.join(dir, p)), { recursive: true }); fs.writeFileSync(path.join(dir, p), c); } },
      async test() { const r = spawnSync('node', ['--test'], { cwd: dir, encoding: 'utf8' }); return { exitCode: r.status, output: r.stdout + r.stderr }; },
      async probe() { return parseProbe(spawnSync('sh', ['-c', probeCmd(dir)], { encoding: 'utf8' }).stdout); },
      async close() {},
    };
  }
  const { createClient } = await import('@nodeops-createos/sandbox');
  const client = createClient({ apiKey: process.env.CREATEOS_PROJECT_API_KEY || process.env.CREATEOS_SANDBOX_API_KEY });
  const sb = await client.createSandbox({ shape: process.env.CREATEOS_SHAPE || 's-1vcpu-1gb', rootfs: process.env.CREATEOS_ROOTFS || 'devbox:1' });
  const sh = (cmd) => sb.runCommand('sh', ['-c', cmd]);
  await sh('mkdir -p /work/test');
  return {
    async write(f) {
      for (const [p, c] of Object.entries(f)) await sh(`mkdir -p $(dirname /work/${p}) && echo '${Buffer.from(c).toString('base64')}' | base64 -d > /work/${p}`);
    },
    async test() {
      const r = (await sh('cd /work && node --test 2>&1; echo "EXIT:$?"')).result;
      const out = r.stdout || '';
      const m = out.match(/EXIT:(\d+)\s*$/);
      return { exitCode: m ? Number(m[1]) : 1, output: out.replace(/EXIT:\d+\s*$/, '') };
    },
    async probe() { return parseProbe(((await sh(probeCmd('/work'))).result || {}).stdout); },
    async close() { await sb.destroy(); },
  };
}

async function askLLM(prompt) {
  const res = await fetch(`${process.env.LLM_BASE_URL || 'https://openrouter.ai/api/v1'}/chat/completions`, {
    method: 'POST', signal: AbortSignal.timeout(120000),
    headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.LLM_API_KEY || process.env.OPENROUTER_API_KEY}` },
    body: JSON.stringify({
      model: process.env.LLM_MODEL || 'anthropic/claude-sonnet-4.5',
      messages: [
        { role: 'system', content: 'You fix bugs in a Stripe Checkout integration. NEVER edit test files. Reply with ONLY JSON: {"diagnosis": string, "files": {"<path>": "<full new file content>"}}' },
        { role: 'user', content: prompt },
      ],
    }),
  });
  const j = await res.json();
  if (!j.choices) throw new Error('LLM error: ' + JSON.stringify(j).slice(0, 300));
  const t = j.choices[0].message.content; return JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1));
}

const unifiedDiff = (before, after) => {
  const d = fs.mkdtempSync('/tmp/diff-');
  let out = '';
  for (const p of Object.keys(after)) {
    if (before[p] === after[p]) continue;
    fs.writeFileSync(`${d}/a`, before[p] || ''); fs.writeFileSync(`${d}/b`, after[p]);
    out += spawnSync('diff', ['-u', '--label', `a/${p}`, '--label', `b/${p}`, `${d}/a`, `${d}/b`], { encoding: 'utf8' }).stdout;
  }
  return out;
};

(async () => {
  const original = readStore();
  let current = { ...original };
  const attempts = [];
  const runner = await makeRunner();
  try {
    await runner.write(current);
    emit('diagnose', { note: 'Running test suite on broken app' });
    let result = await runner.test();
    const originalFailure = result.output;
    const probeBefore = await runner.probe();
    emit('diagnose', { exitCode: result.exitCode, output: originalFailure.slice(0, 800) });

    for (let n = 1; n <= MAX_ATTEMPTS && result.exitCode !== 0; n++) {
      emit('write', { attempt: n });
      const fix = await askLLM(
        `Source files:\n${JSON.stringify(current, null, 2)}\n\nLatest test output:\n${result.output}\n` +
        (attempts.length ? `\nPrevious attempt failed. Fix it.\n` : ''));
      const files = Object.fromEntries(Object.entries(fix.files || {}).filter(([p]) => !p.startsWith('test/')));
      const next = { ...current, ...files };
      emit('execute', { attempt: n, diagnosis: fix.diagnosis });
      await runner.write(next);
      result = await runner.test();
      attempts.push({ attempt: n, diagnosis: fix.diagnosis, diff: unifiedDiff(current, next), exitCode: result.exitCode, output: result.output });
      emit(result.exitCode === 0 ? 'prove' : 'recover', { attempt: n, passed: result.exitCode === 0 });
      current = next;
    }

    const probeAfter = await runner.probe();
    const report = { probe: { before: probeBefore, after: probeAfter }, fixed: result.exitCode === 0, originalFailure, attempts, finalDiff: unifiedDiff(original, current), finalTestOutput: result.output };
    fs.writeFileSync(path.join(__dirname, '..', 'report.json'), JSON.stringify(report, null, 2));
    emit('done', { fixed: report.fixed, attempts: attempts.length });
  } finally { await runner.close(); }
})().catch((e) => { emit('error', { message: e.message }); process.exit(1); });
