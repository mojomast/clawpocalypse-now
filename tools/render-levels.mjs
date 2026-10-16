#!/usr/bin/env node
// Dependency-free Chromium capture of actual stage art and collision overlays.
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir, access, readdir } from 'node:fs/promises';
import { join, resolve, extname } from 'node:path';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
const root = resolve(import.meta.dirname, '..');
const mode = process.argv[2] || 'after';
if (!['baseline', 'after'].includes(mode)) throw Error('Usage: node tools/render-levels.mjs baseline|after');
const out = join(root, mode === 'baseline' ? 'before' : 'after', 'levels');
const hash = b => createHash('sha256').update(b).digest('hex');
const sourceDir = join(root, 'before/levels/source');
const sourceHashes = Object.fromEntries(await Promise.all((await readdir(sourceDir)).sort().map(async name => [name, hash(await readFile(join(sourceDir, name)))])));
const sourceManifest = join(root, 'before/levels/source-manifest.json');
try {
  const original = JSON.parse(await readFile(sourceManifest));
  if (JSON.stringify(original) !== JSON.stringify(sourceHashes)) throw Error('Baseline source snapshot changed');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  await writeFile(sourceManifest, JSON.stringify(sourceHashes, null, 2) + '\n', { flag: 'wx' });
}
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg' };
const server = createServer(async (req, res) => {
  try {
    let path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (path.startsWith('/baseline/')) {
      const name = path.slice('/baseline/'.length), snapshot = resolve(root, 'before/levels/source', name);
      if (!snapshot.startsWith(join(root, 'before/levels/source') + '/')) throw Error('outside snapshot');
      try { await access(snapshot); path = '/before/levels/source/' + name; } catch { path = '/' + name; }
    }
    path = resolve(root, '.' + path);
    if (!path.startsWith(root + '/')) throw Error('outside root');
    const data = await readFile(path); res.writeHead(200, { 'Content-Type': mime[extname(path)] || 'application/octet-stream' }); res.end(data);
  } catch { res.writeHead(404); res.end('not found'); }
});
server.listen(0, '127.0.0.1'); await once(server, 'listening');
const host = `http://127.0.0.1:${server.address().port}`;
const chrome = spawn(process.env.CHROMIUM || '/snap/bin/chromium', ['--headless', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--no-first-run', '--remote-debugging-port=0', '--user-data-dir=/tmp/opencode/level-sheet-chrome-' + process.pid, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
let endpoint, socket, serial = 0;
chrome.stderr.on('data', b => { endpoint ||= b.toString().match(/DevTools listening on (ws:\/\/[^\s]+)/)?.[1]; });
const pending = new Map();
function send(method, params = {}) { const id = ++serial; const promise = new Promise((ok, fail) => pending.set(id, { ok, fail })); socket.send(JSON.stringify({ id, method, params })); return promise; }
try {
  for (let i = 0; !endpoint && i < 100; i++) await sleep(100);
  if (!endpoint) throw Error('Chromium failed to start');
  const port = new URL(endpoint.replace('ws:', 'http:')).port;
  const tab = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
  socket = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((ok, fail) => { socket.onopen = ok; socket.onerror = fail; });
  socket.onmessage = ({ data }) => { const m = JSON.parse(data), p = pending.get(m.id); if (p) { pending.delete(m.id); m.error ? p.fail(Error(JSON.stringify(m.error))) : p.ok(m.result); } };
  await send('Page.enable'); await send('Runtime.enable'); await mkdir(out, { recursive: true });
  const manifest = [];
  for (let i = 0; i < 8; i++) {
    await send('Page.navigate', { url: `${host}/tools/level-layout.html?level=${i}&baseline=${mode === 'baseline' ? 1 : 0}` });
    let value;
    for (let k = 0; k < 200; k++) { const r = await send('Runtime.evaluate', { expression: 'window.__levelSheet', returnByValue: true }); value = r.result.value; if (value) break; await sleep(100); }
    if (!value || value.error) throw Error(`Level ${i}: ${value?.error || 'timeout'}`);
    const data = Buffer.from(value.png.split(',')[1], 'base64');
    await writeFile(join(out, `${value.id}.png`), data, { flag: mode === 'baseline' ? 'wx' : 'w' });
    manifest.push({ ...value, png: undefined, sha256: hash(data) }); console.log(`${value.id}: ${value.obstacles.length} obstacles, ${value.placements.length} props`);
  }
  await writeFile(join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: mode === 'baseline' ? 'wx' : 'w' });
  if (mode === 'after') for (const entry of JSON.parse(await readFile(join(root, 'before/levels/manifest.json')))) {
    if (hash(await readFile(join(root, 'before/levels', entry.id + '.png'))) !== entry.sha256) throw Error('Baseline changed: ' + entry.id);
  }
  console.log('Saved eight level sheets: ' + out);
} finally { socket?.close(); chrome.kill(); server.close(); }
