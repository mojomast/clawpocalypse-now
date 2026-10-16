import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, extname, join } from 'node:path';
import { chromium } from '/workspace/cpn-v2/node_modules/playwright/index.mjs';
const root = '/tmp/cpn-hv2-clone', out = process.argv[2];
const heroes = ['turtle_purple', 'turtle_blue', 'turtle_red', 'turtle_orange', 'nous_girl', 'teknium', 'turbofit', 'don_piedro'];
const seqs = ['walk', 'run', 'idle-to-attack', 'combo', 'turn', 'landing', 'hurt-down-getup'];
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json' };
const server = createServer(async (req, res) => { try { const p = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://x').pathname)); const d = await readFile(p); res.writeHead(200, { 'Content-Type': mime[extname(p)] || 'application/octet-stream' }); res.end(d); } catch { res.writeHead(404); res.end(); } });
await new Promise(r => server.listen(0, '127.0.0.1', r));
const host = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] });
const page = await browser.newPage();
const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => m.type() === 'error' && errs.push(m.text()));
const manifest = [];
try {
  for (const hero of heroes) {
    await mkdir(join(out, 'motion', hero), { recursive: true }); await mkdir(join(out, 'gameplay'), { recursive: true });
    for (const seq of seqs) {
      await page.goto(`${host}/__hv2/strips.html?hero=${hero}&seq=${seq}`);
      const v = await page.waitForFunction(() => window.__strip, null, { timeout: 120000 }).then(h => h.jsonValue());
      const f = join(out, 'motion', hero, `${seq}.png`);
      await writeFile(f, Buffer.from(v.png.split(',')[1], 'base64'));
      manifest.push({ hero, seq, file: f.replace(out + '/', ''), sampledFrames: v.frames });
      console.log(hero, seq, v.frames);
    }
    await page.goto(`${host}/__hv2/gameplay.html?hero=${hero}`);
    const g = await page.waitForFunction(() => window.__gameplay, null, { timeout: 60000 }).then(h => h.jsonValue());
    await writeFile(join(out, 'gameplay', `${hero}_gameplay-scale.png`), Buffer.from(g.png.split(',')[1], 'base64'));
    await writeFile(join(out, 'gameplay', `${hero}_3x-crop.png`), Buffer.from(g.crop.split(',')[1], 'base64'));
  }
} finally { await browser.close(); server.close(); }
await writeFile(join(out, 'motion', 'manifest.json'), JSON.stringify({ sourceRevision: 'a53e191', harness: 'scratch /tmp/cpn-hv2-clone/__hv2 (copied to evidence/hero-assets-v2/before/harness/)', errors: errs, strips: manifest }, null, 2));
console.log('errors', errs);
