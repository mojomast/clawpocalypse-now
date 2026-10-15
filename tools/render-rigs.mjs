#!/usr/bin/env node
// Capture production Canvas rig contact sheets in Chromium, with no npm dependencies.
import { createServer } from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { join, resolve, extname, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';

const root = resolve(import.meta.dirname, '..');
const sourceRevision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
let heroes = ['turtle_purple', 'turtle_blue', 'turtle_red', 'turtle_orange', 'nous_girl', 'teknium', 'turbofit', 'don_piedro'];
const mode = process.argv[2] || 'baseline';
if (!['baseline', 'after'].includes(mode)) throw Error('Usage: node tools/render-rigs.mjs baseline|after [--out DIR] [--heroes a,b]');
// --out DIR: where sheets (and, in after mode, comparison/) are written. The tracked before/,
// after/ and comparison/ folders at the repo root are historical evidence and are never written.
const argOf = name => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; };
const out = resolve(argOf('--out') || join(tmpdir(), `cpn-rig-sheets-${mode}`));
for (const tracked of ['before', 'after', 'comparison']) {
  const rel = relative(resolve(root, tracked), out);
  if (!rel.startsWith('..')) throw Error(`Refusing to write into tracked ${tracked}/ (pass --out to another directory)`);
}
const only = argOf('--heroes')?.split(',');
if (only) heroes = heroes.filter(h => only.includes(h));
const sha256 = data => createHash('sha256').update(data).digest('hex');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp' };
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const base = pathname.startsWith('/__out/') ? out : root;
    const path = resolve(base, '.' + pathname.replace(/^\/__out\//, '/'));
    if (!path.startsWith(base + '/')) throw Error('outside root');
    const data = await readFile(path);
    res.writeHead(200, { 'Content-Type': mime[extname(path)] || 'application/octet-stream' }); res.end(data);
  } catch { res.writeHead(404); res.end('not found'); }
});
server.listen(0, '127.0.0.1'); await once(server, 'listening');
const host = `http://127.0.0.1:${server.address().port}`;
const chrome = spawn(process.env.CHROMIUM || '/snap/bin/chromium', ['--headless', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--no-first-run', '--remote-debugging-port=0', '--user-data-dir=/tmp/opencode/rig-sheet-chrome-' + process.pid, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
let endpoint;
chrome.stderr.on('data', buf => { endpoint ||= buf.toString().match(/DevTools listening on (ws:\/\/[^\s]+)/)?.[1]; });
let socket;
let next = 0;
const pending = new Map();
function send(method, params = {}) {
  const id = ++next;
  const result = new Promise((ok, fail) => pending.set(id, { ok, fail }));
  socket.send(JSON.stringify({ id, method, params }));
  return result;
}
try {
  for (let i = 0; !endpoint && i < 100; i++) await sleep(100);
  if (!endpoint) throw Error('Chromium debugging endpoint did not start');
  const port = new URL(endpoint.replace('ws:', 'http:')).port;
  const tab = (await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json()).webSocketDebuggerUrl;
  socket = new WebSocket(tab);
  await new Promise((ok, fail) => { socket.onopen = ok; socket.onerror = fail; });
  socket.onmessage = ({ data }) => { const msg = JSON.parse(data); if (pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p.fail(Error(JSON.stringify(msg.error))) : p.ok(msg.result); } };
  await send('Page.enable'); await send('Runtime.enable');
  const captures = [];
  for (const hero of heroes) {
    const dest = join(out, `${hero}.png`);
    if (mode === 'baseline') { try { await access(dest); throw Error(`Immutable baseline already exists: ${dest}`); } catch (e) { if (e.code !== 'ENOENT') throw e; } }
    await send('Page.navigate', { url: `${host}/tools/rig-sheet.html?hero=${hero}&mode=${mode}` });
    let value;
    for (let i = 0; i < 200; i++) {
      const result = await send('Runtime.evaluate', { expression: 'window.__rigSheet', returnByValue: true });
      value = result.result.value;
      if (value) break;
      await sleep(100);
    }
    if (!value) throw Error(`${hero}: timed out waiting for sheet`);
    if (value.error) throw Error(`${hero}: ${JSON.stringify(value.error)}`);
    const data = Buffer.from(value.png.split(',')[1], 'base64');
    captures.push({ hero, dest, data, meta: { ...value, sourceRevision, png: undefined, sha256: sha256(data) } });
    console.log(`${hero}: ${value.poses.length} poses × 2 facings, ${value.assets.length} art files; absent: ${value.absent.join(', ') || 'none'}`);
  }
  await mkdir(out, { recursive: true });
  for (const { dest, data } of captures) await writeFile(dest, data, { flag: mode === 'baseline' ? 'wx' : 'w' });
  await writeFile(join(out, 'manifest.json'), JSON.stringify(captures.map(({ meta }) => meta), null, 2) + '\n', { flag: mode === 'baseline' ? 'wx' : 'w' });
  console.log(`Saved ${captures.length} sheets in ${out}`);
  if (mode === 'after') {
    const baseline = JSON.parse(await readFile(join(root, 'before/manifest.json'), 'utf8'));
    for (const entry of baseline) {
      if (sha256(await readFile(join(root, 'before', `${entry.hero}.png`))) !== entry.sha256)
        throw Error(`Baseline checksum mismatch: ${entry.hero}`);
    }
    const comparison = join(out, 'comparison');
    await mkdir(comparison, { recursive: true });
    for (const hero of heroes) {
      await send('Page.navigate', { url: `${host}/tools/compare-rigs.html?hero=${hero}&after=/__out` });
      let value;
      for (let i = 0; i < 200; i++) {
        const result = await send('Runtime.evaluate', { expression: 'window.__rigComparison', returnByValue: true });
        value = result.result.value;
        if (value) break;
        await sleep(100);
      }
      if (!value || value.error) throw Error(`Comparison ${hero}: ${JSON.stringify(value)}`);
      await writeFile(join(comparison, `${hero}.png`), Buffer.from(value.png.split(',')[1], 'base64'));
    }
    console.log(`Saved side-by-side PNGs in ${comparison}`);
  }
} finally { socket?.close(); chrome.kill(); server.close(); }
