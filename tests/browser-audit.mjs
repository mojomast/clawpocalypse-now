// Full Continue-menu integration and repeat-credits regression checks.
// Uses the same local source server as browser-smoke.mjs.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.launch({
  headless: true, args: ['--no-sandbox'],
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
});
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const saved = {
    v: 1, wave: 2, hero: 'teknium', difficulty: 'normal', coins: 30,
    score: 100, lives: 3, maxHp: 160, dmgMult: 1.45, weaponLevel: 2,
    superStart: 50, shopBuys: { hp: 3, dmg: 3, meter: 1 },
  };
  await page.addInitScript(data => {
    localStorage.setItem('pizzaPanicCheckpoint', JSON.stringify(data));
  }, saved);
  await page.goto(process.env.GAME_URL || 'http://127.0.0.1:48791/index.html?coach=0');
  await page.waitForFunction(() => window.__ppTitle && window.__ppSave);
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__ppTitle.ready());
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__ppState?.continuedFrom === 2 && window.__ppState.combat.now > .3);
  const resumed = await page.evaluate(() => {
    const s = window.__ppState;
    return { hero: s.selectedHero, dmgMult: s.dmgMult, shopBuys: s.shopBuys, maxHp: s.maxHp, superStart: s.superStart };
  });
  assert.equal(resumed.hero, saved.hero);
  assert.equal(resumed.dmgMult, saved.dmgMult, 'damage upgrades survive the first real gameplay updates');
  assert.equal(resumed.maxHp, saved.maxHp);
  assert.equal(resumed.superStart, saved.superStart);
  for (const [item, count] of Object.entries(saved.shopBuys)) {
    assert.equal(resumed.shopBuys[item], count, `${item} purchase count survives Continue`);
  }

  const credits = await page.evaluate(async () => {
    const { createScreens } = await import('/screens.js');
    const screens = createScreens({});
    const s = window.__ppState;
    const ctx = document.createElement('canvas').getContext('2d');
    const finishRoll = () => {
      for (let i = 0; i < 450; i++) { screens.update(.1); screens.draw(ctx, 740, 480); }
      return screens.rollDone;
    };
    screens.reset(s); screens.ending(s);
    const firstDone = finishRoll();
    screens.reset(s);
    const resetDone = screens.rollDone;
    screens.ending(s); screens.draw(ctx, 740, 480);
    const freshDone = screens.rollDone;
    screens.press('Space');
    const firstKeyMode = screens.mode();
    const secondDone = finishRoll();
    screens.ending(s);
    const directReentryDone = screens.rollDone;
    return { firstDone, resetDone, freshDone, firstKeyMode, secondDone, directReentryDone };
  });
  assert.deepEqual(credits, {
    firstDone: true, resetDone: false, freshDone: false,
    firstKeyMode: 'credits', secondDone: true, directReentryDone: false,
  });
  assert.deepEqual(errors, [], 'no uncaught browser errors');
  console.log('browser-audit: Continue retains upgrades; reset and direct credits reentry clear completion');
} finally {
  await browser.close();
}
