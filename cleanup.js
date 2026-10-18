(async () => {
  const { createClient } = await import('@nodeops-createos/sandbox');
  const c = createClient({ apiKey: process.env.CREATEOS_PROJECT_API_KEY });
  for (const status of ['running', 'paused']) {
    const list = await c.listSandboxes({ status });
    for (const s of list) {
      console.log(status, s.id);
      if (typeof s.destroy === 'function') { await s.destroy(); console.log('  destroyed'); }
      else console.log('  listed item has no destroy(); use: createos sandbox rm ' + s.id + ' --force');
    }
  }
  console.log('cleanup done');
})().catch((e) => { console.error('cleanup error:', e.message); process.exit(1); });
