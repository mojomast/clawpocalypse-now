// Real P1 melee + P2 pizza contacts in both orders, rendered TEAM LINK cue.
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const evidence = '/tmp/opencode/teamwork-reliability/teamwork';
mkdirSync(evidence, { recursive: true });
const port = 48839;
const server = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], { cwd: new URL('..', import.meta.url), stdio: 'ignore' });
let browser;
try {
  await new Promise(r => setTimeout(r, 450));
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'], ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
  const page = await browser.newPage({ viewport: { width: 980, height: 675 } });
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
    const s = window.__ppState, coop = window.__ppCoop, assist = window.__ppAssist;
    s.ninjas = []; s.pizzas = []; s.powerups = []; s.walkLevel = true; s.wave = 1;
    s.player.x = 400; s.player.y = 420; s.over = false; s.playerDown = 0; s.hurtT = 0;
    createCombat(s); assist.step(s, 0); s.super = 10;
    const v = coop.join(s, 'turbofit');
    if (!v || v.hitOwnerState !== s) throw new Error('real P2 view did not join');
    v.player.x = 400; v.player.y = 420; v.weaponLevel = 1; v.spreadTimer = 0; v.over = false;
    const target = () => ({ kind: 'brawler', x: 450, y: 420, r: 16, hp: 100, maxHp: 100, vx: 0, vy: 0, scripted: true, dead: false });
    const melee = n => {
      createCombat(s); s.ninjas = [n];
      const started = combatPress(s, 'punch');
      const box = attackBox(s, s.combat.attack);
      n.x = (box.x0 + box.x1) / 2;
      for (let i = 0; i < 60 && s.combat.landed === 0; i++) combatStep(s, 1 / 120);
      if (!s.combat.landed) throw new Error(`P1 melee missed: ${started}`);
    };
    const projectile = n => {
      s.ninjas = [n]; v.player.x = n.x - 50; v.player.y = n.y;
      v.pizzas = []; throwPizza(v);
      for (let i = 0; i < 12 && !v.combo; i++) coop.step(s, 1 / 60);
      if (!v.combo) throw new Error('P2 projectile missed');
    };
    const a = target(); melee(a); const first = { hp: a.hp, meter: s.super };
    projectile(a); const forward = { hp: a.hp, meter: s.super, cue: assist.linkCue, stats: { ...assist.stats } };
    const b = target(); v.combo = 0; projectile(b); const reverseFirst = { hp: b.hp, meter: s.super };
    melee(b); const reverse = { hp: b.hp, meter: s.super, cue: assist.linkCue, stats: { ...assist.stats } };
    // Hold real combat fixture in a quiet arena for the canvas evidence frame.
    s.ninjas = [b]; s.player.x = 400; s.player.y = 420; v.player.x = 450; v.player.y = 420;
    return { first, forward, reverseFirst, reverse, joined: coop.p2 === v };
  });
  assert.equal(result.joined, true);
  assert.ok(result.first.hp < 100 && result.forward.hp < result.first.hp, 'P1 then P2 both cause real damage');
  assert.ok(result.reverseFirst.hp < 100 && result.reverse.hp < result.reverseFirst.hp, 'P2 then P1 both cause real damage');
  assert.equal(result.forward.meter - result.first.meter, 6, 'first payoff gains six meter');
  assert.equal(result.reverse.meter - result.reverseFirst.meter, 6, 'reverse payoff gains six meter');
  assert.equal(result.reverse.stats.teamLinks, 2);
  assert.equal(result.reverse.cue?.amount, 6);
  const textBounds = await page.evaluate(async () => {
    const { OPTIONS } = await import('/options-live.js');
    OPTIONS.set('subtitleScale', 1.6);
    const original = CanvasRenderingContext2D.prototype.fillText;
    window.__teamLinkTextBounds = [];
    CanvasRenderingContext2D.prototype.fillText = function (text, x, y, ...args) {
      if (String(text).startsWith('TEAM LINK') || String(text).startsWith('Hit same foe')) {
        const width = this.measureText(String(text)).width;
        window.__teamLinkTextBounds.push({ text, x, y, width, font: this.font, align: this.textAlign });
      }
      return original.call(this, text, x, y, ...args);
    };
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    return { bounds: window.__teamLinkTextBounds.slice(-3), size: { width: document.querySelector('canvas').width, height: document.querySelector('canvas').height } };
  });
  const cue = textBounds.bounds.find(b => b.text.startsWith('TEAM LINK 1P'));
  const hintTitle = textBounds.bounds.find(b => b.text === 'TEAM LINK: 1P + 2P');
  const hintDetail = textBounds.bounds.find(b => b.text === 'Hit same foe within 2s');
  assert.ok(cue && hintTitle && hintDetail, 'max-scale cue and both hint lines rendered');
  assert.ok(cue.font.includes('18px') && hintDetail.font.includes('16px'), 'live subtitle scale applies to new text');
  assert.ok(cue.x + cue.width < textBounds.size.width - 120 && cue.y < textBounds.size.height - 70, 'cue clears machine and boss bar bounds');
  for (const hint of [hintTitle, hintDetail]) {
    assert.ok(hint.x - hint.width > textBounds.size.width - 360 && hint.x < textBounds.size.width - 120, 'hint clears P1-out panel and right combo badge');
    assert.ok(hint.y > 133 && hint.y < 175, 'hint stays below cards and route badge');
  }
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${evidence}/team-link-desktop.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${evidence}/team-link-narrow.png` });
  // The canvas is resized by CSS; record geometry rather than claim phone usability.
  const geometry = await page.evaluate(() => ({ viewport: innerWidth, canvas: document.querySelector('canvas')?.getBoundingClientRect().toJSON() }));
  assert.deepEqual(errors, []);
  assert.equal(await page.evaluate(() => window.__ppRenderErrors?.count || 0), 0);
  console.log(JSON.stringify({ result, textBounds, geometry, screenshot: `${evidence}/team-link-desktop.png` }, null, 2));
} finally {
  await browser?.close(); server.kill();
}
