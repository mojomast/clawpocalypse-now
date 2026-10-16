// Browser gameplay smoke: helper-driven purchase, then real melee and co-op projectile steps.
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const evidence = '/tmp/opencode/challenge-routes/combat';
mkdirSync(evidence, { recursive: true });
const port = 48837;
const server = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], { cwd: new URL('..', import.meta.url), stdio: 'ignore' });
let browser;
try {
  await new Promise(r => setTimeout(r, 450));
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'], ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  await page.goto(`http://127.0.0.1:${port}/index.html?coach=0`);
  await page.waitForFunction(() => !!window.__ppTitle);
  await page.keyboard.press('Enter'); await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__ppTitle.ready());
  await page.keyboard.press('Enter'); await page.waitForFunction(() => window.__ppSelect.active);
  await page.keyboard.press('Digit1'); await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__ppCinema.isActive());
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !window.__ppCinema.isActive() && !!window.__ppState.combat);

  const result = await page.evaluate(async () => {
    const { combatPress, combatStep, createCombat, attackBox } = await import('/combat.js');
    const { throwPizza } = await import('/logic.js');
    const s = window.__ppState, shop = window.__ppShop, coop = window.__ppCoop;
    // Shop UI helper purchase; contact assertions below use the real combat paths.
    s.coins = 30;
    const opened = shop.open(s, { level: 0 });
    const bought = shop.buy(1);
    shop.leave();
    const purchase = { opened, bought, mult: s.dmgMult, buys: s.shopBuys.dmg };

    // All fixtures live inside one synchronous evaluation: the RAF world cannot
    // spawn or move enemies between steps. Scripted targets skip enemy AI/scaling.
    s.ninjas = []; s.pizzas = []; s.powerups = [];
    s.walkLevel = true; s.wave = 1; s.player.x = 400; s.player.y = 420;
    s.hurtT = 0; s.playerDown = 0; s.over = false;
    createCombat(s);
    const target = (kind, x = 450, hp = 30) => ({ kind, x, y: 420, r: 16, hp, maxHp: hp, vx: 0, vy: 0, scripted: true, dead: false });
    const swing = n => {
      s.ninjas = [n];
      const started = combatPress(s, 'punch');
      const box = attackBox(s, s.combat.attack);
      if (box.empty || !Number.isFinite(box.x0 + box.x1)) throw new Error('melee contact box is empty');
      n.x = (box.x0 + box.x1) / 2;
      for (let i = 0; i < 60 && s.combat.landed === 0; i++) combatStep(s, 1 / 120);
      return { started, attempts: s.combat.hits, landed: s.combat.landed, hp: n.hp, combo: s.combo };
    };
    const foe = target('brawler');
    const melee = swing(foe);
    foe.x = 450; foe.y = 420;
    const v = coop.join(s, 'turbofit');
    if (!v || coop.p2 !== v || v.hitOwnerState !== s) throw new Error('real P2 view did not join');
    v.player.x = 400; v.player.y = 420; v.weaponLevel = 5; v.spreadTimer = 0;
    const shot = () => { throwPizza(v); coop.step(s, 0.06); };
    shot();
    const first = { hp: foe.hp, combo: v.combo, extra: s.shopExtraDmg || 0 };
    shot();
    shop.stepWorld(s);
    const second = { hp: foe.hp, combo: v.combo, extra: s.shopExtraDmg || 0, stat: shop.stats.extraDmg };

    // A nonpiercing P2 shot passes over down/waking/grabbed bodies and is
    // consumed by the first eligible body, leaving the next eligible one intact.
    s.ninjas = [target('brawler', 435), target('brawler', 440), target('brawler', 445), target('brawler', 450), target('brawler', 455)];
    const [down, wake, grabbed, eligible, behind] = s.ninjas;
    down.down = 1; wake.wake = 1; grabbed.grabbed = true;
    v.weaponLevel = 2; v.pizzas = []; v.player.x = 400; v.player.y = 420;
    shot();
    const skip = { hp: s.ninjas.map(n => n.hp), combo: v.combo, pizzas: v.pizzas.length };

    // An adopted boss is immune even when its kind is not literally 'boss'.
    // Check both real contact paths and their feedback/accounting.
    const rider = target('rider', 450, 50);
    s.ninjas = [rider]; s.bossFight = { active: { n: rider, invuln: 2 } };
    createCombat(s); s.player.x = 400; s.player.y = 420;
    const cues = [];
    s.audioCue = name => cues.push(`audio:${name}`);
    s.fxCue = name => cues.push(`fx:${name}`);
    const before = { p1Combo: s.combo, p2Combo: v.combo, extra: s.shopExtraDmg || 0 };
    const immuneMelee = swing(rider);
    rider.x = 450; rider.y = 420;
    v.pizzas = []; v.player.x = 400; v.player.y = 420;
    shot();
    shop.stepWorld(s);
    const immune = { hp: rider.hp, landed: s.combat.landed, react: rider.react || null,
      stun: rider.stun || 0, hitCues: cues.filter(c => c === 'audio:melee' || c === 'fx:hit'),
      p1Combo: s.combo, p2Combo: v.combo, extra: s.shopExtraDmg || 0,
      stat: shop.stats.extraDmg, pizzas: v.pizzas.length };
    delete s.bossFight;
    return { purchase, melee, first, second, skip, immuneMelee, immune, before, joined: coop.p2 === v };
  });
  assert.deepEqual(result.purchase, { opened: true, bought: true, mult: 1.15, buys: 1 }, 'helper purchase');
  assert.equal(result.melee.started, 'Jab');
  assert.deepEqual([result.melee.attempts, result.melee.landed, result.melee.hp, result.melee.combo], [1, 1, 29, 1], 'combatPress/combatStep contact');
  assert.equal(result.joined, true);
  assert.deepEqual(result.first, { hp: 25, combo: 1, extra: 0 }, 'first real P2 pizza accumulates fractional bonus');
  assert.deepEqual(result.second, { hp: 20, combo: 2, extra: 1, stat: 1 }, 'second real P2 pizza earns shared bonus');
  assert.deepEqual(result.skip, { hp: [30, 30, 30, 29, 30], combo: 3, pizzas: 0 }, 'nonpiercing P2 shot skips ineligible bodies and stops at first eligible');
  assert.deepEqual([result.immuneMelee.attempts, result.immuneMelee.landed], [1, 0], 'adopted rider rejects a real melee contact attempt');
  assert.deepEqual(result.immune, { hp: 50, landed: 0, react: null, stun: 0, hitCues: [],
    p1Combo: result.before.p1Combo, p2Combo: result.before.p2Combo,
    extra: result.before.extra, stat: result.before.extra, pizzas: 0 }, 'immune rider rejects melee/P2 pizza without hit feedback or accounting');
  const zeroHud = await page.evaluate(async () => {
    const s = window.__ppState, coop = window.__ppCoop, v = coop.p2;
    const { continueLabel } = await import('/coop.js');
    const canvas = document.createElement('canvas'); canvas.width = 740; canvas.height = 510;
    const ctx = canvas.getContext('2d'); const original = ctx.fillText.bind(ctx), texts = [];
    ctx.fillText = (text, x, y, ...rest) => {
      if (String(text).includes('continue')) texts.push({ text, x, width: ctx.measureText(text).width });
      return original(text, x, y, ...rest);
    };
    const prior = v.over, px = s.player.x; v.over = true; s.player.x = v.player.x + 200;
    try { coop.step(s, 10.1); coop.drawHud(ctx, s, 0, 740, 510); } finally { v.over = prior; s.player.x = px; }
    return { label: continueLabel(2, 0), measured: texts.find(t => t.text.startsWith('START: continue')) };
  });
  assert.equal(zeroHud.label, 'START: continue (2 left) - ready');
  assert.ok(zeroHud.measured && zeroHud.measured.text.endsWith('- ready') && zeroHud.measured.width <= 318 * 0.9 - 12, 'real zero-second P2-down prompt fits card');
  await page.screenshot({ path: `${evidence}/effective-hits.png` });
  assert.deepEqual(errors, [], 'browser console errors/pageerrors');
  assert.deepEqual(await page.evaluate(() => window.__ppRenderErrors), { count: 0, by: {} }, 'guarded renderer errors');
  console.log('browser effective hits: helper purchase + stepped P1 melee/P2 projectiles, eligibility and immunity OK');
} finally {
  await browser?.close();
  server.kill();
}
