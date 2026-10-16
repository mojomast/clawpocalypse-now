// In-game smoke for the Machine ally. Serves the repo and drives the real canvas.
// Writes the four review shots under /opt/cursor/artifacts/screenshots/.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const PORT = 48791;
const OUT = process.env.MACHINE_SHOTS || '/opt/cursor/artifacts/screenshots';
const url = `http://127.0.0.1:${PORT}/index.html?coach=0`;

const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], {
  cwd: new URL('..', import.meta.url),
  stdio: 'ignore',
});
await new Promise(r => setTimeout(r, 400));

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'], ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
const shots = [];
try {
  await mkdir(OUT, { recursive: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  const failed = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('requestfailed', r => failed.push(`${r.url()}: ${r.failure()?.errorText}`));

  await page.goto(url);
  await page.waitForFunction(() => !!window.__ppRig && !!window.__ppTitle);
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__ppTitle.ready());
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__ppSelect.active);
  await page.keyboard.press('Digit1');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__ppCinema.isActive());
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !window.__ppCinema.isActive() && window.__ppState.combat.now > 0.2);

  await page.evaluate(() => window.__ppCinema.play('machineMeet'));
  await page.waitForFunction(() => {
    const c = window.__ppCinema;
    if (!c.isActive() || c.scene() !== 'machineMeet') return false;
    const d = c.debug();
    return d.li >= 2 && (d.phase === 'hold' || d.phase === 'tail' || d.phase === 'type');
  }, null, { timeout: 20000 });
  await page.waitForTimeout(400);
  const meet = `${OUT}/machine-meet.png`;
  await page.locator('#c').screenshot({ path: meet });
  shots.push(meet);

  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !window.__ppCinema.isActive());
  await page.evaluate(() => {
    const s = window.__ppState;
    s.events.line = {
      speaker: 'THE MACHINE',
      text: 'Accepted. I stand between you and the swarm.',
      portrait: 'assets/allies/machine/portrait.png',
      t: 0.6,
      dur: 30,
    };
    s.events.lineQ = [];
  });
  await page.waitForFunction(() => {
    const im = document.querySelector('img');
    return window.__ppMachine.ready();
  });
  await page.waitForTimeout(250);
  const talk = `${OUT}/machine-dialogue.png`;
  await page.locator('#c').screenshot({ path: talk });
  shots.push(talk);

  const beam = await page.evaluate(() => {
    const s = window.__ppState;
    const m = window.__ppMachine;
    s.events.line = null;
    const y = s.player.y;
    const foe = { kind: 'striker', x: s.player.x + 140, y, r: 14, hp: 8, maxHp: 8, vx: 0, vy: 0, dead: false, scripted: true, stun: 9 };
    const boss = { kind: 'charger', boss: true, name: 'TARGET', x: s.player.x + 190, y, r: 22, hp: 40, maxHp: 40, vx: 0, vy: 0, dead: false, scripted: true, stun: 9 };
    s.ninjas.push(foe, boss);
    s.machineGauge = 100;
    s.machineCool = 0;
    s.machineNext = 'beam';
    const ok = m.press(s, 'beam');
    const again = m.press(s);
    return { ok, again, foeHp: foe.hp, bossHp: boss.hp };
  });
  assert.equal(beam.ok, true);
  assert.equal(beam.again, false, 'no double summon');
  await page.waitForFunction(() => window.__ppMachine.phase(window.__ppState) === 'beam');
  await page.waitForTimeout(180);
  const action = `${OUT}/machine-assist-1p.png`;
  await page.locator('#c').screenshot({ path: action });
  shots.push(action);
  await page.waitForFunction(() => {
    const ph = window.__ppMachine.phase(window.__ppState);
    return ph === 'down' || ph === 'idle';
  });
  const after = await page.evaluate(() => {
    const s = window.__ppState;
    const foe = s.ninjas.find(n => n.kind === 'striker' && n.scripted);
    const boss = s.ninjas.find(n => n.boss && n.scripted);
    return { foe: foe && foe.hp, boss: boss && boss.hp, gauge: s.machineGauge, cool: s.machineCool || 0 };
  });
  assert.ok(after.foe < 8, 'beam damaged the grunt');
  assert.ok(after.boss < 40 && (40 - after.boss) < (8 - after.foe), 'boss took less than the grunt');
  assert.equal(after.gauge, 0);

  await page.evaluate(() => {
    const s = window.__ppState;
    window.__ppCoop.join(s, 'nous_girl');
    s.events.line = null;
    s.machineCool = 0;
    s.machineGauge = 100;
    s.machineNext = 'shield';
    s.machineCast = null;
    window.__ppMachine.press(s, 'shield', 1);
  });
  await page.waitForFunction(() => window.__ppMachine.phase(window.__ppState) === 'shield');
  await page.waitForTimeout(280);
  const coop = `${OUT}/machine-2p-hud.png`;
  await page.locator('#c').screenshot({ path: coop });
  shots.push(coop);
  const hud = await page.evaluate(() => {
    const s = window.__ppState;
    const p2 = window.__ppCoop.p2;
    const shot = { x: s.player.x, y: s.player.y - 20, r: 6 };
    return {
      phase: window.__ppMachine.phase(s),
      hit: window.__ppMachine.shotBlocked(s, shot),
      miss: window.__ppMachine.shotBlocked(s, { x: s.player.x + 500, y: s.player.y, r: 6 }),
      joined: !!(p2 && p2.player),
      label: s.machineCast && s.machineCast.mode,
    };
  });
  assert.equal(hud.phase, 'shield');
  assert.equal(hud.hit, true);
  assert.equal(hud.miss, false);
  assert.equal(hud.joined, true);
  assert.equal(hud.label, 'shield');

  const bad = errors.filter(e => !/AudioContext|favicon/i.test(e));
  assert.deepEqual(bad, [], 'browser console errors');
  assert.deepEqual(failed.filter(f => !/favicon/i.test(f)), [], 'failed requests');
  console.log('browser-machine: screenshots ' + shots.join(', '));
} finally {
  await browser.close();
  server.kill();
}
