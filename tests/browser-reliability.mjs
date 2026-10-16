// Fresh isolated browser context. Injected navigator pads are controlled fixtures,
// not a claim about physical hardware. Real visibility is distinguished below.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const dir = '/tmp/opencode/teamwork-reliability/reliability';
await mkdir(dir, { recursive: true });
const port = 22000 + (process.pid % 18000);
const server = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], { cwd: new URL('..', import.meta.url), stdio: 'ignore' });
let browser;
try {
  const url = `http://127.0.0.1:${port}/index.html?coach=0`;
  for (let i = 0; i < 40; i++) { try { if ((await fetch(url)).ok) break; } catch {} await new Promise(r => setTimeout(r, 100)); }
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || '/snap/bin/chromium', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const context = await browser.newContext();
  await context.addInitScript(() => {
    // New Gamepad objects on every sample mirror Chromium's snapshot semantics.
    window.__fixturePads = [{ index: 0, id: 'fixture-p1', connected: true, axes: [0, 0], buttons: Array.from({ length: 16 }, () => false) }, { index: 1, id: 'fixture-p2', connected: true, axes: [0, 0], buttons: Array.from({ length: 16 }, () => false) }];
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => window.__fixturePads.map(p => p && ({ ...p, axes: [...p.axes], buttons: p.buttons.map(pressed => ({ pressed, value: +pressed })) })) });
  });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(url);
  await page.waitForFunction(() => window.__ppGamepad && window.__ppLifecycle && window.__ppTitle);
  await page.keyboard.press('Enter'); await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__ppTitle.ready());
  await page.keyboard.press('Enter'); await page.waitForFunction(() => window.__ppSelect.active);
  await page.keyboard.press('Digit1'); await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__ppCinema.isActive());
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !window.__ppCinema.isActive() && window.__ppState.combat.now > 0.2);
  const firedBefore = await page.evaluate(() => {
    const s = window.__ppState, p2 = window.__ppCoop.join(s, 'turbofit');
    if (!p2) throw new Error('co-op participant did not join');
    s.ninjas = []; s.player.x = 300; p2.player.x = 400; p2.player.y = s.player.y;
    s.super = 100; s.machineGauge = 100;
    return { assist: window.__ppAssist.stats.fired, machine: window.__ppMachine.stats.fired };
  });
  const p2Before = await page.evaluate(() => window.__ppCoop.p2.player.x);
  // Bring another page forward; headless visibility support is platform-dependent.
  const other = await context.newPage(); await other.goto('about:blank'); await other.bringToFront();
  let realHidden = false;
  try { await page.waitForFunction(() => document.hidden, null, { timeout: 1600 }); realHidden = true; } catch {}
  if (!realHidden) await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
  assert.equal(await page.evaluate(() => window.__ppLifecycle.suspended), true, 'background suspends');
  await page.evaluate(() => { const [a, b] = window.__fixturePads; a.axes[0] = 0.95; a.buttons[3] = true; a.buttons[9] = true; a.buttons[10] = true; b.axes[0] = 0.95; b.buttons[11] = true; }); // held while away, never actionable before hiding
  if (realHidden) { await page.bringToFront(); await page.waitForFunction(() => !document.hidden); }
  else { await page.bringToFront(); await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: false }); document.dispatchEvent(new Event('visibilitychange')); }); }
  await page.waitForTimeout(260);
  const blocked = await page.evaluate(() => ({ right: !!window.__ppKeys.ArrowRight, fire: !!window.__ppKeys.Space, paused: window.__ppPause.isOpen(), p2: window.__ppGamepad.pad2, pads: window.__ppGamepad.usablePads.filter(Boolean).map(p => ({ axes: p.axes, l3: !!p.buttons[10]?.pressed, r3: !!p.buttons[11]?.pressed })) }));
  assert.equal(blocked.right, false, 'held axis not replayed'); assert.equal(blocked.fire, false, 'held fire not replayed');
  assert.equal(blocked.paused, false, 'held START does not reopen pause');
  assert.ok(!blocked.p2?.dirs?.right, 'P2 held axis masked');
  assert.ok(blocked.pads.every(p => p.axes.every(x => x === 0) && !p.l3 && !p.r3), 'raw L3/R3 masked');
  assert.deepEqual(await page.evaluate(() => ({ assist: window.__ppAssist.stats.fired, machine: window.__ppMachine.stats.fired })), firedBefore, 'held L3/R3 do not summon with full meters');
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => window.__ppCoop.p2.player.x), p2Before, 'joined P2 stays still across multiple held return frames');
  await page.keyboard.down('Numpad6');
  assert.equal(await page.evaluate(() => !!window.__ppCoop.keys.Numpad6), true, 'fresh P2 keyboard is independent of controller gate');
  await page.keyboard.up('Numpad6');
  const touch = await page.evaluate(async () => {
    // Controlled touch event fixture, not a physical touchscreen claim.
    Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, value: 1 });
    window.ontouchstart = null;
    const { createTouchControls } = await import('/touch-controls.js');
    const controls = createTouchControls();
    if (!controls) return null;
    const button = controls.buttons.find(b => b.getAttribute('aria-label') === 'Move left');
    button.dispatchEvent(new Event('touchstart', { bubbles: true, cancelable: true }));
    const fresh = !!window.__ppKeys.ArrowLeft;
    button.dispatchEvent(new Event('touchend', { bubbles: true, cancelable: true }));
    const released = !window.__ppKeys.ArrowLeft;
    controls.root.remove();
    return { fresh, released };
  });
  assert.deepEqual(touch, { fresh: true, released: true }, 'fresh synthetic touch button works through controller latch');
  await page.evaluate(() => { for (const p of window.__fixturePads) { p.axes[0] = 0; p.buttons.fill(false); } });
  await page.waitForTimeout(130);
  await page.evaluate(() => { window.__fixturePads[0].buttons[10] = true; window.__fixturePads[1].buttons[11] = true; });
  await page.waitForFunction(([assist, machine]) => window.__ppAssist.stats.fired > assist && window.__ppMachine.stats.fired > machine, [firedBefore.assist, firedBefore.machine]);
  await page.evaluate(() => { window.__fixturePads[0].buttons[10] = false; window.__fixturePads[1].buttons[11] = false; });
  await page.waitForTimeout(60);
  await page.evaluate(() => { window.__fixturePads[0].axes[0] = 0.95; window.__fixturePads[1].axes[0] = 0.95; });
  await page.waitForFunction(() => !!window.__ppKeys.ArrowRight && !!window.__ppGamepad.pad2?.dirs.right);
  await page.waitForFunction(before => window.__ppCoop.p2.player.x > before, p2Before);
  await page.evaluate(() => { window.__fixturePads[0].axes[0] = 0; window.__fixturePads[1].axes[0] = 0; });
  await page.keyboard.press('ArrowLeft'); // fresh keyboard events are not latched by pad gate
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(() => window.__ppPause.isOpen()), true, 'keyboard pause works');
  await page.evaluate(() => window.__ppLifecycle.suspend());
  await page.evaluate(() => window.__ppLifecycle.resume());
  assert.equal(await page.evaluate(() => window.__ppPause.isOpen()), true, 'lifecycle never unpauses');
  // This checks real Web Audio state where Chromium allows an unlocked context;
  // it does not establish audible output in a headless browser.
  try { await page.waitForFunction(() => window.__ppAudio.state === 'running', null, { timeout: 2000 }); } catch { /* autoplay policy may keep it locked */ }
  const audio = await page.evaluate(async () => {
    const a = window.__ppAudio, before = { theme: a.musicName, muted: a.muted, volume: a.volume, musicVolume: a.musicVolume };
    const waitFor = async state => { for (let i = 0; i < 40 && a.state !== state; i++) await new Promise(r => setTimeout(r, 25)); return a.state; };
    const initial = a.state, requestedSuspend = a.suspend();
    const hidden = initial === 'running' ? await waitFor('suspended') : a.state;
    const requestedResume = a.resume();
    const restored = initial === 'running' ? await waitFor('running') : a.state;
    return { initial, hidden, restored, requestedSuspend, requestedResume, before, after: { theme: a.musicName, muted: a.muted, volume: a.volume, musicVolume: a.musicVolume } };
  });
  assert.deepEqual(audio.before, audio.after, 'audio theme/mute/volume survive lifecycle methods');
  if (audio.initial === 'running') { assert.equal(audio.hidden, 'suspended', 'real AudioContext suspended'); assert.equal(audio.restored, 'running', 'real AudioContext resumed'); }
  assert.deepEqual(errors, [], 'no browser errors');
  assert.deepEqual(await page.evaluate(() => window.__ppRenderErrors), { count: 0, by: {} }, 'no guarded renderer errors');
  await writeFile(`${dir}/browser-reliability.json`, JSON.stringify({ at: new Date().toISOString(), visibility: realHidden ? 'real hidden tab' : 'CONTROLLED visibility override (not real hidden)', injectedPads: true, blocked, audio, errors }, null, 2));
  console.log(`browser-reliability: PASS (${realHidden ? 'real hidden tab' : 'CONTROLLED visibility override'}, injected pads, AudioContext ${audio.initial} → ${audio.hidden} → ${audio.restored})`);
} finally { await browser?.close(); server.kill('SIGTERM'); }
