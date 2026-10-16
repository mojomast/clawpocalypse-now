// tests/browser-runtime.mjs — real index.html checks for lifecycle + frame-time
// telemetry (roadmap item 9).
//
//   python3 -m http.server 48791   # in the repo root
//   node tests/browser-runtime.mjs
//
// Environment:
//   GAME_URL       override the page (default http://127.0.0.1:48791/index.html?coach=0&debug=1)
//   CHROMIUM_PATH  chromium executable (fallback: $CHROMIUM, then /snap/bin/chromium)
//
// What it checks
//   * window.__ppPerf.snapshot() exists with ?debug=1 and reports frames + frameMs
//     percentiles; substeps never exceed MAX_SUBSTEPS (12).
//   * window.__ppLifecycle exposes suspend()/resume()/dispose()/simulate() and has
//     attached real listeners.
//   * A genuinely hidden page: a SECOND page in the same context is brought to the
//     front so page 1's document.visibilityState actually becomes 'hidden'. We
//     assert that state BEFORE asserting behaviour. While hidden the game must not
//     advance; on return it must resume and release latched input.
//   * If (and only if) headless bringToFront does not change visibilityState, a
//     clearly-labelled CONTROLLED fallback overrides document.hidden and dispatches
//     visibilitychange. That is a simulation, not proof of a real hidden tab.
//
// MANUAL verification (do this in a real browser; it is the authoritative check):
//   1. Start the game, get into gameplay with music playing, and hold a movement key.
//   2. Switch to another tab / minimise / background the browser window.
//      - Music must stop (no bleed from the background tab).
//      - The world must not advance (score/combo/timers stay put).
//   3. Return to the tab.
//      - Music comes back on the SAME track; volume and mute preferences unchanged.
//      - The hero does not lurch forward: input held before leaving is not latched.
//      - The first frame back is smooth (no catch-up burst).
//   4. Pause manually (P/Esc), background the tab, return: the pause menu is still
//      open and the game is still paused (a hidden tab must not change pause state).
//   5. Repeat during the title/menu and during a cinematic: state is preserved.
//   6. Close the tab during a stage: any pending checkpoint flush (pagehide) must
//      use the normal stage-checkpoint watcher, never a mid-stage forced save.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const BASE_URL = process.env.GAME_URL || 'http://127.0.0.1:48791/index.html?coach=0&debug=1';
const CHROMIUM = process.env.CHROMIUM_PATH || process.env.CHROMIUM || '/snap/bin/chromium';
const EVIDENCE_DIR = process.env.RUNTIME_EVIDENCE_DIR || '/tmp/opencode/gameplay-qol-performance/runtime';

// Server lifetime: use the EXTERNAL server when the base origin is up; otherwise spawn
// our OWN server on a PRIVATE loopback port and kill ONLY that child PID on exit.
// Never pkill by port/name: another workstream may own the shared 48791 server, so we
// must never stop it. If the shared server is down we run against our own origin.
async function httpUp(o) { try { const r = await fetch(o + '/index.html', { method: 'HEAD' }); return r.ok; } catch { return false; } }
function stopOwnServer() { if (!server) return; try { server.kill('SIGTERM'); } catch { /* ignore */ } server = null; }
let server = null;
let origin = new URL(BASE_URL).origin;
if (!(await httpUp(origin))) {
  const sharedPort = new URL(BASE_URL).port || '80';
  const candidates = [];
  for (let i = 0; i < 5; i++) candidates.push(20000 + ((process.pid + i * 131) % 20000));
  for (const port of candidates) {
    if (String(port) === sharedPort) continue; // never squat the shared port
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

const notes = [];
const browser = await chromium.launch({ headless: true, executablePath: CHROMIUM, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
let failed = null;
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto(GAME_URL);
  await page.waitForFunction(() => !!window.__ppRig && !!window.__ppTitle && !!window.__ppPerf && !!window.__ppLifecycle);

  // --- lifecycle/perf surfaces exist --------------------------------------
  const surfaces = await page.evaluate(() => ({
    perf: typeof window.__ppPerf.snapshot === 'function' && typeof window.__ppPerf.export === 'function',
    maxSubsteps: window.__ppPerf.maxSubsteps,
    llSuspend: typeof window.__ppLifecycle.suspend === 'function',
    llResume: typeof window.__ppLifecycle.resume === 'function',
    llDispose: typeof window.__ppLifecycle.dispose === 'function',
    llSimulate: typeof window.__ppLifecycle.simulate === 'function',
    listeners: window.__ppLifecycle.listeners,
    debug: window.__ppDebug === true,
  }));
  assert.equal(surfaces.perf, true, '__ppPerf API present');
  assert.equal(surfaces.maxSubsteps, 12, 'MAX_SUBSTEPS exposed as 12');
  assert.ok(surfaces.llSuspend && surfaces.llResume && surfaces.llDispose, '__ppLifecycle suspend/resume/dispose present');
  assert.equal(surfaces.llSimulate, true, '__ppLifecycle.simulate present');
  assert.ok(surfaces.listeners >= 5, '__ppLifecycle attached real listeners');
  assert.equal(surfaces.debug, true, '?debug=1 sets window.__ppDebug');

  // --- pause/UI cross-team contract ---------------------------------------
  const contract = await page.evaluate(() => ({
    replay: typeof window.__ppPause.onTutorialReplay === 'function',
    getDiff: typeof window.__ppPause.getDifficulty === 'function',
    setDiff: typeof window.__ppPause.onDifficultyChange === 'function',
    diff: window.__ppPause.getDifficulty(),
  }));
  assert.ok(contract.replay && contract.getDiff && contract.setDiff, 'pause/UI contract callbacks attached');
  assert.ok(['easy', 'normal', 'hard'].includes(contract.diff));
  const badIgnored = await page.evaluate(() => { const before = window.__ppPause.getDifficulty(); window.__ppPause.onDifficultyChange('impossible'); return { before, after: window.__ppPause.getDifficulty() }; });
  assert.equal(badIgnored.before, badIgnored.after, 'invalid difficulty ignored');
  const applied = await page.evaluate(() => { window.__ppPause.onDifficultyChange('hard'); return { diff: window.__ppPause.getDifficulty(), state: window.__ppState ? window.__ppState.difficulty : null }; });
  assert.equal(applied.diff, 'hard');
  await page.evaluate(() => window.__ppPause.onDifficultyChange('normal')); // restore

  // --- into gameplay -------------------------------------------------------
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
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(700);
  await page.keyboard.up('ArrowRight');
  await page.waitForTimeout(200);

  // --- perf snapshot -------------------------------------------------------
  const snap = await page.evaluate(() => window.__ppPerf.snapshot());
  assert.ok(snap.frames > 0, 'perf recorded frames');
  assert.ok(snap.frameMs.p50 >= 0 && typeof snap.frameMs.p95 === 'number' && typeof snap.frameMs.p99 === 'number', 'frameMs percentiles present');
  assert.ok(snap.substeps.perFrameMax <= 12, `substeps within MAX_SUBSTEPS (got ${snap.substeps.perFrameMax})`);
  assert.ok(typeof snap.simMs === 'number' && typeof snap.renderMs === 'number', 'sim/render slices present');

  // --- genuine hidden page via a second page brought to front -------------
  const page2 = await context.newPage();
  await page2.goto('about:blank');
  await page2.bringToFront();
  let realHidden = false;
  try { await page.waitForFunction(() => document.visibilityState === 'hidden', null, { timeout: 2000 }); realHidden = true; } catch { realHidden = false; }
  const visState = await page.evaluate(() => document.visibilityState);

  if (realHidden && visState === 'hidden') {
    assert.equal(visState, 'hidden', 'page 1 is genuinely hidden');
    await page.waitForTimeout(250);
    const before = await page.evaluate(() => ({ now: window.__ppState.combat.now, suspended: window.__ppLifecycle.suspended, releases: window.__ppLifecycle.stats.inputReleases }));
    assert.equal(before.suspended, true, 'lifecycle marks the game suspended while hidden');
    await page.waitForTimeout(700);
    const during = await page.evaluate(() => ({ now: window.__ppState.combat.now, suspended: window.__ppLifecycle.suspended }));
    assert.equal(during.suspended, true, 'still suspended');
    assert.equal(during.now, before.now, 'simulation did not advance while hidden');
    if (before.releases > 0) notes.push('input released on a real hide');

    await page.bringToFront();
    await page.waitForFunction(() => document.visibilityState === 'visible', null, { timeout: 3000 });
    await page.waitForTimeout(400);
    const after = await page.evaluate(() => ({ suspended: window.__ppLifecycle.suspended, releases: window.__ppLifecycle.stats.inputReleases, now: window.__ppState.combat.now }));
    assert.equal(after.suspended, false, 'resumed after returning');
    assert.ok(after.releases > before.releases, 'input released on return');
    assert.ok(after.now >= during.now, 'simulation resumed');
    notes.push('real hidden/visible via bringToFront: PASS');
  } else {
    // Controlled fallback: this only proves our handler logic, not a real hide.
    notes.push('CONTROLLED FALLBACK (not real hidden): bringToFront did not change visibilityState in headless');
    await page2.close();
    await page.bringToFront();
    const frozen = await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
      return { suspended: window.__ppLifecycle.suspended };
    });
    assert.equal(frozen.suspended, true, 'controlled hidden suspends');
    const before = await page.evaluate(() => window.__ppState.combat.now);
    await page.waitForTimeout(500);
    const during = await page.evaluate(() => window.__ppState.combat.now);
    assert.equal(during, before, 'no simulation while controlled-hidden');
    const shown = await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
      document.dispatchEvent(new Event('visibilitychange'));
      return { suspended: window.__ppLifecycle.suspended, releases: window.__ppLifecycle.stats.inputReleases };
    });
    assert.equal(shown.suspended, false, 'controlled visible resumes');
    assert.ok(shown.releases > 0, 'input released on controlled return');
    console.warn('WARNING: controlled visibility fallback used — this does NOT prove a real hidden tab.');
  }

  // --- manual pause + input latch survive suspend/resume -------------------
  // Suspend/resume via the lifecycle API (the same path hidden/pagehide uses). A held
  // key must be released, the gamepad hook must fire, and a manual pause must stay open.
  {
    const held = await page.evaluate(() => { window.__p0 = window.__ppState.player.x; window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowRight' })); return true; });
    assert.equal(held, true);
    await page.waitForTimeout(160);
    const moved = await page.evaluate(() => window.__ppState.player.x > window.__p0);
    assert.ok(moved, 'a held key moves the player before suspend');

    await page.evaluate(() => {
      // Spy on the gamepad release hook (game.js calls window.__ppGamepad.releaseAll()).
      window.__gpSaved = window.__ppGamepad; window.__gpCalls = 0;
      window.__ppGamepad = { releaseAll() { window.__gpCalls += 1; } };
    });
    const relBefore = await page.evaluate(() => window.__ppLifecycle.stats.inputReleases);
    await page.evaluate(() => window.__ppLifecycle.suspend());
    const afterSuspend = await page.evaluate(() => ({
      releases: window.__ppLifecycle.stats.inputReleases,
      gp: window.__gpCalls,
      stillHeldRight: !!window.__ppKeys.ArrowRight,
      suspended: window.__ppLifecycle.suspended,
    }));
    assert.ok(afterSuspend.releases > relBefore, 'input released on suspend');
    assert.equal(afterSuspend.gp >= 1, true, 'gamepad releaseAll hook invoked on suspend');
    assert.equal(afterSuspend.stillHeldRight, false, 'held key cleared on suspend');
    assert.equal(afterSuspend.suspended, true);

    // Co-op registers its own listeners: the P1 key guard alone is insufficient.
    const p2Before = await page.evaluate(() => ({ joined: window.__ppCoop.joined, picking: window.__ppCoop.picking }));
    await page.keyboard.press('NumpadEnter');
    await page.keyboard.down('Numpad6');
    const p2During = await page.evaluate(() => ({ joined: window.__ppCoop.joined, picking: window.__ppCoop.picking, held: !!window.__ppCoop.keys.Numpad6 }));
    assert.equal(p2During.joined, p2Before.joined, 'background P2 Start cannot join');
    assert.equal(p2During.picking, p2Before.picking, 'background P2 Start cannot open picker');
    assert.equal(p2During.held, false, 'background P2 movement is not latched');
    await page.keyboard.up('Numpad6');

    // Manual pause while suspended must NOT be opened/closed by the lifecycle; open it
    // after resume and confirm it survives a further suspend/resume round-trip.
    await page.evaluate(() => window.__ppLifecycle.resume());
    await page.waitForTimeout(120);
    assert.equal(await page.evaluate(() => !!window.__ppKeys.ArrowRight), false, 'no latched key after resume');
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => window.__ppPause.isOpen()), true, 'manual pause opened');
    await page.evaluate(() => window.__ppLifecycle.suspend());
    assert.equal(await page.evaluate(() => window.__ppPause.isOpen()), true, 'suspend keeps the manual pause open');
    await page.evaluate(() => window.__ppLifecycle.resume());
    assert.equal(await page.evaluate(() => window.__ppPause.isOpen()), true, 'resume keeps the manual pause open');
    await page.keyboard.press('Escape'); // close the pause menu
    assert.equal(await page.evaluate(() => window.__ppPause.isOpen()), false, 'pause closed again');
    await page.evaluate(() => { if (window.__gpSaved) window.__ppGamepad = window.__gpSaved; });
    assert.deepEqual(errors, [], 'no page errors during the suspend/resume round-trip');
  }

  // --- tutorial replay re-arms the coach on the CURRENT run ----------------
  // A returning player already has the coach flag stored, so NEW GAME does not show
  // the cards; the pause contract must still replay them mid-run (not only next run).
  {
    const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    await ctx2.addInitScript(() => { try { localStorage.setItem('pizzaPanicCoachDone', '1'); } catch { /* ignore */ } });
    const replayPage = await ctx2.newPage();
    const replayErrors = [];
    replayPage.on('pageerror', e => replayErrors.push(e.message));
    await replayPage.goto(origin + '/index.html?debug=1');
    await replayPage.waitForFunction(() => !!window.__ppCoach && !!window.__ppTitle && !!window.__ppState);
    await replayPage.keyboard.press('Enter');
    await replayPage.keyboard.press('Escape');
    await replayPage.waitForFunction(() => window.__ppTitle.ready());
    await replayPage.keyboard.press('Enter');
    await replayPage.waitForFunction(() => window.__ppSelect.active);
    await replayPage.keyboard.press('Digit1');
    await replayPage.keyboard.press('Enter');
    await replayPage.waitForFunction(() => window.__ppCinema.isActive());
    await replayPage.keyboard.press('Escape');
    await replayPage.waitForFunction(() => !window.__ppCinema.isActive() && window.__ppState.combat && window.__ppState.combat.now > 0.2);
    assert.equal(await replayPage.evaluate(() => window.__ppCoach.active), false, 'coach stays hidden for a returning player (stored flag)');
    const replayed = await replayPage.evaluate(() => { window.__ppPause.onTutorialReplay(); return { active: window.__ppCoach.active, card: window.__ppCoach.card }; });
    assert.equal(replayed.active, true, 'tutorial replay re-arms the coach on the CURRENT run');
    assert.ok(replayed.card, 'a coach card is presented after replay');
    assert.deepEqual(replayErrors, [], 'tutorial-replay run had no page errors');
    notes.push('tutorial replay re-arms the coach mid-run (current run): PASS');
    await ctx2.close();
  }

  // --- export round-trips and is bounded ----------------------------------
  const exported = await page.evaluate(() => JSON.parse(JSON.stringify(window.__ppPerf.export())));
  assert.equal(exported.v, 1);
  assert.ok(exported.frames <= 600, 'export is bounded to capacity');

  assert.equal(errors.length, 0, 'no page errors: ' + errors.slice(0, 3).join(' | '));

  await mkdir(EVIDENCE_DIR, { recursive: true });
  await writeFile(`${EVIDENCE_DIR}/browser-runtime.json`, JSON.stringify({ at: new Date().toISOString(), url: GAME_URL, realHidden, notes, snapshot: snap, exported }, null, 2));
  console.log('browser-runtime: PASS');
  for (const n of notes) console.log('  - ' + n);
  console.log(`  frames=${snap.frames} fps=${snap.fps} p50=${snap.frameMs.p50}ms p95=${snap.frameMs.p95}ms p99=${snap.frameMs.p99}ms substepsMax=${snap.substeps.perFrameMax}`);
} catch (e) {
  failed = e;
  console.error('browser-runtime: FAIL');
  console.error(e && e.stack ? e.stack : e);
} finally {
  await browser.close().catch(() => {});
  stopOwnServer(); // own child PID only; an external server is never touched
}
if (failed) process.exitCode = 1;
