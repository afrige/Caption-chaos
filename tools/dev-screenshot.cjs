/**
 * Dev helper: screenshot the running Electron renderer over CDP.
 *
 *   node tools/dev-screenshot.js <out.png> [click-selector] [wait-ms]
 *
 * Requires the app to be started with --remote-debugging-port=9222
 */
const fs = require('fs');
const WebSocket = require('ws');

const out = process.argv[2];
const clickSelector = process.argv[3] || '';
const waitMs = Number(process.argv[4] || 2600);

const PORT = 9222;

async function findTarget() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const targets = await res.json();

      const page = targets.find(
        (t) => t.type === 'page' && /index\.html/.test(t.url || '')
      );

      if (page?.webSocketDebuggerUrl) return page;
    } catch {}

    await new Promise((r) => setTimeout(r, 500));
  }

  throw new Error('no debuggable page found');
}

function send(ws, id, method, params = {}) {
  return new Promise((resolve, reject) => {
    const onMessage = (raw) => {
      const msg = JSON.parse(raw);

      if (msg.id !== id) return;

      ws.off('message', onMessage);

      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
    };

    ws.on('message', onMessage);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

(async () => {
  const target = await findTarget();

  const ws = new WebSocket(target.webSocketDebuggerUrl, {
    maxPayload: 256 * 1024 * 1024,
  });

  await new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });

  await send(ws, 1, 'Page.enable');

  if (clickSelector) {
    // "js:<expression>" runs arbitrary JS, anything else is a selector to click
    const isJs = clickSelector.startsWith('js:');
    const target = isJs ? clickSelector.slice(3) : null;

    const expression = isJs
      ? `(async () => { ${target} })()`
      : `
        (async () => {
          const el = document.querySelector(${JSON.stringify(clickSelector)});
          if (!el) throw new Error('not found: ' + ${JSON.stringify(clickSelector)});
          el.click();
          await new Promise((r) => setTimeout(r, ${waitMs}));
          return 'clicked ' + ${JSON.stringify(clickSelector)};
        })()
      `;

    const result = await send(ws, 2, 'Runtime.evaluate', {
      expression,
      awaitPromise: true,
    });

    console.log('  ->', JSON.stringify(result.result?.value));
  }

  const shot = await send(ws, 3, 'Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false,
  });

  fs.writeFileSync(out, Buffer.from(shot.data, 'base64'));

  console.log(`saved ${out} (${(fs.statSync(out).size / 1024).toFixed(0)} KB)`);

  ws.close();
  process.exit(0);
})();
