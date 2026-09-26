/**
 * Loads the app fresh and reports the first uncaught exception.
 * CDP Runtime.exceptionThrown gives the real stack, which the
 * dev-screenshot helper cannot see because it attaches after load.
 */
const { spawn } = require('child_process');
const path = require('path');
const WebSocket = require('ws');

const ROOT = path.join(__dirname, '..');
const ELECTRON = path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe');

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

(async () => {
  const child = spawn(
    ELECTRON,
    ['.', '--remote-debugging-port=9222'],
    { cwd: ROOT, stdio: 'ignore' }
  );

  await wait(6000);

  let target;

  for (let i = 0; i < 20; i++) {
    try {
      const res = await fetch('http://127.0.0.1:9222/json/list');
      const list = await res.json();
      target = list.find((t) => t.type === 'page' && /index\.html/.test(t.url || ''));
      if (target) break;
    } catch {}
    await wait(500);
  }

  if (!target) {
    console.log('no target');
    child.kill();
    process.exit(1);
  }

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.once('open', r));

  const found = [];

  ws.on('message', (raw) => {
    const msg = JSON.parse(raw);

    if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      found.push({
        text: d.exception?.description || d.text,
        line: d.lineNumber,
        url: (d.url || '').split('/').pop()
      });
    }

    if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
      found.push({ log: msg.params.entry.text });
    }
  });

  ws.send(JSON.stringify({ id: 1, method: 'Runtime.enable' }));
  ws.send(JSON.stringify({ id: 2, method: 'Log.enable' }));

  // reload so we catch anything that fires at startup
  ws.send(JSON.stringify({
    id: 3,
    method: 'Page.reload',
    params: { ignoreCache: true }
  }));

  await wait(6000);

  console.log('exceptions found:', found.length);
  found.forEach((f) => {
    console.log('---');
    if (f.text) console.log('  ' + f.text.split('\n').slice(0, 4).join('\n  '));
    if (f.log) console.log('  log: ' + f.log);
    if (f.url) console.log('  in ' + f.url + ' line ' + f.line);
  });

  ws.close();
  child.kill();
  process.exit(0);
})();
