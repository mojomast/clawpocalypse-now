// lifecycle.js: page/window lifecycle handling (roadmap item 9).
//
// A backgrounded tab should stop simulating, stop drawing, stop advancing the
// animation clock and stop playing audio. Browsers already throttle
// requestAnimationFrame for hidden tabs, but a tab that is playing audio is
// exempt from that throttling, so the game has to suspend itself explicitly.
//
// This module owns the browser listeners and nothing else. It never touches the
// pause menu, the title/menu/cinema state or the game's own `paused` flag: a
// hidden tab and a manual pause are different states and must stay that way.
//
// createLifecycle(opts) where opts = {
//   doc, win,                    // document/window (undefined-safe for node tests)
//   onSuspend(reason),           // gameplay should stop advancing
//   onResume(reason),            // first frame back (reset the time accumulator)
//   onInputRelease(),            // clear latched keyboard/pad input
//   onFlush(),                   // pagehide only: safe checkpoint watcher
//   audio,                       // an audio object exposing suspend()/resume()
// }
// returns { suspended, hidden, suspend(), resume(), dispose(), stats, listeners, simulate() }
//
// `simulate(kind)` drives the same handlers without a real browser event; it is
// for tests and manual checks only and a synthetic dispatch must never be treated
// as proof that a document is actually hidden. Use a real hidden tab for that.
const noop = () => {};

export function createLifecycle(opts = {}) {
  const doc = opts.doc || (typeof document !== 'undefined' ? document : null);
  const win = opts.win || (typeof window !== 'undefined' ? window : null);
  const audio = opts.audio || null;
  const onSuspend = opts.onSuspend || noop;
  const onResume = opts.onResume || noop;
  const onInputRelease = opts.onInputRelease || noop;
  const onFlush = opts.onFlush || noop;
  const stats = { suspends: 0, resumes: 0, inputReleases: 0, flushes: 0 };

  let suspended = false, away = false, disposed = false;
  const registry = [];
  const safe = fn => { try { return fn(); } catch (_) { return undefined; } };

  // True only when the document itself reports hidden. A synthetic event that did
  // not change visibility must not be mistaken for a real hide.
  function docHidden() {
    try {
      if (doc && typeof doc.hidden === 'boolean') return doc.hidden;
      return !!(doc && doc.visibilityState === 'hidden');
    } catch (_) { return false; }
  }

  function releaseInput() {
    stats.inputReleases++;
    safe(onInputRelease);
  }

  // Suspend gameplay + audio. `flush` (pagehide only) always runs, even if we were
  // already suspended, so a close/bfcache still gets the checkpoint watcher. Latched
  // input is released on the way OUT (not only on return).
  function suspendNow(reason, flush) {
    if (disposed) return false;
    if (flush) { stats.flushes++; safe(onFlush); }
    if (suspended) return false; // no double suspend
    suspended = true; away = true; stats.suspends++;
    safe(() => { if (audio && typeof audio.suspend === 'function') audio.suspend(); });
    safe(() => onSuspend(reason));
    releaseInput();
    return true;
  }

  // Resume gameplay + audio. Never resumes into a document that is still hidden:
  // focus/pageshow can fire while hidden, and those must not un-suspend. Whichever
  // way we got here, clear latched input so nothing held while away fires on return.
  function resumeNow(reason) {
    if (disposed) return false;
    if (docHidden()) return false; // a still-hidden document must stay suspended
    const wasAway = suspended || away;
    suspended = false; away = false;
    if (!wasAway) return false;
    stats.resumes++;
    safe(() => { if (audio && typeof audio.resume === 'function') audio.resume(); });
    safe(() => onResume(reason));
    releaseInput();
    return true;
  }

  const onVisibility = () => { if (docHidden()) suspendNow('hidden', false); else resumeNow('visible'); };
  const onBlur = () => { away = true; releaseInput(); }; // focus loss: release, but do not suspend
  const onFocus = () => { if (!docHidden()) resumeNow('focus'); }; // focus while hidden must not resume
  const onPageHide = () => suspendNow('pagehide', true);
  const onPageShow = () => { if (!docHidden()) resumeNow('pageshow'); }; // pageshow (bfcache) while hidden must not resume

  function listen(target, type, fn) {
    if (!target || typeof target.addEventListener !== 'function') return;
    try { target.addEventListener(type, fn); registry.push({ target, type, fn }); } catch (_) {}
  }
  listen(doc, 'visibilitychange', onVisibility);
  listen(win, 'blur', onBlur);
  listen(win, 'focus', onFocus);
  listen(win, 'pagehide', onPageHide);
  listen(win, 'pageshow', onPageShow);

  // Seed the initial state: a document created while hidden starts suspended (no
  // simulation until it is actually shown). A visible document starts running.
  if (docHidden()) suspendNow('initial-hidden', false);

  function dispose() {
    disposed = true;
    for (const { target, type, fn } of registry) { try { target.removeEventListener(type, fn); } catch (_) {} }
    registry.length = 0;
  }

  function simulate(kind) {
    switch (kind) {
      case 'hidden': return suspendNow('hidden', false);
      case 'pagehide': return suspendNow('pagehide', true);
      case 'visible': return resumeNow('visible');
      case 'focus': return resumeNow('focus');
      case 'pageshow': return resumeNow('pageshow');
      case 'blur': away = true; releaseInput(); return true;
      default: return false;
    }
  }

  return {
    get suspended() { return suspended; },
    get hidden() { return suspended || docHidden(); },
    get listeners() { return registry.length; },
    suspend: () => suspendNow('manual', false),
    resume: () => resumeNow('manual'),
    simulate,
    dispose,
    stats,
  };
}
