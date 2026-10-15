// Real index.html + keyboard smoke test; no renderer or asset mocks.
// Start python3 -m http.server 48791, then node browser-smoke.mjs.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const url = process.env.GAME_URL || 'http://127.0.0.1:48791/index.html?coach=0';
const browser = await chromium.launch({ headless: true,
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  args: ['--no-sandbox'] });
const heroes = ['turtle_purple', 'turtle_blue', 'turtle_red', 'turtle_orange', 'nous_girl', 'teknium', 'turbofit', 'don_piedro'];
const results = [];
await mkdir('after/gameplay', { recursive: true });
try {
  for (const [index, hero] of heroes.entries()) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errors = [], failedRequests = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('requestfailed', r => failedRequests.push(`${r.url()}: ${r.failure()?.errorText}`));
    await page.goto(url);
    await page.waitForFunction(() => !!window.__ppRig && !!window.__ppTitle);
    await page.keyboard.press('Enter');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => window.__ppTitle.ready());
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.__ppSelect.active);
    await page.keyboard.press(`Digit${index + 1}`);
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.__ppCinema.isActive());
    await page.keyboard.press('Escape'); // cinematic
    // Onboarding is disabled with its supported coach=0 URL flag.
    await page.waitForFunction(() => !window.__ppCinema.isActive() && window.__ppState.combat.now > 0.2);
    assert.equal(await page.evaluate(() => window.__ppState.selectedHero), hero);
    const startX = await page.evaluate(() => window.__ppState.player.x);
    await page.keyboard.down('ArrowRight'); await page.waitForTimeout(500); await page.keyboard.up('ArrowRight');
    const movedX = await page.evaluate(() => window.__ppState.player.x);
    assert.ok(movedX > startX, `${hero}: keyboard walk did not move the player`);
    // Double tap run, then turn and attack in both directions.
    await page.keyboard.press('ArrowRight'); await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(350); await page.keyboard.up('ArrowRight');
    for (const facing of ['ArrowLeft', 'ArrowRight']) {
      await page.keyboard.down(facing); await page.waitForTimeout(180); await page.keyboard.up(facing);
      for (let i = 0; i < 4; i++) { await page.keyboard.press('KeyJ'); await page.waitForTimeout(200); }
      await page.keyboard.press('KeyK'); await page.waitForTimeout(500);
      await page.keyboard.press('KeyL'); await page.waitForTimeout(160);
      await page.keyboard.press('KeyK'); await page.waitForTimeout(750);
    }
    await page.keyboard.down('KeyJ'); await page.keyboard.press('KeyL'); await page.keyboard.up('KeyJ');
    await page.waitForTimeout(900);
    await page.keyboard.press('KeyT'); await page.waitForTimeout(300);
    await page.screenshot({ path: `after/gameplay/${hero}.png` });
    const stats = await page.evaluate(() => ({ renderErrors: window.__ppRenderErrors,
      hero: window.__ppState.selectedHero, facing: window.__ppState.combat.facing,
      drawn: window.__ppRig.drawn, log: window.__ppState.combat.log }));
    results.push({ hero, errors, failedRequests, stats });
    assert.equal(stats.renderErrors.count, 0, `${hero}: guarded renderer errors`);
    assert.deepEqual(errors, [], `${hero}: browser console errors`);
    assert.deepEqual(failedRequests, [], `${hero}: failed network requests`);
    await page.close();
    console.log(`${hero}: keyboard gameplay, 0 console/render errors`);
  }
} finally {
  await writeFile('after/gameplay/results.json', JSON.stringify(results, null, 2) + '\n');
  await browser.close();
}
