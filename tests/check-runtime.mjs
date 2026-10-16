// tests/check-runtime.mjs — Node-only checks for the lifecycle + perf-metrics work
// (roadmap item 9). No browser, no DOM, no assets.
//
//   node tests/check-runtime.mjs
//
// Covers: MAX_SUBSTEPS and the exact 0.1 s cap; ring-buffer percentiles on a known
// sample set; P1-scoped named counters (and the ABSENCE of mislabeled/party totals);
// resetClock/resetCounters; disabled metrics being no-ops; the lifecycle handler flow
// against a fake doc/win event target (hidden -> suspend once, visible -> resume with
// a hidden guard, focus/pageshow do not resume a hidden document, initial hidden
// seeds suspended, blur -> input release, pagehide -> flush, input released on
// suspend); JSON-serialisable, bounded export(); and audio.suspend/resume being safe
// no-ops with no AudioContext.
import assert from 'node:assert/strict';
import { createPerfMetrics, MAX_SUBSTEPS, percentile } from '../perf-metrics.js';
import { createLifecycle } from '../lifecycle.js';
import { createAudio } from '../audio.js';

let passed = 0;
const ok = (name, fn) => { fn(); passed++; console.log('  ok - ' + name); };

// ---------------------------------------------------------------------------
console.log('perf-metrics: substep budget');
ok('MAX_SUBSTEPS is 12 and the cap is exactly 0.1 s', () => {
  assert.equal(MAX_SUBSTEPS, 12);
  assert.equal(MAX_SUBSTEPS * (1 / 120), 0.1);
});

console.log('perf-metrics: percentiles');
ok('nearest-rank percentile on a known set', () => {
  const s = [10, 20, 30, 40, 50, 60, 70, 80];
  assert.equal(percentile(s, 50), 40);
  assert.equal(percentile(s, 95), 80);
  assert.equal(percentile(s, 99), 80);
  assert.equal(percentile([1, 2, 3, 4, 5], 50), 3);
  assert.equal(percentile([], 95), 0);
});

console.log('perf-metrics: ring buffer');
ok('p50/p95/p99/min/max/mean from a known frame set', () => {
  const p = createPerfMetrics({ enabled: true, capacity: 8 });
  let t = 0;
  p.beginFrame(t); p.endFrame(t); // priming frame: gap 0, overwritten once the ring is full
  for (const d of [10, 20, 30, 40, 50, 60, 70, 80]) { t += d; p.beginFrame(t); p.endFrame(t); }
  const snap = p.snapshot();
  assert.equal(snap.frames, 8, 'ring caps at capacity');
  assert.equal(snap.frameMs.p50, 40);
  assert.equal(snap.frameMs.p95, 80);
  assert.equal(snap.frameMs.p99, 80);
  assert.equal(snap.frameMs.min, 10);
  assert.equal(snap.frameMs.max, 80);
  assert.equal(snap.frameMs.mean, 45);
  assert.equal(snap.fps, Math.round((1000 / 45) * 100) / 100);
});

ok('substeps, histogram, dropped time and sim/render slices are recorded', () => {
  const p = createPerfMetrics({ enabled: true, capacity: 4 });
  p.beginFrame(0); p.endFrame(0);
  p.beginFrame(16); p.beginSim(); p.noteSubsteps(2); p.endSim(); p.beginRender(); p.endRender(); p.endFrame(16);
  p.beginFrame(33); p.beginSim(); p.noteSubsteps(3); p.endSim(); p.beginRender(); p.endRender(); p.noteDropped(25.5); p.endFrame(33);
  const snap = p.snapshot();
  assert.equal(snap.substeps.total, 5);
  assert.equal(snap.substeps.perFrameMax, 3);
  assert.equal(snap.substeps.histogram[2], 1);
  assert.equal(snap.substeps.histogram[3], 1);
  assert.equal(snap.droppedMs, 25.5);
  assert.ok(snap.simMs >= 0 && snap.renderMs >= 0);
});

ok('export() is JSON-serialisable', () => {
  const p = createPerfMetrics({ enabled: true, capacity: 4 });
  p.beginFrame(0); p.endFrame(0);
  const round = JSON.parse(JSON.stringify(p.export()));
  assert.equal(round.v, 1);
  assert.equal(round.maxSubsteps, 12);
  assert.ok(typeof round.frameMs.p95 === 'number');
});

console.log('perf-metrics: counters + attribution');
ok('counters are P1-scoped, accurately named, with no party totals', () => {
  const p = createPerfMetrics({ enabled: true });
  p.note('p1AttackStarts', 1, { hero: 'turtle_blue' });
  p.note('p1AttackStarts', 1, { hero: 'nous_girl' });
  p.note('p1LandedAttacks', 2, { hero: 'turtle_blue' });
  p.note('p1DamageEvents', 1, { hero: 'turtle_blue' });
  p.note('p1ScoreEvents', 3, { hero: 'turtle_blue' });
  p.note('continues', 1);
  p.note('encounter', 1500, { level: 3 });
  p.note('encounter', 500, { level: 3 });
  const c = p.counters;
  assert.equal(c.p1AttackStarts, 2);
  assert.equal(c.p1LandedAttacks, 2);
  assert.equal(c.p1DamageEvents, 1);
  assert.equal(c.p1ScoreEvents, 3);
  assert.equal(c.continues, 1);
  assert.equal(c.p1AttackStartsByHero.turtle_blue, 1);
  assert.equal(c.p1AttackStartsByHero.nous_girl, 1);
  assert.equal(c.encounterMsByLevel[3], 2000);
  // No mislabeled "hits"/"playerDamage" and no party/co-op totals (P2 is not instrumented).
  assert.ok(!('hits' in c) && !('playerDamage' in c) && !('attacks' in c), 'no ambiguous/party counter names');
  assert.ok(!('soloAttacks' in c) && !('coopAttacks' in c) && !('coopHits' in c), 'no party totals');
  // snapshot counters are a detached clone (safe to mutate/serialise)
  const snap = p.snapshot();
  assert.equal(snap.countersScope, 'P1 only (P2 not instrumented)');
  snap.counters.p1AttackStarts = 999;
  assert.equal(p.counters.p1AttackStarts, 2);
});

ok('reset() clears the ring buffer and counters', () => {
  const p = createPerfMetrics({ enabled: true, capacity: 4 });
  p.beginFrame(0); p.endFrame(10); p.note('p1ScoreEvents', 3); p.noteDropped(9);
  p.reset();
  const snap = p.snapshot();
  assert.equal(snap.frames, 0);
  assert.equal(snap.droppedMs, 0);
  assert.ok(!snap.counters.p1ScoreEvents, 'counters cleared (lazy keys absent)');
  assert.equal(snap.substeps.total, 0);
});

ok('resetClock keeps samples/counters but drops the next (background) gap', () => {
  const p = createPerfMetrics({ enabled: true, capacity: 8 });
  p.beginFrame(0); p.endFrame(0);
  p.beginFrame(10); p.endFrame(10);       // one real 10 ms sample
  p.note('p1ScoreEvents', 1);
  p.resetClock();                          // a hidden/title/cinema gap happens here
  p.beginFrame(5000); p.endFrame(5000);    // 5 s wall gap: must NOT be recorded
  const snap = p.snapshot();
  assert.equal(snap.frames, 3);
  assert.equal(snap.frameMs.max, 10, 'the background gap did not poison the samples');
  assert.equal(snap.counters.p1ScoreEvents, 1, 'resetClock preserves counters');
});

ok('resetCounters clears counters but keeps frame samples', () => {
  const p = createPerfMetrics({ enabled: true, capacity: 8 });
  p.beginFrame(0); p.endFrame(0);
  p.note('p1ScoreEvents', 2);
  p.resetCounters();
  const snap = p.snapshot();
  assert.equal(snap.frames, 1, 'frame samples are kept across a new run');
  assert.ok(!snap.counters.p1ScoreEvents, 'counters cleared, samples kept');
});

console.log('perf-metrics: disabled = cheap no-op with valid shape');
ok('every method is safe and mutates nothing when disabled', () => {
  const p = createPerfMetrics({ enabled: false });
  assert.equal(p.enabled, false);
  p.beginFrame(1); p.beginSim(); p.endSim(); p.beginRender(); p.endRender();
  p.noteSubsteps(5); p.noteDropped(100); p.note('p1ScoreEvents', 1, { hero: 'x' });
  p.resetClock(); p.resetCounters(); p.reset();
  const snap = p.snapshot();
  assert.equal(snap.frames, 0);
  assert.equal(snap.fps, 0);
  assert.equal(snap.substeps.total, 0);
  assert.equal(snap.droppedMs, 0);
  assert.ok(!snap.counters.p1ScoreEvents, 'disabled call did not record a counter');
  assert.ok(snap.frameMs && snap.frameMs.p50 === 0 && snap.substeps.histogram);
  assert.doesNotThrow(() => JSON.stringify(p.export()));
});

// ---------------------------------------------------------------------------
// Fake event target: mirrors document/window closely enough for createLifecycle.
function fakeTarget(init = {}) {
  const handlers = new Map();
  return {
    hidden: !!init.hidden,
    visibilityState: init.hidden ? 'hidden' : 'visible',
    addEventListener(type, fn) { if (!handlers.has(type)) handlers.set(type, new Set()); handlers.get(type).add(fn); },
    removeEventListener(type, fn) { const s = handlers.get(type); if (s) s.delete(fn); },
    dispatch(type) { for (const fn of [...(handlers.get(type) || [])]) fn({ type }); },
    listenerCount() { let n = 0; for (const s of handlers.values()) n += s.size; return n; },
  };
}

console.log('lifecycle: handler flow against a fake doc/win');
ok('hidden suspends once, calls onSuspend + audio.suspend, and leaves pause state alone', () => {
  const doc = fakeTarget({ hidden: false }), win = fakeTarget();
  const calls = { suspend: [], resume: [], release: 0, flush: 0, audioSuspend: 0, audioResume: 0 };
  const ll = createLifecycle({
    doc, win,
    audio: { suspend() { calls.audioSuspend++; }, resume() { calls.audioResume++; } },
    onSuspend: r => calls.suspend.push(r),
    onResume: r => calls.resume.push(r),
    onInputRelease: () => calls.release++,
    onFlush: () => calls.flush++,
  });
  assert.ok(ll.listeners >= 5, 'attached real listeners');
  assert.equal(ll.suspended, false);

  doc.hidden = true; doc.visibilityState = 'hidden';
  doc.dispatch('visibilitychange');
  assert.equal(calls.suspend.length, 1, 'suspend called once');
  assert.equal(calls.suspend[0], 'hidden');
  assert.equal(ll.suspended, true);
  assert.equal(calls.audioSuspend, 1, 'audio suspended while hidden');
  assert.equal(calls.release, 1, 'input released on suspend, not only on return');

  // No double-suspend (and no extra release) from a repeated hidden event.
  doc.dispatch('visibilitychange');
  assert.equal(calls.suspend.length, 1);
  assert.equal(calls.audioSuspend, 1);
  assert.equal(calls.release, 1);

  doc.hidden = false; doc.visibilityState = 'visible';
  doc.dispatch('visibilitychange');
  assert.equal(calls.resume.length, 1, 'resume on visible');
  assert.equal(calls.audioResume, 1, 'audio resumed');
  assert.equal(calls.release, 2, 'input released again on resume so nothing stays latched');
  assert.equal(ll.suspended, false);
  ll.dispose();
});

ok('a document created hidden starts suspended and focus/pageshow do not resume', () => {
  const doc = fakeTarget({ hidden: true }), win = fakeTarget();
  const calls = { suspend: [], resume: [], release: 0, flush: 0 };
  const ll = createLifecycle({
    doc, win,
    onSuspend: r => calls.suspend.push(r),
    onResume: r => calls.resume.push(r),
    onInputRelease: () => calls.release++,
    onFlush: () => calls.flush++,
  });
  assert.equal(ll.suspended, true, 'seeded suspended at creation');
  assert.equal(calls.suspend.length, 1);
  assert.equal(calls.suspend[0], 'initial-hidden');
  assert.equal(calls.release, 1, 'input released at the initial suspend');

  // Real focus/pageshow can fire while the document is still hidden: neither may resume.
  win.dispatch('focus');
  win.dispatch('pageshow');
  doc.dispatch('visibilitychange'); // still hidden
  assert.equal(calls.resume.length, 0, 'no resume while the document is hidden');
  assert.equal(ll.suspended, true);

  doc.hidden = false; doc.visibilityState = 'visible';
  doc.dispatch('visibilitychange');
  assert.equal(calls.resume.length, 1, 'resumes only once actually visible');
  assert.equal(ll.suspended, false);
  ll.dispose();
});

ok('blur releases input without suspending; focus resumes; pagehide flushes', () => {
  const doc = fakeTarget(), win = fakeTarget();
  const calls = { suspend: 0, resume: 0, release: 0, flush: 0 };
  const ll = createLifecycle({ doc, win, onSuspend: () => calls.suspend++, onResume: () => calls.resume++, onInputRelease: () => calls.release++, onFlush: () => calls.flush++ });

  win.dispatch('blur');
  assert.equal(calls.suspend, 0, 'blur does not suspend');
  assert.equal(calls.release, 1, 'blur releases latched input');

  win.dispatch('focus');
  assert.equal(calls.resume, 1, 'focus resumes');
  assert.equal(calls.release, 2);

  win.dispatch('pagehide');
  assert.equal(calls.flush, 1, 'pagehide flushes the checkpoint watcher');
  assert.equal(calls.suspend, 1, 'pagehide also suspends');
  assert.equal(calls.release, 3, 'pagehide releases latched input on suspend');
  win.dispatch('pagehide'); // already suspended
  assert.equal(calls.flush, 2, 'flush still runs on a repeat pagehide');
  assert.equal(calls.suspend, 1, 'no double-suspend');
  assert.equal(calls.release, 3, 'no extra release from a repeat pagehide');

  win.dispatch('pageshow'); // doc is visible here, so this resumes
  assert.equal(calls.resume, 2);
  assert.equal(calls.release, 4, 'input released on return');
  ll.dispose();
});

ok('suspend()/resume()/simulate() are callable and dispose detaches listeners', () => {
  const doc = fakeTarget(), win = fakeTarget();
  const ll = createLifecycle({ doc, win });
  assert.equal(typeof ll.simulate, 'function');
  assert.equal(ll.simulate('hidden'), true);
  assert.equal(ll.suspended, true);
  assert.equal(ll.simulate('hidden'), false, 'simulate respects no-double-suspend');
  assert.equal(ll.simulate('visible'), true);
  assert.equal(ll.suspended, false);
  const n = ll.listeners;
  assert.ok(n >= 5);
  ll.dispose();
  assert.equal(ll.listeners, 0);
  assert.equal(doc.listenerCount() + win.listenerCount(), 0, 'all listeners removed');
});

ok('lifecycle is destructure-safe with no doc/win', () => {
  const ll = createLifecycle({});
  assert.doesNotThrow(() => { ll.suspend(); ll.resume(); ll.dispose(); });
  assert.equal(ll.suspended, false);
});

// ---------------------------------------------------------------------------
console.log('audio: suspend/resume without an AudioContext');
ok('createAudio().suspend/resume exist and are safe no-ops', () => {
  const a = createAudio();
  assert.equal(typeof a.suspend, 'function');
  assert.equal(typeof a.resume, 'function');
  assert.equal(a.suspend(), false);
  assert.equal(a.resume(), false);
  assert.equal(a.state, 'none');
  // Track identity and mute flag are untouched by suspend/resume.
  assert.equal(a.musicName, null);
  assert.equal(a.muted, false);
});

console.log(`\ncheck-runtime: ${passed} checks passed`);
