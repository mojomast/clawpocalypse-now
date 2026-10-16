// perf-metrics.js: opt-in frame-time / substep observability (roadmap item 9).
//
// Plain, dependency-free and local-only. Nothing here talks to the network: it is
// a bounded in-memory ring buffer plus a small set of diagnostic counters that a
// human playtester can export as JSON (see tools/playtest-report.mjs).
//
// The whole module is a cheap no-op unless `enabled` is true, so game.js can call
// every method unconditionally on the hot path without changing behaviour when the
// `?debug=1` flag is absent.
//
// Public API (see createPerfMetrics):
//   MAX_SUBSTEPS                 - the current catch-up budget (12 * 1/120 s = 0.1 s)
//   beginFrame(t) / endFrame(t)  - rAF frame boundaries (t = rAF timestamp)
//   beginSim() / endSim()        - fixed-step simulation block
//   beginRender() / endRender()  - draw block
//   noteSubsteps(n)              - substeps run this frame
//   noteDropped(ms)              - time the frame budget threw away (raw-clamp + acc-clamp)
//   note(name, n=1, attr)        - increment a counter, optionally attributed to a hero
//   counters                     - live counter object
//   snapshot()                   - plain stats object (fps, percentiles, substeps, counters)
//   export()                     - JSON-serialisable capture for a playtest report
//   reset()                      - clear the ring buffer and counters

// 12 substeps of the 1/120 s fixed step = the 0.1 s catch-up cap game.js has always
// used. Named so the budget is intentional/testable rather than incidental, and so
// MAX_SUBSTEPS * STEP stays exactly 0.1 (verified in tests/check-runtime.mjs).
export const MAX_SUBSTEPS = 12;

const now = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());

// Nearest-rank percentile; `sorted` must be ascending.
export function percentile(sorted, p) {
  const n = sorted.length;
  if (!n) return 0;
  const idx = Math.min(n - 1, Math.max(0, Math.ceil((p / 100) * n) - 1));
  return sorted[idx];
}

const round = (v, d = 3) => {
  const f = 10 ** d;
  return Math.round(v * f) / f;
};

export function createPerfMetrics(opts = {}) {
  const enabled = !!opts.enabled;
  const capacity = Math.max(1, (opts.capacity | 0) || 600);

  // Ring buffers: one slot per rendered frame, fixed capacity (oldest overwritten).
  const framesBuf = new Float64Array(capacity);
  const simBuf = new Float64Array(capacity);
  const renderBuf = new Float64Array(capacity);
  const subBuf = new Int32Array(capacity);
  let head = 0, count = 0, lastT = -1;

  let simStart = 0, renderStart = 0, simAcc = 0, renderAcc = 0;
  let pendingSubsteps = 0, droppedMs = 0;

  // Counters are created lazily by note(). They are deliberately P1-only and named
  // for what they actually measure (e.g. p1ScoreEvents, p1DamageEvents,
  // p1AttackStarts, p1LandedAttacks, continues). P2 is a view of the shared state and
  // is NOT instrumented, so this object must never be presented as a party/co-op total.
  const zeroCounters = () => ({ encounterMsByLevel: {} });
  let counters = zeroCounters();

  // ---- frame lifecycle -----------------------------------------------------
  // beginFrame/endFrame bracket one rAF callback. endFrame records the rAF gap
  // (frame time), the two work slices measured inside, and this frame's substeps.
  function beginFrame(t) {
    if (!enabled) return;
    simAcc = 0; renderAcc = 0; pendingSubsteps = 0;
  }
  function endFrame(t) {
    if (!enabled) return;
    const gap = lastT < 0 ? 0 : Math.max(0, t - lastT);
    lastT = t;
    framesBuf[head] = gap;
    simBuf[head] = simAcc;
    renderBuf[head] = renderAcc;
    subBuf[head] = pendingSubsteps;
    head = (head + 1) % capacity;
    if (count < capacity) count++;
  }
  function beginSim() { if (enabled) simStart = now(); }
  function endSim() { if (enabled) simAcc += Math.max(0, now() - simStart); }
  function beginRender() { if (enabled) renderStart = now(); }
  function endRender() { if (enabled) renderAcc += Math.max(0, now() - renderStart); }
  function noteSubsteps(n) { if (enabled) pendingSubsteps += Math.max(0, n | 0); }
  function noteDropped(ms) { if (enabled && Number.isFinite(ms) && ms > 0) droppedMs += ms; }

  // ---- counters ------------------------------------------------------------
  // `attr` = { hero, level }. Only P1 attribution (hero) is recorded; there are no
  // party/co-op totals because P2 is not instrumented.
  function note(name, n = 1, attr = null) {
    if (!enabled) return;
    if (name === 'encounter') {
      const lv = attr && attr.level != null ? attr.level : 'unknown';
      counters.encounterMsByLevel[lv] = (counters.encounterMsByLevel[lv] || 0) + n;
      return;
    }
    counters[name] = (counters[name] || 0) + n;
    if (!attr || !attr.hero) return;
    const map = counters[name + 'ByHero'] || (counters[name + 'ByHero'] = {});
    map[attr.hero] = (map[attr.hero] || 0) + n;
  }
  // Drop only the counters (keep frame samples); used on a new run.
  function resetCounters() { counters = zeroCounters(); }
  // Forget the last frame timestamp without discarding samples/counters, so a gap
  // across hidden/title/cinema is not recorded as one giant frame time.
  function resetClock() { lastT = -1; }

  // ---- reporting -----------------------------------------------------------
  function frameStats() {
    const frames = new Array(count);
    const sims = new Array(count);
    const renders = new Array(count);
    const subs = new Array(count);
    const start = (head - count + capacity) % capacity;
    for (let i = 0; i < count; i++) {
      const k = (start + i) % capacity;
      frames[i] = framesBuf[k]; sims[i] = simBuf[k]; renders[i] = renderBuf[k]; subs[i] = subBuf[k];
    }
    return { frames, sims, renders, subs };
  }
  function statsOf(arr) {
    if (!arr.length) return { p50: 0, p95: 0, p99: 0, min: 0, max: 0, mean: 0 };
    const s = [...arr].sort((a, b) => a - b);
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
    return { p50: round(percentile(s, 50)), p95: round(percentile(s, 95)), p99: round(percentile(s, 99)), min: round(s[0]), max: round(s[s.length - 1]), mean: round(mean) };
  }
  function snapshot() {
    const { frames, sims, renders, subs } = frameStats();
    const fr = statsOf(frames);
    const histogram = {};
    let subTotal = 0, subMax = 0;
    for (const n of subs) { subTotal += n; if (n > subMax) subMax = n; histogram[n] = (histogram[n] || 0) + 1; }
    const meanSim = sims.length ? sims.reduce((a, b) => a + b, 0) / sims.length : 0;
    const meanRender = renders.length ? renders.reduce((a, b) => a + b, 0) / renders.length : 0;
    return {
      frames: count,
      fps: fr.mean > 0 ? round(1000 / fr.mean, 2) : 0,
      frameMs: fr,
      simMs: round(meanSim),
      renderMs: round(meanRender),
      substeps: { total: subTotal, perFrameMax: subMax, histogram },
      droppedMs: round(droppedMs),
      countersScope: 'P1 only (P2 not instrumented)',
      counters: JSON.parse(JSON.stringify(counters)),
    };
  }
  function exportData() {
    const snap = snapshot();
    return { v: 1, at: Date.now(), enabled, maxSubsteps: MAX_SUBSTEPS, ...snap };
  }
  function reset() {
    head = 0; count = 0; lastT = -1; simAcc = 0; renderAcc = 0;
    pendingSubsteps = 0; droppedMs = 0;
    counters = zeroCounters();
  }

  return {
    enabled,
    capacity,
    maxSubsteps: MAX_SUBSTEPS,
    beginFrame, endFrame, beginSim, endSim, beginRender, endRender,
    noteSubsteps, noteDropped, note,
    resetClock, resetCounters,
    get counters() { return counters; },
    snapshot, export: exportData, reset,
  };
}
