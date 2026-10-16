// gamepad.js: Standard Gamepad API support (cheese, board t_e2a79b1973914d1c).
// The game reads input only through window keydown/keyup events (e.code), so a
// pad is turned into the same synthetic key events. Every menu, chord and combo
// then works without touching the code that reads the keyboard.
//
// game.js calls pollGamepad(dt, mode) once per frame, mode being one of
// 'boot' | 'title' | 'cine' | 'select' | 'pause' | 'over' | 'play', or a screens.js mode
// ('clear' | 'continue' | 'final' | 'initials' | 'scores' | 'credits').
import { OPTIONS } from './options-live.js';

export const DEADZONE = 0.25;
const REPEAT_DELAY = 0.38, REPEAT_RATE = 0.14; // menu auto-repeat (s)

// Standard mapping button indices.
export const BTN = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, BACK: 8, START: 9, L3: 10, R3: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };
// L3 is the Nous gang assist (assist.js reads it). R3 is the Machine ally
// (machine.js reads it on every connected pad, including pad 2). Neither is in
// PLAY_MAP, so a stick-click cannot double-fire through a synthetic key.

// Gameplay buttons -> key codes. Arrays are chords sent in the same frame
// (combat.js reads J+K as back attack and J+L as the special inside its 0.1 s window).
export const PLAY_MAP = {
  [BTN.A]: ['KeyL'],              // jump
  [BTN.X]: ['KeyJ'],              // punch (chain / grab follow-ups)
  [BTN.B]: ['KeyK'],              // kick (launcher, jump kick)
  [BTN.Y]: ['Space'],             // throw pizza (held = auto-fire)
  [BTN.LB]: ['KeyJ', 'KeyK'],     // back attack
  [BTN.RB]: ['KeyJ', 'KeyL'],     // special (costs HP)
  [BTN.START]: ['Escape'],        // pause
  [BTN.BACK]: ['KeyM'],           // mute toggle
};
export const DASH_BUTTONS = [BTN.LT, BTN.RT]; // double-tap in the facing direction

// Menu buttons per mode -> key code.
export const MENU_MAP = {
  boot:   { [BTN.A]: 'Enter', [BTN.B]: 'Enter', [BTN.X]: 'Enter', [BTN.Y]: 'Enter', [BTN.START]: 'Enter' },
  title:  { [BTN.A]: 'Enter', [BTN.START]: 'Enter', [BTN.B]: 'Escape', [BTN.BACK]: 'KeyM' },
  cine:   { [BTN.A]: 'Enter', [BTN.X]: 'Enter', [BTN.B]: 'Escape', [BTN.START]: 'Escape' },
  select: { [BTN.A]: 'Enter', [BTN.Y]: 'KeyR', [BTN.START]: 'Enter', [BTN.BACK]: 'KeyM' },
  pause:  { [BTN.A]: 'Enter', [BTN.B]: 'Escape', [BTN.START]: 'Escape' },
  over:   { [BTN.A]: 'Space', [BTN.START]: 'Space', [BTN.Y]: 'Space' },
  // screens.js result screens (mode = screens.mode()).
  clear:    { [BTN.A]: 'Enter', [BTN.START]: 'Enter', [BTN.X]: 'Enter' },
  continue: { [BTN.A]: 'Enter', [BTN.START]: 'Enter', [BTN.B]: 'Escape', [BTN.X]: 'KeyX' }, // X ticks the countdown
  final:    { [BTN.A]: 'Enter', [BTN.START]: 'Enter', [BTN.B]: 'Enter' },
  initials: { [BTN.A]: 'Enter', [BTN.B]: 'Backspace', [BTN.START]: 'Escape' }, // Start commits the initials
  scores:   { [BTN.A]: 'Enter', [BTN.START]: 'Enter', [BTN.B]: 'Enter' },
  credits:  { [BTN.A]: 'Enter', [BTN.START]: 'Enter', [BTN.B]: 'Escape' },
};
const DIR_KEYS = { left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown' };
const MENU_DIR_MODES = new Set(['select', 'pause', 'initials']); // modes where the stick/d-pad sends tapped arrows

const pressed = b => !!b && (typeof b === 'object' ? (b.pressed || b.value > 0.5) : b > 0.5);

// Reads every connected pad and ORs them together: buttons[] and dirs{}.
export function readPads(pads, deadzone = DEADZONE) {
  const out = { buttons: [], dirs: { left: false, right: false, up: false, down: false }, count: 0 };
  for (const p of pads || []) {
    if (!p || p.connected === false) continue;
    out.count++;
    (p.buttons || []).forEach((b, i) => { if (pressed(b)) out.buttons[i] = true; });
    const ax = (p.axes && p.axes[0]) || 0, ay = (p.axes && p.axes[1]) || 0;
    const mag = Math.hypot(ax, ay);
    const sx = mag > deadzone ? ax : 0, sy = mag > deadzone ? ay : 0;
    // A direction counts once the stick is clearly past ~22 degrees off its axis.
    if (sx < -deadzone * 0.8 || out.buttons[BTN.LEFT]) out.dirs.left = true;
    if (sx > deadzone * 0.8 || out.buttons[BTN.RIGHT]) out.dirs.right = true;
    if (sy < -deadzone * 0.8 || out.buttons[BTN.UP]) out.dirs.up = true;
    if (sy > deadzone * 0.8 || out.buttons[BTN.DOWN]) out.dirs.down = true;
  }
  return out;
}

// emit(type, code, opts) sends one key event. Defaults to a KeyboardEvent on window.
export function createGamepad(opts = {}) {
  const getPads = opts.getPads || (() => { try { return navigator.getGamepads ? [...navigator.getGamepads()] : []; } catch (_) { return []; } });
  const emit = opts.emit || ((type, code) => {
    try { dispatchEvent(new KeyboardEvent(type, { code, key: code, bubbles: true, cancelable: true })); } catch (_) {}
  });
  const facing = opts.facing || (() => { try { return (window.__ppState && window.__ppState.combat && window.__ppState.combat.facing) || 1; } catch (_) { return 1; } });
  let prevBtn = [], prevDirs = {}, held = new Set(), mode = 'boot', repeatT = {}, connected = 0, pad2 = null;
  let usablePads = [], lastPads = [], suspended = false;
  const known = new Map(), blocked = new Set();
  const log = [];
  const send = (type, code) => { log.push(type + ':' + code); if (log.length > 64) log.shift(); emit(type, code); };
  const down = code => { held.add(code); send('keydown', code); };
  const up = code => { held.delete(code); send('keyup', code); };
  const tap = code => { send('keydown', code); send('keyup', code); };
  function releaseAll() { for (const c of [...held]) up(c); }
  // Full input reset: drop held keys, forget button/direction edges and menu repeat.
  function reset() { releaseAll(); prevBtn = []; prevDirs = {}; repeatT = {}; }
  const slotOf = (p, i) => Number.isInteger(p.index) && p.index >= 0 ? p.index : i;
  const samplePads = () => { try { return Array.from(getPads() || []); } catch (_) { return []; } };
  const physicalActive = (p, dz) => {
    const dirs = readPads([p], dz).dirs;
    return (p.buttons || []).some(pressed) || Object.values(dirs).some(Boolean) ||
      Array.from(p.axes || []).slice(2).some(a => Math.abs(a || 0) > dz);
  };
  // Native Gamepad fields live on its prototype, so spreading one loses its
  // identity and connection status in the published, masked snapshot.
  const maskedPad = p => ({
    index: p.index, id: p.id, connected: p.connected, timestamp: p.timestamp, mapping: p.mapping,
    axes: Array.from(p.axes || [], () => 0),
    buttons: Array.from(p.buttons || [], () => ({ pressed: false, touched: false, value: 0 }))
  });
  // A latch is tied to a physical slot, not the ephemeral Gamepad object returned
  // by getGamepads(). A different id at the same slot is also a reconnect.
  function requireNeutral() {
    reset();
    for (const [i, p] of samplePads().entries()) if (p && p.connected !== false) blocked.add(slotOf(p, i));
    for (const [i, p] of lastPads.entries()) if (p && p.connected !== false) blocked.add(slotOf(p, i));
    usablePads = [];
    pad2 = null;
  }
  function suspendInput() { suspended = true; requireNeutral(); }
  function resumeInput() {
    if (typeof document !== 'undefined' && document.hidden) return;
    suspended = false; requireNeutral();
  }
  function disconnect(p) {
    if (p && Number.isInteger(p.index)) blocked.add(p.index);
    else for (const slot of known.keys()) blocked.add(slot);
    reset(); usablePads = []; pad2 = null;
  }
  // Live accessibility: deadzone comes from the options store (clamped). Default
  // OPTIONS.padDeadzone (0.25) equals DEADZONE, so the default path is unchanged.
  function deadzone() {
    let v = DEADZONE;
    try { const raw = Number(OPTIONS && OPTIONS.padDeadzone); if (Number.isFinite(raw)) v = Math.min(0.5, Math.max(0.1, raw)); } catch (_) {}
    return v;
  }
  function padPreset() {
    try { return (OPTIONS && OPTIONS.padPreset) === 'alternate' ? 'alternate' : 'classic'; } catch (_) { return 'classic'; }
  }

  function poll(dt = 1 / 60, newMode = 'play') {
    const pads = samplePads();
    // cheese (co-op t_3a33c55607144558): with two or more pads, the first drives P1's
    // keys and the second is published as `pad2` for coop.js. One pad: unchanged.
    const dz = deadzone();
    const seen = new Map();
    for (const [i, p] of pads.entries()) {
      if (p && p.connected === false) { blocked.add(slotOf(p, i)); continue; }
      if (!p) continue;
      const slot = slotOf(p, i), id = p.id || '';
      if (known.has(slot) && known.get(slot) !== id) blocked.add(slot);
      seen.set(slot, id);
    }
    const formerP1 = [...known.keys()][0];
    for (const slot of known.keys()) if (!seen.has(slot)) {
      blocked.add(slot);
      // The surviving P2 must not become P1 with its old held controls.
      if (slot === formerP1) for (const survivor of seen.keys()) blocked.add(survivor);
    }
    known.clear();
    for (const [slot, id] of seen) known.set(slot, id);
    // Neutral may only be observed after return to the active document. The
    // neutral sample itself remains masked; the next fresh press is actionable.
    const permitted = new Set();
    usablePads = pads.map((p, i) => {
      if (!p || p.connected === false) return null;
      const slot = slotOf(p, i);
      if (suspended || blocked.has(slot)) {
        if (!suspended && !physicalActive(p, dz)) blocked.delete(slot);
        return maskedPad(p);
      }
      permitted.add(i);
      return p;
    });
    lastPads = pads;
    const physical = pads.map((p, i) => p && p.connected !== false ? i : -1).filter(i => i >= 0);
    pad2 = physical.length > 1 && permitted.has(physical[1]) ? readPads([usablePads[physical[1]]], dz) : null;
    const p1 = physical[0];
    const st = readPads(p1 !== undefined && permitted.has(p1) ? [usablePads[p1]] : [], dz);
    connected = st.count;
    if (newMode !== mode) { releaseAll(); mode = newMode; repeatT = {}; }
    if (!st.count) { if (held.size) releaseAll(); prevBtn = []; prevDirs = {}; return api; }
    const edge = i => st.buttons[i] && !prevBtn[i];
    const rel = i => !st.buttons[i] && prevBtn[i];
    if (mode === 'play') {
      // Movement: hold the arrow keys while the stick/d-pad points that way.
      for (const [d, code] of Object.entries(DIR_KEYS)) {
        if (st.dirs[d] && !held.has(code)) down(code);
        else if (!st.dirs[d] && held.has(code)) up(code);
      }
      for (const [i, codes] of Object.entries(PLAY_MAP)) {
        if (edge(+i)) {
          if (codes.length === 1 && codes[0] === 'Space') down('Space'); // held auto-fire
          else for (const c of codes) tap(c);
          if (codes[0] === 'Escape') break; // pause opened; mode changes next frame
        } else if (rel(+i) && codes[0] === 'Space' && held.has('Space')) up('Space');
      }
      for (const i of DASH_BUTTONS) if (edge(i)) {
        const code = facing() < 0 ? 'ArrowLeft' : 'ArrowRight';
        if (padPreset() === 'alternate') { tap('ShiftLeft'); continue; } // single-press dash
        const wasHeld = held.has(code);
        send('keydown', code); send('keyup', code); send('keydown', code); // two taps = run
        if (wasHeld) held.add(code); else send('keyup', code);
      }
    } else {
      const map = MENU_MAP[mode] || {};
      if (MENU_DIR_MODES.has(mode)) {
        for (const [d, code] of Object.entries(DIR_KEYS)) {
          if (st.dirs[d] && !prevDirs[d]) { tap(code); repeatT[d] = REPEAT_DELAY; }
          else if (st.dirs[d]) { repeatT[d] -= dt; if (repeatT[d] <= 0) { tap(code); repeatT[d] = REPEAT_RATE; } }
        }
      }
      for (const [i, code] of Object.entries(map)) if (edge(+i)) { tap(code); break; } // one action per frame
    }
    prevBtn = st.buttons.slice(); prevDirs = { ...st.dirs };
    return api;
  }

  const api = { poll, releaseAll, reset, requireNeutral, suspendInput, resumeInput, disconnect, get mode() { return mode; }, get held() { return [...held]; }, get connected() { return connected; }, get pad2() { return pad2; }, get usablePads() { return usablePads; }, log };
  return api;
}

let shared = null;
// Entry point used by game.js: lazily creates the browser instance.
export function pollGamepad(dt, mode) {
  if (!shared) {
    shared = createGamepad();
    if (typeof window !== 'undefined') {
      window.__ppGamepad = shared;
      addEventListener('gamepadconnected', e => { console.info('[gamepad] connected: ' + (e.gamepad && e.gamepad.id)); });
      addEventListener('gamepaddisconnected', e => { shared.disconnect(e.gamepad); console.info('[gamepad] disconnected'); });
      // Losing focus must not leave a pad button latched as a held key.
      addEventListener('blur', () => shared.suspendInput());
      addEventListener('focus', () => shared.resumeInput());
      addEventListener('pagehide', () => shared.suspendInput());
      addEventListener('pageshow', () => shared.resumeInput());
      addEventListener('visibilitychange', () => { if (document.hidden) shared.suspendInput(); else shared.resumeInput(); });
    }
  }
  return shared.poll(dt, mode);
}
