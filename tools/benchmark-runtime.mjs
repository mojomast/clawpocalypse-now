// tools/benchmark-runtime.mjs — frame-time DIAGNOSTIC for the runtime telemetry
// (roadmap item 9). It loads the real game in headless Chromium and reports, per
// scenario, the frame-time p50/p95/p99, sim/render means, substeps and dropped time
// from window.__ppPerf.
//
//   python3 -m http.server 48791   # repo root
//   node tools/benchmark-runtime.mjs [--out DIR]
//
// HEADLESS SOFTWARE-RASTER DIAGNOSTIC ONLY. Headless Chromium rasterises on the CPU
// (SwiftShader), so these absolute numbers are NOT device FPS and must never be
// quoted as such. They are only useful as a relative before/after signal. Use a
// real device + the manual playtest steps in tests/browser-runtime.mjs for FPS.
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const BASE_URL = process.env.GAME_URL || 'http://127.0.0.1:48791/index.html?coach=0&debug=1';
const CHROMIUM = process.env.CHROMIUM_PATH || process.env.CHROMIUM || '/snap/bin/chromium';
const outIdx = process.argv.indexOf('--out');
const OUT = outIdx > 0 ? process.argv[outIdx + 1] : (process.env.RUNTIME_EVIDENCE_DIR || '/tmp/opencode/gameplay-qol-performance/runtime');

// Server lifetime: use the EXTERNAL server when the base origin is up; otherwise spawn
// our OWN server on a PRIVATE loopback port and kill ONLY that child PID on exit.
// Never pkill by port/name: another workstream may own the shared 48791 server.
async function httpUp(o) { try { const r = await fetch(o + '/index.html', { method: 'HEAD' }); return r.ok; } catch { return false; } }
function stopOwnServer() { if (!server) return; try { server.kill('SIGTERM'); } catch { /* ignore */ } server = null; }
let server = null;
let origin = new URL(BASE_URL).origin;
if (!(await httpUp(origin))) {
  const sharedPort = new URL(BASE_URL).port || '80';
  const candidates = [];
  for (let i = 0; i < 5; i++) candidates.push(20000 + ((process.pid + i * 131) % 20000));
  for (const port of candidates) {
    if (String(port) === sharedPort) continue;
    const child = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], { cwd: new URL('..', import.meta.url), stdio: 'ignore' });
    const own = `http://127.0.0.1:${port}`;
    let up = false;
    for (let i = 0; i < 40; i++) { if (await httpUp(own)) { up = true; break; } await new Promise(r => setTimeout(r, 150)); }
    if (up) { server = child; origin = own; break; }
    try { child.kill('SIGTERM'); } catch { /* ignore */ }
  }
  if (!server) throw new Error('no static server: shared origin down and own spawn failed at ' + origin);
}
const GAME_URL = BASE_URL.replace(new URL(BASE_URL).origin, origin);

const rows = [];
const browser = await chromium.launch({ headless: true, executablePath: CHROMIUM, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  await page.goto(GAME_URL);
  await page.waitForFunction(() => !!window.__ppRig && !!window.__ppPerf);
  await page.keyboard.press('Enter'); await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__ppTitle.ready());
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__ppSelect.active);
  await page.keyboard.press('Digit1'); await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__ppCinema.isActive());
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !window.__ppCinema.isActive() && window.__ppState.combat.now > 0.2);

  async function scenario(name, ms, drive) {
    await page.evaluate(() => window.__ppPerf.reset());
    if (drive) await drive();
    await page.waitForTimeout(ms);
    if (drive && drive.release) await drive.release();
    const s = await page.evaluate(() => window.__ppPerf.snapshot());
    rows.push({ scenario: name, ...s });
    const warn = s.substeps.perFrameMax > 12 ? '  !! substeps over MAX_SUBSTEPS' : '';
    console.log(`${name.padEnd(14)} frames=${String(s.frames).padStart(4)} fps=${String(s.fps).padStart(6)}  p50=${s.frameMs.p50}ms p95=${s.frameMs.p95}ms p99=${s.frameMs.p99}ms  sim=${s.simMs}ms render=${s.renderMs}ms  subMax=${s.substeps.perFrameMax} dropped=${s.droppedMs}ms${warn}`);
  }

  await scenario('idle', 1500, null);
  await scenario('walk', 1500, async () => { await page.keyboard.down('ArrowRight'); });
  // Release the walk key before the next scenario.
  await page.keyboard.up('ArrowRight').catch(() => {});
  await scenario('attack', 1500, async () => {
    for (let i = 0; i < 12; i++) { await page.keyboard.press('KeyJ'); await page.waitForTimeout(90); }
  });
  await page.keyboard.up('ArrowRight').catch(() => {});

  await mkdir(OUT, { recursive: true });
  const report = {
    at: new Date().toISOString(),
    url: GAME_URL,
    caveat: 'HEADLESS SOFTWARE-RASTER DIAGNOSTIC — NOT device FPS. Relative signal only.',
    chromium: CHROMIUM,
    rows,
  };
  await writeFile(`${OUT}/benchmark-runtime.json`, JSON.stringify(report, null, 2));
  console.log(`\nHEADLESS SOFTWARE-RASTER DIAGNOSTIC ONLY — not device FPS.\nWrote ${OUT}/benchmark-runtime.json`);
} finally {
  await browser.close().catch(() => {});
  stopOwnServer(); // own child PID only; an external server is never touched
}
