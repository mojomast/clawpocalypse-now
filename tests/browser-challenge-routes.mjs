// Real input-path checks: route selection, live encounter, stage-entry save and Continue.
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const URL = process.env.GAME_URL || 'http://127.0.0.1:48791/index.html?coach=0';
const SHOTS = '/tmp/opencode/challenge-routes/routes';
mkdirSync(SHOTS, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'],
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(URL);
  await page.waitForFunction(() => !!window.__ppState && !!window.__ppTitle);
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__ppTitle.ready());
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__ppSelect.active);
  const mutedBefore = await page.evaluate(() => window.__ppAudio.muted);
  await page.keyboard.press('KeyM');
  assert.notEqual(await page.evaluate(() => window.__ppAudio.muted), mutedBefore, 'M still mutes on hero select');
  await page.evaluate(() => {
    const pad = { connected: true, buttons: Array.from({ length: 16 }, () => ({ pressed: false })), axes: [0, 0] };
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [pad] });
    window.__challengePad = pad;
    pad.buttons[3].pressed = true; // actual gamepad poll: Y -> KeyR on select
  });
  await page.waitForFunction(() => window.__ppGamepad?.log.includes('keydown:KeyR'));
  await page.evaluate(() => { window.__challengePad.buttons[3].pressed = false; });
  await page.waitForTimeout(60); // allow a neutral poll before the BACK edge
  const padMuteBefore = await page.evaluate(() => window.__ppAudio.muted);
  await page.evaluate(() => { window.__challengePad.buttons[8].pressed = true; });
  await page.waitForFunction(was => window.__ppAudio.muted !== was && window.__ppGamepad.log.includes('keydown:KeyM'), padMuteBefore);
  await page.evaluate(() => { window.__challengePad.buttons[8].pressed = false; });
  // Bottom-row selection magnifies its name: measure actual canvas text bounds,
  // not only the absence of a render exception or a top-row screenshot.
  await page.keyboard.press('Digit7');
  const selectBounds = await page.evaluate(async () => {
    const { HEROES } = await import('/heroes.js');
    const names = new Set(HEROES.map(h => h.name));
    const stat = HEROES[window.__ppSelect.index].stat;
    const proto = CanvasRenderingContext2D.prototype, original = proto.fillText;
    const boxes = [];
    proto.fillText = function(text, x, y, ...args) {
      if (names.has(text) || text === stat || String(text).startsWith('READY:')) {
        const m = this.measureText(text), t = this.getTransform();
        boxes.push({ text, top: t.d * (y - m.actualBoundingBoxAscent) + t.f,
          bottom: t.d * (y + m.actualBoundingBoxDescent) + t.f, name: names.has(text) });
      }
      return original.call(this, text, x, y, ...args);
    };
    try { await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); }
    finally { proto.fillText = original; }
    return { names: boxes.filter(b => b.name), footer: boxes.filter(b => !b.name) };
  });
  assert.ok(selectBounds.names.length >= 8 && selectBounds.footer.length, 'captured full select layout');
  assert.ok(Math.max(...selectBounds.names.map(b => b.bottom)) < Math.min(...selectBounds.footer.map(b => b.top)),
    'bottom-row hero names do not overlap footer');
  await page.screenshot({ path: `${SHOTS}/select-bottom-row-challenge.png` });
  await page.keyboard.press('Digit1');
  await page.screenshot({ path: `${SHOTS}/select-challenge.png` });
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__ppState.route === 'challenge');
  await page.keyboard.press('Escape'); // skip intro
  await page.waitForFunction(() => !window.__ppCinema.isActive());
  await page.evaluate(() => window.__ppCoach?.force(null));
  const stage = await page.evaluate(() => ({ route: window.__ppState.route, next: window.__ppState.nextRoute }));
  assert.deepEqual(stage, { route: 'challenge', next: 'challenge' });
  await page.evaluate(() => { const s = window.__ppState; s.ninjas = []; s.player.x = 380; });
  await page.waitForFunction(() => window.__ppState.events?.fired['0:300'], { timeout: 10000 });
  const first = await page.evaluate(() => ({
    kinds: window.__ppState.events.log.find(x => x.level === 0 && x.x === 300)?.kinds,
    route: window.__ppState.route,
  }));
  assert.equal(first.route, 'challenge');
  assert.deepEqual(first.kinds, ['skater', 'striker'], 'actual stepEvents fired curated encounter');
  await page.screenshot({ path: `${SHOTS}/sewer-challenge.png` });
  // Pause options use the normal navigation pathway. A staged change cannot
  // change the active arena, and does not produce a midstage checkpoint write.
  await page.keyboard.press('Escape');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  const before = await page.evaluate(() => localStorage.getItem('pizzaPanicCheckpoint'));
  const row = await page.evaluate(() => window.__ppPause.optionRows().findIndex(x => x.id === 'route'));
  assert.ok(row >= 0, 'route row is visible in pause Options');
  for (let i = 0; i < row; i++) await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  const pending = await page.evaluate(() => ({ active: window.__ppState.route, pending: window.__ppState.nextRoute,
    stored: localStorage.getItem('pizzaPanicCheckpoint') }));
  assert.equal(pending.active, 'challenge');
  assert.equal(pending.pending, 'classic');
  assert.equal(pending.stored, before, 'no mid-stage inventory/route write');
  await page.screenshot({ path: `${SHOTS}/pause-next-route.png` });
  // Release the genuine authored stage-end condition (all trigger keys fired,
  // road clear and player at the far end). The runtime, not this test, advances
  // the wave, latches the pending route and writes its stage-entry checkpoint.
  await page.evaluate(async () => {
    window.__ppPause.close();
    const { levelPlan } = await import('/events.js');
    const { LEVELS } = await import('/collision.js');
    const s = window.__ppState;
    for (const t of levelPlan(0, 'challenge').beats) s.events.fired[`${t.level}:${t.x}`] = true;
    s.events.lock = null; s.events.cooldown = 0; s.ninjas = [];
    s.player.x = LEVELS[0].width - 100;
  });
  await page.waitForFunction(() => window.__ppState.wave === 2 && window.__ppScreens.mode() === 'clear', { timeout: 10000 });
  const atBoundary = await page.evaluate(() => ({ route: window.__ppState.route, cleared: window.__ppScreens.data.route,
    stored: window.__ppSave.load()?.route }));
  assert.deepEqual(atBoundary, { route: 'classic', cleared: 'challenge', stored: 'classic' });
  await page.screenshot({ path: `${SHOTS}/clear-challenge-next-classic.png` });
  await page.reload();
  await page.waitForFunction(() => !!window.__ppSave);
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__ppTitle.ready());
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__ppState?.continuedFrom === 2);
  assert.deepEqual(await page.evaluate(() => ({ route: window.__ppState.route, pending: window.__ppState.nextRoute })),
    { route: 'classic', pending: 'classic' });
  // NEW GAME on the saved-title menu is a fresh Classic run, never the route
  // inherited from the previous Continue or another browser preference.
  const fresh = await context.newPage();
  fresh.on('pageerror', e => errors.push(e.message));
  fresh.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await fresh.goto(URL);
  await fresh.waitForFunction(() => !!window.__ppTitle);
  await fresh.keyboard.press('Enter');
  await fresh.keyboard.press('Escape');
  await fresh.waitForFunction(() => window.__ppTitle.ready());
  await fresh.keyboard.press('ArrowDown'); // NEW GAME
  await fresh.keyboard.press('Enter');
  await fresh.waitForFunction(() => window.__ppSelect.active);
  await fresh.keyboard.press('Enter');
  await fresh.waitForFunction(() => !window.__ppSelect.active);
  assert.equal(await fresh.evaluate(() => window.__ppState.route), 'classic');
  assert.equal(await fresh.evaluate(() => window.__ppRenderErrors?.count), 0);
  const challengeContext = await browser.newContext();
  await challengeContext.addInitScript(() => localStorage.setItem('pizzaPanicCheckpoint', JSON.stringify({
    v: 1, wave: 2, route: 'challenge', hero: 'turtle_blue', difficulty: 'normal',
    coins: 8, score: 100, lives: 3, maxHp: 100, dmgMult: 1, weaponLevel: 1, superStart: 0, shopBuys: {},
  })));
  const resumedChallenge = await challengeContext.newPage();
  resumedChallenge.on('pageerror', e => errors.push(e.message));
  resumedChallenge.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await resumedChallenge.goto(URL);
  await resumedChallenge.waitForFunction(() => !!window.__ppTitle);
  await resumedChallenge.keyboard.press('Enter');
  await resumedChallenge.keyboard.press('Escape');
  await resumedChallenge.waitForFunction(() => window.__ppTitle.ready());
  await resumedChallenge.keyboard.press('Enter');
  await resumedChallenge.waitForFunction(() => window.__ppState?.continuedFrom === 2);
  assert.deepEqual(await resumedChallenge.evaluate(() => ({ route: window.__ppState.route, next: window.__ppState.nextRoute })),
    { route: 'challenge', next: 'challenge' });
  assert.equal(await resumedChallenge.evaluate(() => window.__ppRenderErrors?.count), 0);
  // Continue into the actual street encounter, with the real co-op join/view;
  // mark defeated actors dead to advance locks, without claiming combat playtesting.
  await resumedChallenge.evaluate(() => {
    const s = window.__ppState;
    window.__ppCoop.join(s, 'turtle_red');
    s.ninjas = []; s.player.x = 380;
  });
  await resumedChallenge.waitForFunction(() => window.__ppState.events?.fired['1:300']);
  const street = await resumedChallenge.evaluate(() => {
    const s = window.__ppState, p2 = window.__ppCoop.p2, e = s.events;
    return { kinds: e.log.find(x => x.level === 1 && x.x === 300)?.kinds,
      locked: !!e.lock, p2: !!p2 && Object.getPrototypeOf(p2) === s, time: e.lock?.t };
  });
  assert.deepEqual(street.kinds, ['acrobat', 'thrower']);
  assert.equal(street.locked, true);
  assert.equal(street.p2, true);
  await resumedChallenge.screenshot({ path: `${SHOTS}/street-challenge-coop.png` });
  await resumedChallenge.evaluate(() => { for (const n of window.__ppState.ninjas) n.dead = true; });
  await resumedChallenge.waitForFunction(() => !window.__ppState.events.lock);
  assert.equal(await resumedChallenge.evaluate(() => window.__ppState.events.log.some(x => x.type === 'lockTimeout')), false);
  await resumedChallenge.evaluate(() => {
    const s = window.__ppState; s.ninjas = []; s.events.cooldown = 0; s.player.x = 1100;
  });
  await resumedChallenge.waitForFunction(() => window.__ppState.events?.fired['1:1050']);
  await resumedChallenge.evaluate(() => { for (const n of window.__ppState.ninjas) n.dead = true; });
  await resumedChallenge.waitForFunction(() => !window.__ppState.events.lock);
  assert.deepEqual(await resumedChallenge.evaluate(() => window.__ppState.events.log.filter(x => x.type === 'arenaClear').length), 2);
  assert.equal(await resumedChallenge.evaluate(() => window.__ppRenderErrors?.count), 0);
  // Touch controls dispatch their real event handlers: pause, navigate Options,
  // choose a NEW run route, back out, and start using the Pizza/Space button.
  const touchContext = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 740, height: 510 } });
  const touchPage = await touchContext.newPage();
  touchPage.on('pageerror', e => errors.push(e.message));
  touchPage.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await touchPage.goto(URL);
  await touchPage.waitForFunction(() => !!window.__ppTouch && !!window.__ppTitle);
  await touchPage.keyboard.press('Enter');
  await touchPage.keyboard.press('Escape');
  await touchPage.waitForFunction(() => window.__ppTitle.ready());
  await touchPage.keyboard.press('Enter');
  await touchPage.waitForFunction(() => window.__ppSelect.active);
  const pressTouch = async label => touchPage.evaluate(name => {
    const el = [...document.querySelectorAll('#ppTouch [role="button"]')].find(x => x.getAttribute('aria-label') === name);
    if (!el) throw new Error('missing touch button ' + name);
    el.dispatchEvent(new Event('touchstart', { bubbles: true, cancelable: true }));
    el.dispatchEvent(new Event('touchend', { bubbles: true, cancelable: true }));
  }, label);
  await pressTouch('Pause');
  for (let i = 0; i < 2; i++) await pressTouch('Move down');
  await pressTouch('Throw pizza');
  await touchPage.waitForFunction(() => window.__ppPause.menu() === 'options');
  const routeIndex = await touchPage.evaluate(() => window.__ppPause.optionRows().findIndex(x => x.id === 'route'));
  for (let i = 0; i < routeIndex; i++) await pressTouch('Move down');
  await pressTouch('Throw pizza');
  assert.equal(await touchPage.evaluate(() => window.__ppPause.getRoute()), 'challenge');
  assert.equal(await touchPage.evaluate(() => window.__ppPause.isOpen() && window.__ppPause.menu() === 'options'), true);
  await touchPage.screenshot({ path: `${SHOTS}/touch-new-run-route.png` });
  await pressTouch('Pause'); // Options -> Main
  await pressTouch('Pause'); // Main -> Select
  await pressTouch('Throw pizza'); // Select -> new run
  await touchPage.waitForFunction(() => window.__ppState.route === 'challenge');
  assert.equal(await touchPage.evaluate(() => window.__ppRenderErrors?.count), 0);
  assert.deepEqual(errors, [], 'no browser console/page errors');
  assert.equal(await page.evaluate(() => window.__ppRenderErrors?.count), 0, 'no swallowed renderer errors');
  console.log('browser-challenge-routes: pad/mute/touch UI, sewer+street solo/P2 events, stage latch/results/save, both Continue routes, fresh Classic, zero render errors');
} finally { await browser.close(); }
