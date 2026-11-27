// Drives the app off-screen over the Chrome DevTools Protocol. Usage: import and call start(app, out).
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

/** Decode an 8-bit RGB or RGBA PNG into { width, height, at(x, y) -> [r, g, b] }. */
export function png(buffer) {
  let at = 8, width = 0, height = 0, type = 0;
  const data = [];
  while (at < buffer.length) {
    const length = buffer.readUInt32BE(at), name = buffer.toString('latin1', at + 4, at + 8);
    if (name === 'IHDR') { width = buffer.readUInt32BE(at + 8); height = buffer.readUInt32BE(at + 12); type = buffer[at + 17]; }
    if (name === 'IDAT') data.push(buffer.subarray(at + 8, at + 8 + length));
    at += length + 12;
  }
  const bpp = type === 6 ? 4 : 3, stride = width * bpp;
  const raw = inflateSync(Buffer.concat(data)), px = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const v = raw[y * (stride + 1) + 1 + x];
      const a = x >= bpp ? px[y * stride + x - bpp] : 0, b = y ? px[(y - 1) * stride + x] : 0, c = x >= bpp && y ? px[(y - 1) * stride + x - bpp] : 0;
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      px[y * stride + x] = (v + [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][filter]) & 255;
    }
  }
  return { width, height, at: (x, y) => [...px.subarray(y * stride + x * bpp, y * stride + x * bpp + 3)] };
}

export async function start(app, out, { port = 9372, live = false, sample = true, library = out + '/library' } = {}) {
  // Every run keeps its own library folder, never the real one. By default it shows the
  // stand-in items; with sample false it runs on that library for real.
  const env = { ...process.env, INQUISITIVE_LIBRARY: library };
  if (!live) env.INQUISITIVE_HEADLESS = '1';
  if (sample) env.INQUISITIVE_SAMPLE = '1';
  else delete env.INQUISITIVE_SAMPLE;
  // A visible run keeps its own profile too, so it can never touch the real app's saved settings.
  const args = ['.', '--remote-debugging-port=' + port];
  // (and goes on drawing when another window covers it, so that a test of movement is not cut short)
  if (live) args.push('--user-data-dir=' + out + '/live-profile', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding');
  const child = spawn(app + '/node_modules/.bin/electron', args, { cwd: app, env, stdio: 'ignore' });
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  let target;
  for (let i = 0; i < 80 && !target; i++) {
    await wait(250);
    try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page' && t.url.includes('index.html')); } catch {}
  }
  if (!target) { child.kill(); throw new Error('the app did not come up'); }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0;
  const waiting = new Map(), heard = new Map(), logs = [];
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && waiting.has(d.id)) { waiting.get(d.id)(d); waiting.delete(d.id); }
    else if (d.method && heard.has(d.method)) heard.get(d.method)(d.params);
  };
  const send = (method, params = {}) => new Promise((r) => { const n = ++id; waiting.set(n, (d) => r(d.result ?? d)); ws.send(JSON.stringify({ id: n, method, params })); });
  const on = (method, told) => heard.set(method, told);
  const run = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) logs.push('EVAL ' + expression.slice(0, 70) + ' -> ' + (r.exceptionDetails.exception?.description ?? r.exceptionDetails.text));
    return r.result?.value;
  };
  const shot = async (name, clip) => writeFileSync(`${out}/${name}.png`, Buffer.from((await send('Page.captureScreenshot', { format: 'png', ...(clip ? { clip } : {}) })).data, 'base64'));
  const scheme = (value) => send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value }] });
  const tab = (name) => run(`document.querySelector('[data-tab="${name}"]').click()`);
  const openItem = async (name, pause = 600) => { await run(`[...document.querySelectorAll('.card')].find((c) => c.item.id === '${name}').click()`); await wait(pause); };

  /** Record what is actually drawn while \`act\` happens: every frame the compositor puts out
      for \`ms\`, sampled at the named points { name: [x, y] } (in window pixels). */
  const film = async (act, ms, points) => {
    const size = await run(`JSON.stringify([innerWidth, innerHeight])`).then(JSON.parse);
    const frames = [];
    on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
      send('Page.screencastFrameAck', { sessionId });
      frames.push({ time: metadata.timestamp, image: Buffer.from(data, 'base64') });
    });
    await send('Page.startScreencast', { format: 'png', everyNthFrame: 1, maxWidth: Math.round(size[0] / 2), maxHeight: Math.round(size[1] / 2) });
    await wait(250);
    const from = frames.length;
    const began = Date.now() / 1000;
    await run(act);
    await wait(ms);
    await send('Page.stopScreencast');
    return frames.slice(Math.max(0, from - 1)).map(({ time, image }) => {
      const picture = png(image), scale = picture.width / size[0];
      const seen = { ms: Math.round((time - began) * 1000) };
      for (const [name, [x, y]] of Object.entries(points)) seen[name] = picture.at(Math.round(x * scale), Math.round(y * scale));
      return seen;
    });
  };
  const stop = () => { ws.close(); child.kill(); };
  return { wait, send, on, run, shot, film, scheme, tab, openItem, logs, stop };
}
