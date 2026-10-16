import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createPause, optionsLayout } from '../pause.js';
import { createMoveList } from '../move-list.js';
import { createGamepad, readPads, DEADZONE } from '../gamepad.js';
import { OPTIONS } from '../options-live.js';

// --- move-list: the old, wrong throw key must be gone; a Space hint must exist ---
{
  const src = readFileSync(new URL('../move-list.js', import.meta.url), 'utf8');
  assert.ok(!src.includes('I throw pizza'), 'move-list source must not advertise I throw pizza');

  const texts = [];
  const noop = () => {};
  const ctx = new Proxy({ fillText: s => texts.push(String(s)), measureText: () => ({ width: 0 }) }, {
    get: (t, p) => (p in t ? t[p] : noop),
  });
  const ml = createMoveList();
  ml.toggle('turtle_purple');
  ml.draw(ctx, 740, 510, 'turtle_purple');
  assert.ok(texts.some(t => /\bSpace\b/.test(t) && /throw/i.test(t)), 'a "Space throw" hint is drawn');
  assert.ok(texts.some(t => /^PAD\b/.test(t) && /throw/i.test(t)), 'pad throw equivalent is drawn');
  assert.ok(!texts.some(t => /I throw pizza/.test(t)), 'no drawn text says I throw pizza');
}

// --- pause helpers ------------------------------------------------------------
const audio = { play() {}, setVolume() {} };
function makePause(extra = {}) {
  return createPause(740, 510, Object.assign({ audio, fx: { shakeEnabled: true }, defaults: { musicVolume: 0.82, sfxVolume: 0.95, shakeEnabled: true } }, extra));
}
function gotoRow(p, id) {
  p.open('options');
  const idx = p.optionRows().findIndex(r => r.id === id);
  assert.ok(idx >= 0, `row ${id} exists`);
  for (let i = 0; i < idx; i++) p.handleKey({ code: 'ArrowDown' });
  assert.equal(p.index(), idx, `cursor reached ${id}`);
  return idx;
}

// --- descriptor list: the full set of required rows ---------------------------
{
  const p = makePause();
  const ids = p.optionRows().map(r => r.id);
  for (const id of ['reducedFlash', 'reducedMotion', 'subtitleScale', 'textSpeed', 'colourSafe', 'holdToAdvance',
    'screenShake', 'padDeadzone', 'padPreset', 'back']) {
    assert.ok(ids.includes(id), `optionRows includes ${id}`);
  }
  assert.ok(ids.some(id => /tutorial|replay/i.test(id)), 'a tutorial/replay row exists');
  assert.ok(!ids.includes('difficulty'), 'no difficulty row without callbacks');
  const kinds = new Map(p.optionRows().map(r => [r.id, r.kind]));
  assert.equal(kinds.get('colourSafe'), 'bool');
  assert.equal(kinds.get('subtitleScale'), 'number');
  assert.equal(kinds.get('padPreset'), 'enum');
  assert.equal(kinds.get('back'), 'back');
  assert.ok(p.optionPages() >= 1, 'at least one page');

  const p2 = makePause({ getDifficulty: () => 'normal', onDifficultyChange: () => {} });
  assert.ok(p2.optionRows().map(r => r.id).includes('difficulty'), 'difficulty row appears with callbacks');
  assert.ok(p2.optionPages() >= p.optionPages(), 'difficulty adds an extra row');
  const dnote = p2.optionRows().find(r => r.id === 'difficulty').note || '';
  assert.ok(/change/i.test(dnote) && !/new enem/i.test(dnote), `difficulty note is truthful (got "${dnote}")`);
  const padNote = p.optionRows().find(r => r.id === 'padPreset').note || '';
  assert.ok(/P1/i.test(padNote), `pad preset note scopes alternate to the P1 pad (got "${padNote}")`);
}

// --- optionsLayout: no overlaps, Back below the last hint and inside the panel --
{
  for (let n = 1; n <= 4; n++) {
    const L = optionsLayout(n);
    for (let i = 0; i + 1 < L.rows.length; i++) {
      assert.ok(L.rows[i].bottom < L.rows[i + 1].top, `rows do not overlap (n=${n}, i=${i})`);
    }
    const last = L.rows[L.rows.length - 1];
    assert.ok(L.backY > last.hintY, `Back is below the last hint (n=${n})`);
    assert.ok(L.backY <= 430, `Back baseline <= 430 (n=${n})`);
    assert.ok(L.backBoxY + L.backBoxH <= 438, `Back box stays inside the panel (n=${n})`);
    assert.ok(L.pitch >= 50, `pitch is not absurdly small (n=${n})`);
  }
}

// --- keyboard navigation across pages, wrap, and Esc main->close --------------
{
  const p = makePause();
  p.open('options');
  const total = p.optionRows().length;
  for (let i = 0; i < total; i++) {
    assert.equal(p.index(), i, `down walks row ${i}`);
    p.handleKey({ code: 'ArrowDown' });
  }
  assert.equal(p.index(), 0, 'ArrowDown wraps back to the first row');
  p.handleKey({ code: 'ArrowUp' });
  assert.equal(p.index(), total - 1, 'ArrowUp wraps to the last row (Back)');
  assert.equal(p.menu(), 'options');
  p.handleKey({ code: 'Escape' });
  assert.equal(p.menu(), 'main', 'Esc from options returns to main');
  assert.ok(p.isOpen(), 'menu is still open on main');
  p.handleKey({ code: 'Escape' });
  assert.equal(p.isOpen(), false, 'Esc from main closes');
}

// --- tutorial replay closes first and fires exactly once ----------------------
{
  let fired = 0;
  const p = makePause({ onTutorialReplay: () => { fired++; } });
  gotoRow(p, 'tutorial');
  p.handleKey({ code: 'Enter' });
  assert.equal(fired, 1, 'onTutorialReplay fired exactly once');
  assert.equal(p.isOpen(), false, 'menu closed before replay');

  const p2 = makePause();
  gotoRow(p2, 'tutorial');
  p2.handleKey({ code: 'Enter' });
  assert.ok(p2.notice().length > 0, 'a visible notice explains the missing replay hook');
}

// --- difficulty changes in place through the callbacks ------------------------
{
  let diff = 'normal';
  const calls = [];
  const p = makePause({ getDifficulty: () => diff, onDifficultyChange: v => { diff = v; calls.push(v); } });
  gotoRow(p, 'difficulty');
  p.handleKey({ code: 'ArrowRight' });
  p.handleKey({ code: 'Enter' });
  assert.deepEqual(calls, ['hard', 'easy'], 'ArrowRight then Enter steps normal->hard->easy');
  for (const v of calls) assert.ok(['easy', 'normal', 'hard'].includes(v), `valid difficulty ${v}`);
  assert.ok(p.isOpen(), 'difficulty does not close the menu');
}

// --- shake mirror follows the OPTIONS store, including reset() ----------------
{
  const fx = { shakeEnabled: true, musicVolume: 0 };
  const p = createPause(740, 510, { audio, fx, defaults: { musicVolume: 0.82, sfxVolume: 0.95, shakeEnabled: true } });
  assert.equal(fx.shakeEnabled, true, 'mirror starts in sync');
  OPTIONS.set('screenShake', false);
  assert.equal(fx.shakeEnabled, false, 'mirror follows OPTIONS.set');
  assert.equal(p.state.shakeEnabled, false, 'menu state follows OPTIONS.set');
  OPTIONS.set('screenShake', true);
  assert.equal(fx.shakeEnabled, true, 'mirror follows OPTIONS.set back');
  OPTIONS.set('screenShake', false);
  OPTIONS.reset();
  assert.equal(fx.shakeEnabled, true, 'mirror follows OPTIONS.reset (no stale flag)');
  assert.equal(p.state.shakeEnabled, true, 'menu state follows OPTIONS.reset');
}

// --- controls screen: accurate hints, fits above Back -------------------------
{
  const p = makePause();
  const lines = p.controlsLines();
  assert.ok(Array.isArray(lines) && lines.length > 0);
  assert.ok(lines.some(l => /SPACE\b/.test(l) && /pizza/i.test(l)), 'throw is documented as SPACE');
  assert.ok(!lines.some(l => /\bI\b.*throw pizza/.test(l)), 'no bogus I throw hint');
  assert.ok(lines.some(l => /NUMPAD/.test(l)), 'P2 numpad help present');
  assert.ok(lines.some(l => /PAD 2/.test(l)), 'P2 pad help present');
  assert.ok(!lines.some(l => /alternate/i.test(l)), 'control help does not promise the alternate preset for P2');
  const cl = p.controlsLayout(lines.length);
  assert.equal(cl.fitsAboveBack, true, 'controls fit above the Back button');
}

// --- gamepad: deadzone + default Space-on-Y + alternate dash -------------------
{
  const zeroed = readPads([{ connected: true, buttons: [], axes: [0.3, 0] }], 0.5);
  assert.equal(zeroed.dirs.right, false, '0.3 stick is inside a 0.5 deadzone');
  assert.equal(zeroed.dirs.left, false);

  const kept = readPads([{ connected: true, buttons: [], axes: [0.8, 0] }], DEADZONE);
  assert.equal(kept.dirs.right, true, '0.8 stick passes the default deadzone');
  assert.equal(kept.count, 1);

  function makePad(buttons) {
    const pad = { connected: true, buttons: new Array(16).fill(false), axes: [0, 0] };
    for (const b of buttons) pad.buttons[b] = true;
    return pad;
  }
  function pollOnce(pad, opts = {}) {
    const log = [];
    const gp = createGamepad({ getPads: () => [pad], emit: (t, c) => log.push(t + ':' + c), facing: () => 1, ...opts });
    gp.poll(1 / 60, 'play');
    return { gp, log };
  }

  // default preset: Y (index 3) is the held pizza throw
  OPTIONS.set('padPreset', 'classic');
  {
    const { log } = pollOnce(makePad([3]));
    assert.ok(log.includes('keydown:Space'), 'Y emits Space in the default preset');
  }

  // alternate preset: a single LT edge emits exactly one dash pair
  OPTIONS.set('padPreset', 'alternate');
  {
    const { log } = pollOnce(makePad([6])); // LT
    const downs = log.filter(e => e.startsWith('keydown:'));
    const ups = log.filter(e => e.startsWith('keyup:'));
    assert.equal(log.length, 2, 'exactly one dash pair is emitted');
    assert.equal(downs.length, 1, 'one keydown');
    assert.equal(ups.length, 1, 'one keyup');
    assert.match(downs[0], /^keydown:(ShiftLeft|ShiftRight|KeyC)$/, 'the pair is a single-press dash key');
  }
  OPTIONS.set('padPreset', 'classic');

  // blur must not leave a held pad key latched
  {
    const { gp } = pollOnce(makePad([3]));
    assert.deepEqual(gp.held, ['Space'], 'Y holds Space while pressed');
    gp.reset();
    assert.deepEqual(gp.held, [], 'reset releases held keys');
  }
}

console.log('check-qol-input: OK');
