#!/usr/bin/env node
// Capture key-pose strips and full contact sheets for v2 heroes from ANY checkout (so a
// "before" can be rendered from the base branch with the same code path as "after").
// Usage: node tools/capture-hero-evidence.mjs --root <checkout> --out <dir> --heroes teknium,nous_girl
// Writes <out>/<hero>-keyposes.png (6 poses; row 1 right-facing, row 2 left-facing; rig scale 0.8) and
// <out>/<hero>-contact.png (tools/rig-sheet.html, every named pose, both facings).
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { once } from 'node:events';
const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const root = resolve(arg('--root', resolve(import.meta.dirname, '..')));
const out = resolve(arg('--out', '/tmp/hero-evidence'));
const heroes = arg('--heroes', 'teknium,nous_girl').split(',');
const tool = resolve(import.meta.dirname, 'capture-hero-evidence.html');
export const KEY_POSES = {
  teknium: ['idleA', 'bladeA_active', 'bladeC_active', 'burst_active', 'taunt', 'victory'],
  nous_girl: ['idleA', 'whipA_active', 'wave_active', 'bassDrop_active', 'taunt', 'victory'],
  turbofit: ['idleA', 'axe_active', 'axeHeavy_active', 'chord_active', 'taunt', 'victory'],
};
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json' };
const server = createServer(async (req, res) => {
  try {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const file = p === '/__evidence.html' ? tool : resolve(root, '.' + p);
    if (file !== tool && !file.startsWith(root + '/')) throw Error('outside');
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream' }); res.end(data);
  } catch { res.writeHead(404); res.end(); }
});
server.listen(0, '127.0.0.1'); await once(server, 'listening');
const host = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
try {
  await mkdir(out, { recursive: true });
  const page = await browser.newPage();
  page.on('pageerror', e => console.error('pageerror', e.message));
  for (const hero of heroes) {
    const poses = arg('--poses', KEY_POSES[hero].join(',')), scale = arg('--scale', '0.8');
    await page.goto(`${host}/__evidence.html?hero=${hero}&poses=${poses}&scale=${scale}&bg=${encodeURIComponent(arg('--bg', '#3b4459'))}`);
    await page.waitForFunction(() => window.__keyposes, null, { timeout: 30000 });
    const kp = await page.evaluate(() => window.__keyposes);
    if (kp.error) throw Error(kp.error);
    await writeFile(resolve(out, `${hero}-${arg('--name', 'keyposes')}.png`), Buffer.from(kp.png.split(',')[1], 'base64'));
    if (process.argv.includes('--keyposes-only')) { console.log(`${hero}: key poses -> ${out}`); continue; }
    await page.goto(`${host}/tools/rig-sheet.html?hero=${hero}&mode=baseline`);
    await page.waitForFunction(() => window.__rigSheet, null, { timeout: 600000 });
    const cs = await page.evaluate(() => window.__rigSheet);
    if (cs.error) throw Error(JSON.stringify(cs.error));
    await writeFile(resolve(out, `${hero}-contact.png`), Buffer.from(cs.png.split(',')[1], 'base64'));
    console.log(`${hero}: key poses + contact sheet (${cs.poses.length} poses x 2 facings) -> ${out}`);
  }
} finally { await browser.close(); server.close(); }
