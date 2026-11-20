// Headless boot: no console errors, the run starts, the canvas fills the window.
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const PORT = 8766;
const CDP = 9334;
const ROOT = new URL('..', import.meta.url).pathname;

const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], {
  cwd: ROOT,
  stdio: 'ignore',
});

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitFetch(url, tries = 50) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return res;
    } catch { /* retry */ }
    await sleep(100);
  }
  throw new Error(`timed out waiting for ${url}`);
}

const chrome = spawn('google-chrome-stable', [
  '--headless=new',
  '--no-sandbox',
  '--disable-gpu',
  '--disable-dev-shm-usage',
  '--force-device-scale-factor=1',
  '--window-size=1280,720',
  `--remote-debugging-port=${CDP}`,
  'about:blank',
], { stdio: 'ignore' });

const errors = [];
let ws;

try {
  await waitFetch(`http://127.0.0.1:${PORT}/`);
  const version = await (await waitFetch(`http://127.0.0.1:${CDP}/json/version`)).json();
  const list = await (await fetch(`http://127.0.0.1:${CDP}/json/list`)).json();
  const page = list.find((t) => t.type === 'page');
  ws = new WebSocket(page.webSocketDebuggerUrl || version.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve);
    ws.addEventListener('error', () => reject(new Error('cdp socket failed')));
  });

  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const waiter = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) waiter.reject(new Error(JSON.stringify(msg.error)));
      else waiter.resolve(msg.result);
      return;
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      errors.push(d.exception?.description || d.text || 'exception');
    } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      const text = msg.params.args.map((a) => a.value || a.description || '').join(' ');
      errors.push(text);
    }
  });

  function send(method, params) {
    const msgId = ++id;
    ws.send(JSON.stringify({ id: msgId, method, params }));
    return new Promise((resolve, reject) => pending.set(msgId, { resolve, reject }));
  }

  await send('Runtime.enable');
  await send('Page.enable');
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });

  let booted = null;
  for (let i = 0; i < 80; i++) {
    const r = await send('Runtime.evaluate', {
      expression: 'window.__rage ? window.__rage.mode : null',
      returnByValue: true,
    });
    if (r.result && r.result.value) {
      booted = r.result.value;
      break;
    }
    await sleep(100);
  }
  if (!booted) throw new Error('game did not boot');

  const started = await send('Runtime.evaluate', {
    expression: `(() => {
      document.getElementById('start-btn').click();
      const down = (code) => window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
      down('KeyW');
      window.__rage.pump(36);
      const mode = window.__rage.mode;
      window.__rage.game.mode = 'pause';
      document.getElementById('pause').classList.add('hidden');
      window.__rage.pump(1);
      const canvas = document.getElementById('view');
      const box = canvas.getBoundingClientRect();
      return {
        mode,
        speed: window.__rage.speed,
        timer: window.__rage.timer,
        frameMs: window.__rage.frameMs,
        health: window.__rage.health,
        box: { w: box.width, h: box.height },
        view: { w: window.innerWidth, h: window.innerHeight },
        checks: window.__rage.selfTest().ok,
      };
    })()`,
    returnByValue: true,
    awaitPromise: true,
  });
  if (started.exceptionDetails) {
    const detail = started.exceptionDetails.exception && started.exceptionDetails.exception.description;
    throw new Error(detail || started.exceptionDetails.text || 'evaluate failed');
  }
  const info = started.result.value;
  console.log(JSON.stringify(info, null, 2));

  const shot = await send('Page.captureScreenshot', { format: 'png' });
  const file = `${ROOT}screenshot.png`;
  writeFileSync(file, Buffer.from(shot.data, 'base64'));
  console.log('wrote', file);

  const problems = [];
  if (errors.length) problems.push(`console: ${errors.join(' | ')}`);
  if (info.mode !== 'play') problems.push(`mode ${info.mode}`);
  if (!(info.speed > 20)) problems.push(`speed ${info.speed}`);
  if (!(info.timer < 60)) problems.push(`timer ${info.timer}`);
  if (!info.checks) problems.push('selfTest failed in page');
  if (Math.abs(info.box.w - info.view.w) > 2 || Math.abs(info.box.h - info.view.h) > 2) {
    problems.push(`canvas ${info.box.w}x${info.box.h} did not fill ${info.view.w}x${info.view.h}`);
  }
  if (problems.length) {
    console.error(problems.join('\n'));
    process.exitCode = 1;
  } else {
    console.log('smoke ok');
  }
} finally {
  if (ws) ws.close();
  chrome.kill();
  server.kill();
}
