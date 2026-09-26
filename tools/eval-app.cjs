/**
 * Runs an expression against an already-running app on the given debug
 * port. The dev-screenshot helper only speaks to the dev instance on 9222
 * and always writes a PNG; this one is read-only and can target the
 * packaged build, which is how you confirm an asset path resolves from
 * inside the asar.
 *
 *   node tools/eval-app.cjs 9333 <expressionFile>
 */
const fs = require('fs');
const WebSocket = require('ws');

const PORT = Number(process.argv[2] || 9222);
const EXPR = fs.readFileSync(process.argv[3], 'utf8');

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

(async () => {
  let target;

  for (let i = 0; i < 24; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await res.json();
      target = list.find((t) => t.type === 'page' && /index\.html/.test(t.url || ''));
      if (target) break;
    } catch {}
    await wait(500);
  }

  if (!target) {
    console.log('NO TARGET on port', PORT);
    process.exit(1);
  }

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.once('open', r));

  /* Wrap the file's body in an async IIFE unless it already is one, so
     a script with await and a return works the same way here as it does
     in dev-screenshot.cjs. */
  const trimmed = EXPR.trim();
  const isIIFE = /^\(?\s*async\s+function|^\(\s*async\s*\(\s*\)\s*=>/.test(trimmed);

  const expression = isIIFE ? trimmed : `(async () => {\n${EXPR}\n})()`;

  const answer = await new Promise((done) => {
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw);
      if (msg.id === 1) done(msg);
    });

    ws.send(JSON.stringify({
      id: 1,
      method: 'Runtime.evaluate',
      params: {
        expression,
        awaitPromise: true,
        returnByValue: true
      }
    }));
  });

  const value = answer.result?.result?.value;

  console.log(
    value !== undefined
      ? value
      : JSON.stringify(answer.result, null, 1)
  );

  ws.close();
  process.exit(0);
})();
