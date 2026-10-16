// Actual game-loop depth integration check, including co-op and individual bots.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
// Integration JSON goes to --out DIR (default: a temp folder), never the tracked after/.
const outArg = process.argv.indexOf('--out');
const out = resolve(outArg > 0 ? process.argv[outArg + 1] : join(tmpdir(), 'cpn-level-layout-smoke'));
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || '/snap/bin/chromium', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [], httpErrors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('response', response => { if (response.status() >= 400) httpErrors.push({ status: response.status(), url: response.url() }); });
const results = [];
try {
  await page.goto(process.env.GAME_URL || 'http://127.0.0.1:48791/index.html?coach=0');
  await page.waitForFunction(() => !!window.__ppRig && !!window.__ppTitle);
  await page.keyboard.press('Enter'); await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__ppTitle.ready());
  await page.keyboard.press('Enter'); await page.waitForFunction(() => window.__ppSelect.active);
  await page.keyboard.press('Enter'); await page.waitForFunction(() => window.__ppCinema.isActive());
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !window.__ppCinema.isActive() && window.__ppState.combat.now > 0.2);
  const start = await page.evaluate(() => window.__ppState.player.x);
  await page.keyboard.down('ArrowRight'); await page.waitForTimeout(400); await page.keyboard.up('ArrowRight');
  assert.ok(await page.evaluate(() => window.__ppState.player.x) > start, 'real keyboard movement');
  await page.keyboard.press('KeyP'); // Freeze simulation while retaining real rendering.
  await page.evaluate(() => {
    const state = window.__ppState;
    // Injected boss fixtures must not switch away from gameplay into a cinematic.
    window.__ppCinema.play = () => {};
    window.__ppCoop.join(state, 'turtle_blue');
    window.__depthTrace = [];
    const proto = CanvasRenderingContext2D.prototype;
    const reset = proto.reset;
    proto.reset = function (...args) { window.__depthTrace = []; return reset.apply(this, args); };
    const image = proto.drawImage;
    proto.drawImage = function (im, ...args) {
      if (im?.src?.endsWith('/props/barrel.png')) window.__depthTrace.push('barrel');
      return image.call(this, im, ...args);
    };
    const rig = window.__ppRig, draw = rig.draw;
    rig.draw = function (ctx, kind, angles, x, ...rest) {
      const label = ({ 700: 'P1', 720: 'P2', 740: 'rear enemy', 760: 'front boss' })[x];
      if (label) window.__depthTrace.push(label);
      return draw.call(this, ctx, kind, angles, x, ...rest);
    };
    Object.assign(state, { level: 0, walkLevel: true, invuln: 0, cameraX: 400, events: null });
    Object.assign(state.player, { x: 700, y: 420, z: 100 });
    Object.assign(state.combat, { airborne: true });
    Object.assign(window.__ppCoop.p2.player, { x: 720, y: 430, z: 0 });
    window.__ppCoop.p2.invuln = 0;
    state.ninjas = [
      { kind: 'boss', rigKind: 'brawler', x: 760, y: 434, r: 23, hp: 10, maxHp: 10, vx: 0, face: -1, level: 0 },
      { kind: 'brawler', x: 740, y: 390, r: 17, hp: 2, maxHp: 2, vx: 0, face: -1, level: 0 },
    ];
  });
  await page.waitForTimeout(400);
  const trace = await page.evaluate(() => window.__depthTrace);
  assert.deepEqual(trace.filter(x => x !== 'barrel'), ['rear enemy', 'P1', 'P2', 'front boss']);
  assert.ok(trace.indexOf('P2') < trace.indexOf('barrel') && trace.indexOf('barrel') < trace.indexOf('front boss'), 'foreground barrel occludes rear fighters, not front boss');
  assert.equal(trace.filter(x => x === 'barrel').length, 1, 'prop drawn exactly once');
  results.push({ stage: 'sewer', trace });
  // Exercise all stage-specific depth collectors in the actual game, including
  // cabinet initialization and co-op. Hero starts are chosen by production API.
  for (const level of [1, 2, 3, 4, 5, 6, 7]) {
    await page.evaluate(async level => {
      const { LEVELS, resolveWalkable } = await import('/collision.js');
      const s = window.__ppState, lv = LEVELS[level];
      s.level = level; s.player.level = level; s.wave++; s.cameraX = 0; s.ninjas = []; s.events = null;
      const pos = resolveWalkable(level, 520, lv.spawnY(() => 0.5), s.player.r);
      Object.assign(s.player, pos, { z: 0 }); s.combat.airborne = false;
      Object.assign(window.__ppCoop.p2.player, resolveWalkable(level, 580, pos.y, 16), { level, z: 0 });
    }, level);
    await page.waitForTimeout(150);
    const renderErrors = await page.evaluate(() => window.__ppRenderErrors);
    assert.equal(renderErrors.count, 0, `stage ${level} renderer errors`);
    results.push({ level, renderErrors });
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(httpErrors, []);
  console.log('Actual depth queue: rear enemy → airborne P1 → P2 → barrel → front boss; all eight stages render without errors.');
} finally {
  await mkdir(out, { recursive: true });
  await writeFile(join(out, 'integration.json'), JSON.stringify({ results, errors, httpErrors }, null, 2) + '\n');
  await browser.close();
}
