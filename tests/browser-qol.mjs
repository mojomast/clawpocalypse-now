// tests/browser-qol.mjs — real-browser integration for the QoL pass.
//
// Uses the already-running local source server (default http://127.0.0.1:48791/)
// and the repo's Playwright/Chromium. Verifies, with zero uncaught page errors:
//   1. no-preference defaults are exactly DEFAULTS (nothing selected);
//   2. the pause OPTIONS menu exposes all six original options + screen shake,
//      pad preset/deadzone and the tutorial-replay row, and toggling one takes
//      effect on the live OPTIONS values in the same frame;
//   3. tutorial replay via the runtime's opts.onTutorialReplay closes the menu
//      and re-arms the coach;
//   4. the difficulty row (runtime callbacks) cycles a plain easy/normal/hard;
//   5. the pause CONTROLS screen lists accurate SPACE pizza + P2 help and draws
//      without throwing;
//   6. preferences persist across reload;
//   7. OS prefers-reduced-motion seeds reducedMotion/reducedFlash when nothing is
//      stored, and an explicitly saved false still wins.
//
// Screenshots are written only under QOL_SHOTS (default
// /tmp/opencode/gameplay-qol-performance/qol/).
//
// Run: node tests/browser-qol.mjs
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const SHOTS = process.env.QOL_SHOTS || '/tmp/opencode/gameplay-qol-performance/qol';
const URL = process.env.QOL_URL || 'http://127.0.0.1:48791/index.html';
mkdirSync(SHOTS, { recursive: true });

const EXPECTED_DEFAULTS = {
  reducedFlash: false, reducedMotion: false, subtitleScale: 1, textSpeed: 1,
  colourSafe: false, holdToAdvance: false, screenShake: true, padDeadzone: 0.25, padPreset: 'classic',
};
const REQUIRED_ROWS = ['music', 'sfx', 'screenShake', 'reducedFlash', 'reducedMotion',
  'subtitleScale', 'textSpeed', 'colourSafe', 'holdToAdvance', 'padDeadzone', 'padPreset', 'tutorial', 'back'];

const browser = await chromium.launch({
  headless: true, args: ['--no-sandbox'],
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
});

let failures = 0;
async function scenario(name, fn) {
  try { await fn(); console.log('  ok  ' + name); }
  catch (err) { failures++; console.log('  FAIL ' + name + ': ' + err.message); }
}

try {
  // -------------------------------------------------------------------------
  // Context 1: no OS preference, empty storage.
  // -------------------------------------------------------------------------
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    // A fresh browser context already has empty storage; the reload check below
    // needs storage to survive, so no init-script clear here.
    await page.goto(URL);
    await page.waitForFunction(() => window.__ppOptions && window.__ppPause && window.__ppState && window.__ppCoach);

    await scenario('no-preference defaults deep-equal DEFAULTS', async () => {
      const values = await page.evaluate(() => ({ ...window.__ppOptions.values }));
      assert.deepEqual(values, EXPECTED_DEFAULTS);
    });

    await scenario('pause exposes all option rows', async () => {
      const rows = await page.evaluate(() => window.__ppPause.optionRows());
      const ids = rows.map(r => r.id);
      for (const id of REQUIRED_ROWS) assert.ok(ids.includes(id), 'missing row ' + id);
      const pages = await page.evaluate(() => window.__ppPause.optionPages());
      assert.ok(pages >= 3, 'menu is paginated (got ' + pages + ' pages)');
      const dnote = (rows.find(r => r.id === 'difficulty') || {}).note || '';
      assert.ok(/change/i.test(dnote) && !/new enem/i.test(dnote), 'difficulty note is truthful (got "' + dnote + '")');
      const padNote = (rows.find(r => r.id === 'padPreset') || {}).note || '';
      assert.ok(/P1/i.test(padNote), 'pad preset note scopes alternate to P1 (got "' + padNote + '")');
    });

    await scenario('controls help: SPACE pizza + P2 lines', async () => {
      const lines = await page.evaluate(() => window.__ppPause.controlsLines());
      assert.ok(lines.some(l => /SPACE/i.test(l) && /pizza/i.test(l)), 'SPACE pizza hint present');
      assert.ok(!lines.some(l => /\bI throw pizza\b/.test(l)), 'stale I-throw hint removed');
      assert.ok(lines.some(l => /^P2\b/.test(l)), 'P2 keyboard help present');
      assert.ok(lines.some(l => /^PAD 2\b/.test(l)), 'P2 pad help present');
    });

    await scenario('toggling reducedFlash updates live values', async () => {
      const r = await page.evaluate(() => {
        const p = window.__ppPause; p.open('options');
        const idx = p.optionRows().findIndex(x => x.id === 'reducedFlash');
        for (let i = 0; i < idx; i++) p.handleKey({ code: 'ArrowDown', preventDefault() {} });
        p.handleKey({ code: 'Enter', preventDefault() {} });
        const on = window.__ppOptions.reducedFlash, scale = window.__ppOptions.shakeScale;
        p.handleKey({ code: 'Enter', preventDefault() {} });
        const off = window.__ppOptions.reducedFlash;
        p.close();
        return { on, scale, off };
      });
      assert.equal(r.on, true);
      assert.ok(Math.abs(r.scale - 0.33) < 1e-9, 'shakeScale damps to 0.33');
      assert.equal(r.off, false);
    });

    await scenario('tutorial replay closes menu and re-arms coach', async () => {
      const r = await page.evaluate(() => {
        const p = window.__ppPause; window.__ppCoach.force(null);
        p.open('options');
        const idx = p.optionRows().findIndex(x => x.id === 'tutorial');
        for (let i = 0; i < idx; i++) p.handleKey({ code: 'ArrowDown', preventDefault() {} });
        p.handleKey({ code: 'Enter', preventDefault() {} });
        return { open: p.isOpen(), active: window.__ppCoach.active, acknowledged: window.__ppCoach.acknowledged() };
      });
      assert.equal(r.open, false, 'menu closes before handing control over');
      assert.equal(r.active, true, 'coach re-armed by onTutorialReplay');
      assert.equal(r.acknowledged, false, 'coach completion flag cleared');
    });

    await scenario('difficulty row cycles easy/normal/hard', async () => {
      const r = await page.evaluate(() => {
        const p = window.__ppPause; p.open('options');
        const idx = p.optionRows().findIndex(x => x.id === 'difficulty');
        if (idx < 0) return { present: false };
        const before = window.__ppState.difficulty;
        for (let i = 0; i < idx; i++) p.handleKey({ code: 'ArrowDown', preventDefault() {} });
        p.handleKey({ code: 'Enter', preventDefault() {} });
        const after = window.__ppState.difficulty;
        p.close();
        return { present: true, before, after };
      });
      assert.equal(r.present, true, 'difficulty row present (runtime wired callbacks)');
      assert.ok(['easy', 'normal', 'hard'].includes(r.after), 'value stays plain ' + r.after);
      assert.notEqual(r.after, r.before, 'difficulty changes on activate');
    });

    await scenario('pause menus draw without throwing', async () => {
      // Draw on the live canvas (proves no throw in the real context), then
      // render clean menu stills to an offscreen canvas for the Review pane.
      const shots = await page.evaluate(() => {
        const W = 740, H = 510;
        const live = document.getElementById('c').getContext('2d');
        const still = (menu, downs = 0) => {
          const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
          const c = cv.getContext('2d');
          const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#0d1a14'); g.addColorStop(1, '#07100c');
          c.fillStyle = g; c.fillRect(0, 0, W, H);
          window.__ppPause.open(menu);
          for (let i = 0; i < downs; i++) window.__ppPause.handleKey({ code: 'ArrowDown', preventDefault() {} });
          window.__ppPause.draw(c); window.__ppPause.close();
          return cv.toDataURL('image/png');
        };
        window.__ppPause.open('controls'); window.__ppPause.draw(live);
        window.__ppPause.open('options'); window.__ppPause.draw(live);
        window.__ppPause.close();
        const pages = window.__ppPause.optionPages();
        const opts = {};
        for (let p = 1; p <= pages; p++) opts[`options-p${p}`] = still('options', (p - 1) * 4);
        return { controls: still('controls'), options: still('options'), ...opts };
      });
      for (const [name, dataUrl] of Object.entries(shots)) {
        writeFileSync(`${SHOTS}/pause-${name}.png`, Buffer.from(dataUrl.split(',')[1], 'base64'));
      }
    });

    await scenario('preferences persist across reload', async () => {
      await page.evaluate(() => {
        window.__ppOptions.set('reducedFlash', true);
        window.__ppOptions.set('padPreset', 'alternate');
      });
      await page.reload();
      await page.waitForFunction(() => window.__ppOptions);
      const p = await page.evaluate(() => ({ rf: window.__ppOptions.reducedFlash, pp: window.__ppOptions.padPreset }));
      assert.equal(p.rf, true);
      assert.equal(p.pp, 'alternate');
    });

    await scenario('no uncaught page errors (default context)', async () => {
      assert.deepEqual(errors, []);
    });
    await ctx.close();
  }

  // -------------------------------------------------------------------------
  // Context 2: OS reduced motion, empty storage -> seeded.
  // -------------------------------------------------------------------------
  {
    const ctx = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => { try { localStorage.clear(); } catch (_) {} });
    await page.goto(URL);
    await page.waitForFunction(() => window.__ppOptions);
    await scenario('OS reduce seeds reducedMotion/reducedFlash when unset', async () => {
      const s = await page.evaluate(() => ({
        rm: window.__ppOptions.reducedMotion, rf: window.__ppOptions.reducedFlash,
        scale: window.__ppOptions.shakeScale, motion: window.__ppOptions.motionScale,
      }));
      assert.equal(s.rm, true);
      assert.equal(s.rf, true);
      assert.equal(s.scale, 0, 'seeded reducedMotion suppresses shake');
      assert.equal(s.motion, 0);
      assert.deepEqual(errors, []);
    });
    await ctx.close();
  }

  // -------------------------------------------------------------------------
  // Context 3: OS reduce + explicit saved false -> explicit wins.
  // -------------------------------------------------------------------------
  {
    const ctx = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => {
      try { localStorage.setItem('pp.options', JSON.stringify({ reducedMotion: false, reducedFlash: false })); } catch (_) {}
    });
    await page.goto(URL);
    await page.waitForFunction(() => window.__ppOptions);
    await scenario('explicit saved false wins over OS reduce', async () => {
      const s = await page.evaluate(() => ({
        rm: window.__ppOptions.reducedMotion, rf: window.__ppOptions.reducedFlash, scale: window.__ppOptions.shakeScale,
      }));
      assert.equal(s.rm, false);
      assert.equal(s.rf, false);
      assert.equal(s.scale, 1);
      assert.deepEqual(errors, []);
    });
    await ctx.close();
  }

  // -------------------------------------------------------------------------
  // Context 4: actual 2P-down HUD and max-subtitle HUD bounds, in the real game.
  // -------------------------------------------------------------------------
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(URL);
    await page.waitForFunction(() => window.__ppOptions && window.__ppCoop && window.__ppState);

    await scenario('2P-down HUD renders a live countdown without throwing (real createCoop)', async () => {
      const r = await page.evaluate(() => {
        const s = window.__ppState, coop = window.__ppCoop;
        s.walkLevel = true; s.level = 1; s.over = false;
        coop.join(s, 'teknium');            // real P2 view on the live run state
        const v = coop.p2;
        if (!v) return { ok: false, reason: 'no P2 view' };
        v.over = true;
        const cv = document.createElement('canvas'); cv.width = 740; cv.height = 510;
        const c = cv.getContext('2d');
        const bg = c.createLinearGradient(0, 0, 0, 510); bg.addColorStop(0, '#0c1a14'); bg.addColorStop(1, '#07100c');
        c.fillStyle = bg; c.fillRect(0, 0, 740, 510);
        const texts = [];
        const orig = c.fillText;
        c.fillText = function (t, x, y, mw) { texts.push(String(t)); return orig.call(c, t, x, y, mw); };
        let err = null;
        try { coop.drawHud(c, s, 0.016, 740, 510); } catch (e) { err = String((e && e.message) || e); }
        let png = null;
        if (!err) { try { png = cv.toDataURL('image/png'); } catch (_) {} }
        return { ok: !err, err, countdown: texts.some(t => /\d+s/.test(t)), texts, getter: typeof coop.continueLeft, png };
      });
      assert.equal(r.ok, true, '2P down HUD draw did not throw: ' + r.err);
      assert.equal(r.getter, 'number', 'coop.continueLeft is a numeric getter');
      assert.ok(r.countdown, 'down card shows a live countdown: ' + JSON.stringify(r.texts));
      if (r.png) writeFileSync(SHOTS + '/hud-2p-down.png', Buffer.from(r.png.split(',')[1], 'base64'));
    });

    await scenario('HUD at max subtitle scale fits the frame and its fields (measured)', async () => {
      const r = await page.evaluate(async () => {
        const { createHud } = await import('/hud.js');
        const { OPTIONS } = await import('/options-live.js');
        OPTIONS.set('subtitleScale', 1.6);
        const hud = createHud();
        const W = 740, H = 510;
        const rec = [];
        const canvasFor = () => {
          const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
          const c = cv.getContext('2d');
          const orig = c.fillText;
          c.fillText = function (t, x, y, mw) { rec.push({ t: String(t), x, y, mw: mw == null ? null : mw, w: c.measureText(String(t)).width, align: c.textAlign }); return orig.call(c, t, x, y, mw); };
          return { cv, c };
        };
        const state = { selectedHero: 'don_piedro', hp: 80, maxHp: 100, lives: 3, score: 123456, combo: 5, comboTimer: 1.2, weaponLevel: 3, weaponDurability: 9, player: { shield: false } };
        const one = canvasFor();
        hud.player(one.c, state, 0.016);
        hud.controls(one.c, W, H, { chain: 4, airborne: true });
        const two = canvasFor();
        hud.player(two.c, { ...state, selectedHero: 'teknium' }, 0.016, 10, 22, { score: true, tag: '2P' });
        OPTIONS.set('subtitleScale', 1);
        const boxes = rec.map(x => {
          const eff = x.mw != null ? Math.min(x.w, x.mw) : x.w;
          const left = x.align === 'center' ? x.x - eff / 2 : (x.align === 'right' ? x.x - eff : x.x);
          return { t: x.t, left, right: left + eff, mw: x.mw };
        });
        const name = boxes.find(b => b.t === 'DON PIEDRO');
        const hpText = boxes.find(b => /^\d+ \/ \d+$/.test(b.t));
        const footer = boxes.find(b => /PUNCH/.test(b.t));
        return {
          W, boxes,
          nameRight: name ? name.right : null, nameMw: name ? name.mw : null,
          hpRight: hpText ? hpText.right : null, hpMw: hpText ? hpText.mw : null,
          footerMw: footer ? footer.mw : null, footerLeft: footer ? footer.left : null, footerRight: footer ? footer.right : null,
          one: one.cv.toDataURL('image/png'), two: two.cv.toDataURL('image/png'),
        };
      });
      const outside = r.boxes.filter(b => b.left < -0.5 || b.right > r.W + 0.5);
      assert.deepEqual(outside, [], 'no HUD text exceeds the 740px frame at subtitleScale 1.6');
      assert.ok(r.nameMw != null && r.nameMw <= 144, 'hero name declares a bounded width (got ' + r.nameMw + ')');
      assert.ok(r.nameRight <= 2 + 58 + 144 + 0.5, 'hero name box stays inside its field (does not reach WEAPON): ' + r.nameRight);
      assert.ok(r.footerMw != null && r.footerMw <= r.W, 'footer legend declares a bounded width');
      assert.ok(r.footerLeft >= -0.5 && r.footerRight <= r.W + 0.5, 'footer legend fits inside the frame');
      assert.ok(r.hpMw != null && r.hpRight <= 322, 'HP numeric stays inside the hero card (got right ' + r.hpRight + ')');
      writeFileSync(SHOTS + '/hud-1p-scale1.6.png', Buffer.from(r.one.split(',')[1], 'base64'));
      writeFileSync(SHOTS + '/hud-2p-scale1.6.png', Buffer.from(r.two.split(',')[1], 'base64'));
    });

    await scenario('no uncaught page errors (2P-down / HUD context)', async () => {
      assert.deepEqual(errors, []);
    });
    await ctx.close();
  }
} finally {
  await browser.close();
}

if (failures > 0) {
  console.error(`browser-qol: ${failures} scenario(s) failed`);
  process.exit(1);
}
console.log('browser-qol: menu/prefs/replay/P2 down HUD + max-scale HUD bounds verified with no page errors.');
