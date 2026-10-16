// pause.js: menu overlay drawn in screen space. Keeps all menu state and input
// parsing away from game.js so the gameplay module only needs open/close hooks.
//
// The options screen is descriptor-driven and paginated: pages hold at most four
// rows, Up/Down walks every row across pages (wrapping) and Left/Right/Enter act
// on the row under the cursor. The layout comes from optionsLayout() so a harness
// asserts the boxes rather than someone eyeballing a screenshot.
import { OPTIONS } from './options-live.js';
import { P2_KEYS, P2_PAD } from './coop.js';
import { normalizeRoute } from './challenge-routes.js';

// One shared pitch for every element, so a row's hint can never collide with the
// next row's label. Layout is computed by optionsLayout(), which shrinks the pitch
// (never below minPitch) until all rows plus the Back button fit inside the panel.
export const OPT_LAYOUT = { top: 140, maxPitch: 66, minPitch: 56, name: 20, val: 18, hint: 9, gap: 8, boxPad: 10, boxH: 42, backLimit: 430 };

// Controls screen: the block is fitted into the space above the Back button
// instead of overflowing it.
export const CTRL_LAYOUT = { firstY: 124, lastY: 372, backY: 404, minPitch: 18 };

export function controlsLayout(n, L = CTRL_LAYOUT) {
  const pitch = n > 1 ? Math.min(27, (L.lastY - L.firstY) / (n - 1)) : 27;
  const lineY = i => L.firstY + i * pitch;
  const last = n ? lineY(n - 1) : L.firstY;
  return { pitch, lineY, lastY: last, backY: L.backY, fitsAboveBack: last <= L.backY - 20, firstY: L.firstY, minPitch: L.minPitch };
}

export function optionsLayout(n, L = OPT_LAYOUT) {
  const extent = L.name + L.val + 2 * L.gap + L.hint; // drawn height of one row
  const floor = Math.max(L.minPitch != null ? L.minPitch : 0, extent + 1); // rows must not overlap
  const startRows = pitch => {
    const rows = [];
    let y = L.top;
    for (let i = 0; i < n; i++) {
      const nameY = y;
      const valY = nameY + L.val + L.gap;              // value clears the label
      const hintY = valY + L.hint + L.gap;             // hint clears the value
      rows.push({
        nameY, valY, hintY,
        boxY: nameY - L.name - L.boxPad, boxH: L.boxH,
        top: nameY - L.name, bottom: hintY,            // drawn extent, for overlap checks
      });
      y += pitch;
    }
    return rows;
  };
  const backFor = rows => (rows.length ? rows[rows.length - 1].hintY : L.top) + L.val + L.gap + L.boxPad;
  let pitch = L.maxPitch != null ? L.maxPitch : (L.pitch != null ? L.pitch : 66);
  let rows = startRows(pitch);
  let backY = backFor(rows);
  // Shrink the pitch until the Back button sits inside the panel; never overlap.
  while (pitch > floor && backY > L.backLimit) { pitch -= 1; rows = startRows(pitch); backY = backFor(rows); }
  return { rows, backY, backTop: backY - L.val, backBottom: backY, backBoxY: backY - L.val - L.boxPad, backBoxH: L.boxH, backBoxW: 310, pitch };
}

// P2 help strings are derived from coop.js so they cannot drift from the real codes.
function numLabel(code) {
  if (code === 'NumpadDecimal') return '.';
  if (code === 'NumpadAdd') return '+';
  const m = /^Numpad(.+)$/.exec(String(code || ''));
  return m ? m[1] : String(code || '?');
}
void P2_PAD; // pad-2 button indices are the standard mapping; labels below document them

const CONTROL_LINES = [
  'Move         A / D  or  Arrows   (press twice to dash)',
  'Walk lanes   W / S',
  'Jump         L          Dash  SHIFT / C  or double-tap',
  'Punch        J   (4-hit chain; number to finisher)',
  'Kick         K   (launcher, air juggle)',
  'Back attack  J + K while facing an enemy',
  'Special      J + L   costs a little HP',
  'Grab         walk into a stunned foe; J / K',
  'Throw pizza  SPACE   (aimed by facing)',
  'Taunt        T          Pause  P or Esc',
  'PAD  X punch  B kick  A jump  Y throw pizza',
  'PAD  LB back  RB special  LT/RT dash  START pause',
  `P2   NUMPAD ${numLabel(P2_KEYS.up)}/${numLabel(P2_KEYS.left)}/${numLabel(P2_KEYS.down)}/${numLabel(P2_KEYS.right)} move  ${numLabel(P2_KEYS.punch)} punch  ${numLabel(P2_KEYS.kick)} kick  ${numLabel(P2_KEYS.jump)} jump`,
  `P2   ${numLabel(P2_KEYS.dash)} dash  ${numLabel(P2_KEYS.throw)} throw  ${numLabel(P2_KEYS.taunt)} taunt  ${numLabel(P2_KEYS.start)} join`,
  'PAD 2  A jump  B kick  X punch  Y throw  START join',
  'PAD 2  LB back  RB special  LT/RT dash',
];

function boolDisplay(v) { return v ? 'ON' : 'OFF'; }
function rowDisplay(row) {
  if (row.display) return row.display();
  if (row.kind === 'bool') return boolDisplay(!!row.value());
  if (row.kind === 'number') return row.fmt ? row.fmt(Number(row.value())) : String(row.value());
  if (row.kind === 'enum') return String(row.value()).toUpperCase();
  if (row.kind === 'action') return 'Press Enter';
  return '';
}
function rowHint(row) {
  if (row.hintText) return row.hintText();
  if (row.note) return row.note;
  if (row.kind === 'bool') return 'Left/Right or Enter';
  if (row.kind === 'number') return 'Left/Right';
  if (row.kind === 'enum') return 'Left/Right or Enter';
  if (row.kind === 'action') return 'Enter';
  return '';
}

export function createPause(W, H, opts = {}) {
  const audio = opts.audio || null;
  const fx = opts.fx || null;
  const root = { open: false, menu: 'main', index: 0, notice: '' };
  const keys = {
    main: ['Resume', 'Controls', 'Options', 'Quit to Title'],
    controls: ['Back'],
  };
  const state = { ...opts.defaults };
  const PAGE_SIZE = 4;

  // --- options store bridge (guarded: OPTIONS/coop must never break the overlay) ---
  const optGet = key => { try { return OPTIONS.get(key); } catch (_) { return undefined; } };
  const optSet = (key, v) => { try { return OPTIONS.set(key, v); } catch (_) { return undefined; } };
  function optStored(key) {
    try {
      const raw = globalThis.localStorage && globalThis.localStorage.getItem('pp.options');
      if (!raw) return false;
      const obj = JSON.parse(raw);
      return !!obj && typeof obj === 'object' && obj[key] !== undefined;
    } catch (_) { return false; }
  }

  // Safe localStorage wrapper, because Orbit's sandbox can throw on access.
  function storage() { try { return localStorage; } catch (_) { return null; } }
  function loadOptions() {
    const ls = storage();
    if (!ls) return state;
    try { state.musicVolume = +(ls.getItem('pizzaPanicMusicVolume') || state.musicVolume); } catch (_) {}
    try { state.sfxVolume = +(ls.getItem('pizzaPanicSfxVolume') || state.sfxVolume); } catch (_) {}
    try { state.shakeEnabled = (ls.getItem('pizzaPanicScreenShake') ?? '1') !== '0'; } catch (_) {}
    return state;
  }
  function saveOptions() {
    const ls = storage();
    if (!ls) return;
    try { ls.setItem('pizzaPanicMusicVolume', String(state.musicVolume)); } catch (_) {}
    try { ls.setItem('pizzaPanicSfxVolume', String(state.sfxVolume)); } catch (_) {}
    try { ls.setItem('pizzaPanicScreenShake', state.shakeEnabled ? '1' : '0'); } catch (_) {}
  }
  if (!state.musicVolume && state.musicVolume !== 0) state.musicVolume = 0.82;
  if (!state.sfxVolume && state.sfxVolume !== 0) state.sfxVolume = 0.95;
  if (state.shakeEnabled === undefined) state.shakeEnabled = true;
  loadOptions();
  // Screen shake source of truth: an explicit OPTIONS value wins; otherwise the
  // legacy pizzaPanicScreenShake key, migrated into OPTIONS once; otherwise on.
  try {
    const ls = storage();
    const legacyShake = ls ? ls.getItem('pizzaPanicScreenShake') : null;
    if (!optStored('screenShake') && legacyShake === '0') optSet('screenShake', false);
    state.shakeEnabled = optGet('screenShake') !== false;
  } catch (_) { state.shakeEnabled = state.shakeEnabled !== false; }
  if (fx) fx.shakeEnabled = state.shakeEnabled;
  // OPTIONS owns the shake toggle; the legacy mirrors (state.shakeEnabled for the
  // menu, fx.shakeEnabled read by arcade/screens) must follow EVERY store change,
  // including reset(). Subscribe once so they can never go stale.
  try {
    OPTIONS.onChange((key, val) => {
      if (key !== 'screenShake') return;
      state.shakeEnabled = !!val;
      if (fx) fx.shakeEnabled = !!val;
      saveOptions();
    });
  } catch (_) { /* options store unavailable: leave the mirrors at their loaded value */ }
  if (audio) { try { audio.setVolume && audio.setVolume(state.sfxVolume); } catch (_) {} }

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  // --- descriptor-driven option rows -----------------------------------------
  const boolRow = (id, label, optKey, mirror) => ({
    id, label, kind: 'bool', optKey,
    value: () => !!optGet(optKey),
    set: v => { optSet(optKey, !!v); if (mirror) mirror(!!v); },
  });
  const numRow = (id, label, min, max, step, optKey, fmt) => ({
    id, label, kind: 'number', min, max, step, optKey, fmt,
    value: () => Number(optGet(optKey)),
    set: v => optSet(optKey, clamp(Number(v), min, max)),
  });
  const enumRow = (id, label, optKey, options, note) => ({
    id, label, kind: 'enum', optKey, options, note,
    value: () => optGet(optKey),
    set: v => optSet(optKey, v),
  });

  const rows = [
    { id: 'music', label: 'Music volume', kind: 'number', min: 0, max: 1, step: 0.1, fmt: v => `${Math.round(v * 100)}%`,
      value: () => state.musicVolume,
      set: v => { state.musicVolume = clamp(v, 0, 1); if (fx && 'musicVolume' in fx) fx.musicVolume = state.musicVolume; saveOptions(); } },
    { id: 'sfx', label: 'SFX volume', kind: 'number', min: 0, max: 1, step: 0.1, fmt: v => `${Math.round(v * 100)}%`,
      value: () => state.sfxVolume,
      set: v => { state.sfxVolume = clamp(v, 0, 1); if (audio && audio.setVolume) audio.setVolume(state.sfxVolume); saveOptions(); } },
    boolRow('screenShake', 'Screen shake', 'screenShake', v => { state.shakeEnabled = v; if (fx) fx.shakeEnabled = v; saveOptions(); }),
    boolRow('reducedFlash', 'Reduced flash', 'reducedFlash'),
    boolRow('reducedMotion', 'Reduced motion', 'reducedMotion'),
    numRow('subtitleScale', 'Subtitle size', 0.8, 1.6, 0.1, 'subtitleScale', v => `${v.toFixed(1)}x`),
    numRow('textSpeed', 'Text speed', 0.5, 2, 0.25, 'textSpeed', v => `${v.toFixed(2)}x`),
    boolRow('colourSafe', 'Colour-safe cues', 'colourSafe'),
    boolRow('holdToAdvance', 'Hold to advance', 'holdToAdvance'),
    numRow('padDeadzone', 'Pad deadzone', 0.1, 0.5, 0.05, 'padDeadzone', v => v.toFixed(2)),
    enumRow('padPreset', 'Pad preset', 'padPreset', ['classic', 'alternate'], 'alternate: P1 pad single-press dash'),
    { id: 'tutorial', label: 'Show tutorial again', kind: 'action', hint: 'Enter',
      activate: () => {
        // Accept the callback from opts (the documented contract) OR from a
        // property set on the returned pause object (game.js mirrors it there),
        // so either calling convention works.
        const hook = typeof opts.onTutorialReplay === 'function' ? opts.onTutorialReplay
          : (api && typeof api.onTutorialReplay === 'function' ? api.onTutorialReplay : null);
        if (!hook) { root.notice = 'Tutorial replay is unavailable here'; return; }
        root.notice = '';
        close(); // leave the menu safely before handing control to the runtime
        try { hook(); } catch (_) { root.notice = 'Tutorial replay failed'; }
      } },
  ];
  if (typeof opts.getDifficulty === 'function' && typeof opts.onDifficultyChange === 'function') {
    rows.push({
      id: 'difficulty', label: 'Difficulty', kind: 'enum', options: ['easy', 'normal', 'hard'], note: 'damage taken changes now',
      value: () => { try { return String(opts.getDifficulty() || 'normal'); } catch (_) { return 'normal'; } },
      set: v => { try { opts.onDifficultyChange(v); } catch (_) {} },
    });
  }
  if (typeof opts.getRoute === 'function' && typeof opts.onRouteChange === 'function') {
    const activeRoute = () => {
      try { return normalizeRoute((api && api.getActiveRoute || opts.getActiveRoute)?.()); } catch (_) { return 'classic'; }
    };
    const pendingRoute = () => {
      try { return normalizeRoute((api && api.getRoute || opts.getRoute)()); } catch (_) { return 'classic'; }
    };
    const routeContext = () => {
      try { return (api && api.getRouteContext || opts.getRouteContext)?.() === 'new' ? 'new' : 'stage'; } catch (_) { return 'stage'; }
    };
    rows.push({
      id: 'route', label: () => routeContext() === 'new' ? 'New run route' : 'Next stage route', kind: 'enum', options: ['classic', 'challenge'],
      note: 'applies at the next stage, not during this one',
      value: pendingRoute,
      display: () => routeContext() === 'new' ? `${pendingRoute().toUpperCase()} (SELECTED)` : `${pendingRoute().toUpperCase()} (${pendingRoute() === activeRoute() ? 'ACTIVE' : 'PENDING'})`,
      hintText: () => routeContext() === 'new' ? 'Selected route for the new run' : `Current: ${activeRoute().toUpperCase()}  |  applies next stage`,
      set: v => { try { (api && api.onRouteChange || opts.onRouteChange)(normalizeRoute(v)); } catch (_) {} },
    });
  }
  rows.push({ id: 'back', label: 'Back', kind: 'back' });

  function optionPages() { return Math.max(1, Math.ceil((rows.length - 1) / PAGE_SIZE)); }

  function open(menu = 'main') {
    root.open = true;
    root.menu = menu;
    root.index = 0;
    root.notice = '';
    try { audio && audio.play && audio.play('pause'); } catch (_) {}
  }
  function close() {
    root.open = false;
    root.menu = 'main';
    root.index = 0;
    saveOptions();
    try { audio && audio.play && audio.play('unpause'); } catch (_) {}
  }
  function toggle(menu) { return root.open ? (close(), false) : (open(menu), true); }
  function isOpen() { return root.open; }

  function stepNumber(row, dir) { row.set(Number(row.value()) + dir * row.step); }
  function cycleNumber(row) {
    let next = Number(row.value()) + row.step;
    if (next > row.max + 1e-9) next = row.min;
    row.set(next);
  }
  function cycleEnum(row, dir) {
    const list = row.options || [];
    if (!list.length) return;
    let i = list.indexOf(row.value());
    if (i < 0) i = 0;
    row.set(list[(i + dir + list.length) % list.length]);
  }
  function adjustRow(row, dir) {
    if (!row) return;
    if (row.kind === 'bool') row.set(dir < 0 ? false : true);
    else if (row.kind === 'number') stepNumber(row, dir);
    else if (row.kind === 'enum') cycleEnum(row, dir);
  }
  function activateRow(row, e) {
    if (!row) return;
    if (row.kind === 'bool') row.set(!row.value());
    else if (row.kind === 'number') cycleNumber(row);
    else if (row.kind === 'enum') cycleEnum(row, 1);
    else if (row.kind === 'action') row.activate(e);
    else if (row.kind === 'back') { root.menu = 'main'; root.index = 0; }
  }

  function activate(idx) {
    if (root.menu === 'main') {
      if (idx === 0) close();
      else if (idx === 1) { root.menu = 'controls'; root.index = 0; }
      else if (idx === 2) { root.menu = 'options'; root.index = 0; root.notice = ''; }
      else if (idx === 3) { root.pendingQuit = true; close(); }
    } else {
      root.menu = 'main';
      root.index = 0;
    }
  }

  function handleKey(e) {
    if (!root.open) return false;
    const code = e.code || '';
    if (root.menu === 'options') {
      const total = rows.length;
      if (code === 'ArrowUp' || code === 'KeyW') { root.index = (root.index - 1 + total) % total; root.notice = ''; return true; }
      if (code === 'ArrowDown' || code === 'KeyS') { root.index = (root.index + 1) % total; root.notice = ''; return true; }
      if (code === 'ArrowLeft' || code === 'KeyA') { adjustRow(rows[root.index], -1); return true; }
      if (code === 'ArrowRight' || code === 'KeyD') { adjustRow(rows[root.index], 1); return true; }
      if (code === 'Enter' || code === 'Space') { e.preventDefault && e.preventDefault(); activateRow(rows[root.index], e); return true; }
      if (code === 'Escape' || code === 'KeyP') { root.menu = 'main'; root.index = 0; return true; }
      return true;
    }
    const len = keys[root.menu] ? keys[root.menu].length : 1;
    if (code === 'ArrowUp' || code === 'KeyW') { root.index = (root.index - 1 + len) % len; root.notice = ''; return true; }
    if (code === 'ArrowDown' || code === 'KeyS') { root.index = (root.index + 1) % len; root.notice = ''; return true; }
    if (code === 'ArrowLeft' || code === 'KeyA' || code === 'ArrowRight' || code === 'KeyD') return true;
    if (code === 'Enter' || code === 'Space') { e.preventDefault && e.preventDefault(); activate(root.index); return true; }
    if (code === 'Escape' || code === 'KeyP') { root.menu === 'main' ? close() : (root.menu = 'main', root.index = 0); return true; }
    e.preventDefault && e.preventDefault();
    return true;
  }

  function drawBox(ctx, x, y, w, h, col) {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.82)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#ffe86b';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.restore();
  }

  function drawMain(ctx) {
    keys.main.forEach((name, i) => {
      const y = 150 + i * 62;
      ctx.fillStyle = i === root.index ? '#ffffff' : '#9fb8a5';
      ctx.font = (i === root.index ? 'bold ' : '') + '22px monospace';
      ctx.fillText(name, W / 2, y);
      if (i === root.index) { ctx.strokeStyle = '#ffe86b'; ctx.lineWidth = 2; ctx.strokeRect(W / 2 - 145, y - 30, 290, 42); }
    });
    ctx.fillStyle = '#708878';
    ctx.font = '11px monospace';
    ctx.fillText('Arrow keys to choose, Enter to select, Esc to resume', W / 2, 396);
  }

  function drawControls(ctx) {
    ctx.fillStyle = '#e8f2ea';
    ctx.textAlign = 'left';
    ctx.font = '11px monospace';
    const cl = controlsLayout(CONTROL_LINES.length);
    // Inset the block inside the drawn panel (the panel is 460 wide, centred) so
    // no control line can spill outside the frame.
    const tx = (W - 460) / 2 + 14;
    CONTROL_LINES.forEach((s, i) => ctx.fillText(s, tx, cl.lineY(i)));
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffe86b';
    ctx.font = 'bold 18px monospace';
    ctx.fillText('[   BACK   ]', W / 2, 404);
  }

  function drawOptions(ctx) {
    const total = rows.length;
    const pages = optionPages();
    let page = Math.floor(root.index / PAGE_SIZE);
    if (page >= pages) page = pages - 1;
    if (page < 0) page = 0;
    const start = page * PAGE_SIZE;
    const pageRows = rows.slice(start, start + PAGE_SIZE).filter(r => r.kind !== 'back');
    const boxes = optionsLayout(Math.max(1, pageRows.length));
    pageRows.forEach((row, i) => {
      const b = boxes.rows[i];
      const sel = (start + i) === root.index;
      ctx.fillStyle = sel ? '#ffffff' : '#9fb8a5';
      ctx.font = (sel ? 'bold ' : '') + '18px monospace';
      ctx.fillText(typeof row.label === 'function' ? row.label() : row.label, W / 2, b.nameY);
      ctx.fillStyle = '#ffe86b';
      ctx.font = 'bold 16px monospace';
      ctx.fillText(rowDisplay(row), W / 2, b.valY);
      ctx.fillStyle = '#6b7f73';
      ctx.font = '9px monospace';
      ctx.fillText(rowHint(row), W / 2, b.hintY);
      if (sel) { ctx.strokeStyle = '#ffe86b'; ctx.lineWidth = 2; ctx.strokeRect(W / 2 - 155, b.boxY, 310, b.boxH); }
    });
    if (pages > 1) {
      ctx.textAlign = 'right';
      ctx.fillStyle = '#6b7f73';
      ctx.font = '12px monospace';
      ctx.fillText(`${page + 1}/${pages}`, (W + 460) / 2 - 14, 92);
      ctx.textAlign = 'center';
    }
    const onBack = root.index === total - 1;
    ctx.fillStyle = onBack ? '#ffffff' : '#9fb8a5';
    ctx.font = (onBack ? 'bold ' : '') + '18px monospace';
    ctx.fillText('Back', W / 2, boxes.backY);
    if (onBack) { ctx.strokeStyle = '#ffe86b'; ctx.lineWidth = 2; ctx.strokeRect(W / 2 - 155, boxes.backBoxY, 310, boxes.backBoxH); }
    if (root.notice) {
      ctx.fillStyle = '#ffb27a';
      ctx.font = '11px monospace';
      ctx.fillText(root.notice, W / 2, 116);
    }
  }

  // Caller may pass the game state if it wants more text; keep the contract simple.
  function draw(ctx) {
    if (!ctx || !root.open) return;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(0,0,0,0.62)';
    ctx.fillRect(0, 0, W, H);
    const ix = (W - 460) / 2;
    const iy = 52;
    drawBox(ctx, ix, iy, 460, 386, '#ffe86b');
    ctx.fillStyle = '#ffe86b';
    ctx.font = 'bold 34px monospace';
    ctx.fillText(root.menu === 'main' ? 'PAUSED' : root.menu === 'controls' ? 'CONTROLS' : 'OPTIONS', W / 2, 92);
    if (root.menu === 'main') drawMain(ctx);
    else if (root.menu === 'controls') drawControls(ctx);
    else drawOptions(ctx);
    ctx.restore();
  }

  const api = {
    open, close, toggle, isOpen, handleKey, draw, state,
    save: saveOptions, load: loadOptions,
    pendingQuit() { return root.pendingQuit; }, clearQuit() { root.pendingQuit = false; },
    menu() { return root.menu; }, optionsLayout, controlsLayout,
    optionRows: () => rows.map(r => ({ id: r.id, label: typeof r.label === 'function' ? r.label() : r.label, kind: r.kind, note: r.note })),
    optionPages, controlsLines: () => CONTROL_LINES,
    index: () => root.index, notice: () => root.notice,
  };
  // Mirror the runtime contract hooks onto the object too (a caller may set these
  // after construction instead of passing them in opts).
  api.onTutorialReplay = opts.onTutorialReplay;
  api.getDifficulty = opts.getDifficulty;
  api.onDifficultyChange = opts.onDifficultyChange;
  api.getRoute = opts.getRoute;
  api.getRouteContext = opts.getRouteContext;
  api.getActiveRoute = opts.getActiveRoute;
  api.onRouteChange = opts.onRouteChange;
  return api;
}
