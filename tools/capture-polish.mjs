#!/usr/bin/env node
// Source-isolated before/after captures, deterministic 60Hz replay and 30fps MP4.
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import assert from 'node:assert/strict';
const root = resolve(import.meta.dirname, '..'), mode = process.argv[2] || 'after';
assert.ok(['before', 'after', 'protected'].includes(mode));
const source = mode === 'before' ? resolve(process.env.BASELINE_ROOT || '/tmp/opencode/hero-polish-baseline') : root;
const out = resolve(root, 'evidence/hero-animation-polish', mode);
const pathFor = url => {
  const p = decodeURIComponent(new URL(url, 'http://localhost').pathname);
  return resolve(p.startsWith('/tools/polish-review.') ? root : source, '.' + p);
};
const server = createServer(async (req, res) => {
  try { const p = pathFor(req.url); if (![root, source].some(r => p.startsWith(r + '/'))) throw Error('outside root');
    res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg' })[extname(p)] || 'application/octet-stream'); res.end(await readFile(p));
  } catch { res.writeHead(404); res.end(); }
});
server.listen(0, '127.0.0.1'); await once(server, 'listening');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/snap/bin/chromium', headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage(), errors = [];
  page.on('pageerror', e => { errors.push(e.message); console.error(e.message); });
  await page.goto(`http://127.0.0.1:${server.address().port}/tools/polish-review.html`);
  await page.waitForFunction(() => window.polish, { timeout: 30000 });
  const hashes = await page.evaluate(() => polish.protectedHashes());
  if (mode === 'before') {
    await mkdir(out, { recursive: true });
    await assert.rejects(access(resolve(out, 'manifest.json')), 'baseline already exists');
    await writeFile(resolve(out, 'protected-renders.json'), JSON.stringify(hashes, null, 2));
  } else {
    assert.deepEqual(hashes, JSON.parse(await readFile(resolve(root, 'evidence/hero-animation-polish/before/protected-renders.json'))), 'Protected hero pixel output changed');
    console.log('Protected heroes: all named poses × both facings byte-identical RGBA');
  }
  if (mode !== 'protected') {
    const manifest = { revision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: source, encoding: 'utf8' }).trim(), scale: .7, fps: 30, clips: [] };
    for (const hero of ['teknium', 'nous_girl', 'turbofit']) {
      await mkdir(resolve(out, hero), { recursive: true });
      const moves = await page.evaluate(h => [...polish.moves(h), ...polish.states], hero);
      for (const move of moves) {
        const { frames, sequence } = await page.evaluate(([h, m]) => polish.start(h, m), [hero, move]);
        const dest = resolve(out, hero, move + '.mp4');
        const encoder = spawn('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'image2pipe', '-framerate', '30', '-i', '-', '-an', '-c:v', 'libx264', '-preset', 'fast', '-crf', '20', '-pix_fmt', 'yuv420p', dest]);
        const done = once(encoder, 'exit'), selected = [];
        for (let f = 0; f < frames; f++) {
          const png = await page.evaluate(() => polish.draw());
          if (f % 2 === 0) { if (!encoder.stdin.write(Buffer.from(png.split(',')[1], 'base64'))) await once(encoder.stdin, 'drain'); }
          if (f % Math.max(1, Math.floor(frames / 8)) === 0 && selected.length < 8) selected.push(png);
        }
        encoder.stdin.end(); assert.equal((await done)[0], 0, 'ffmpeg failed');
        const strip = await page.evaluate(async frames => {
          const c = document.createElement('canvas'); c.width = 960; c.height = 150 * frames.length;
          const ctx = c.getContext('2d');
          for (const [i, src] of frames.entries()) { const im = new Image(); im.src = src; await im.decode(); ctx.drawImage(im, 0, 0, 480, 300, 0, i * 150, 240, 150); ctx.drawImage(im, 480, 0, 480, 300, 240, i * 150, 240, 150); ctx.drawImage(im, 110, 45, 300, 230, 480, i * 150, 196, 150); ctx.drawImage(im, 550, 45, 300, 230, 700, i * 150, 196, 150); }
          return c.toDataURL('image/png');
        }, selected);
        await writeFile(resolve(out, hero, move + '.png'), Buffer.from(strip.split(',')[1], 'base64'));
        manifest.clips.push({ hero, move, frames, sequence, file: `${hero}/${move}.mp4` });
        console.log(mode, hero, move, frames);
      }
    }
    await writeFile(resolve(out, 'manifest.json'), JSON.stringify(manifest, null, 2));
  }
  assert.deepEqual(errors, [], 'browser errors');
} finally { await browser.close(); server.close(); }
