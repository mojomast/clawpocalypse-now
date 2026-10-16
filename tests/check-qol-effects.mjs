// tests/check-qol-effects.mjs — Node-only checks for the accessibility/QoL
// effects pass. No DOM: a tiny recording 2D context stands in for canvas.
//
// Covers: effects-safe gates, fx flash + FIFO particle/pop budgets, impacts FIFO
// budget, off-screen indicator de-overlap + colour-safe glyphs, HUD font scale +
// footer backplate, coop continue countdown, and the boss / breach flash paths.
import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// tiny recording 2D context
// ---------------------------------------------------------------------------
function makeCtx() {
  const calls = [];
  const s = {};
  const rec = (name, args) => calls.push({
    name, args,
    fillStyle: s.fillStyle, strokeStyle: s.strokeStyle, globalAlpha: s.globalAlpha,
    font: s.font, lineWidth: s.lineWidth, textAlign: s.textAlign,
    textBaseline: s.textBaseline, filter: s.filter,
  });
  const noop = () => {};
  const ctx = {
    calls, canvas: { width: 740, height: 480 },
    save: noop, restore: noop, beginPath: noop, closePath: noop, clip: noop,
    fill: () => rec('fill', []), stroke: () => rec('stroke', []),
    fillRect: (...a) => rec('fillRect', a), strokeRect: (...a) => rec('strokeRect', a), clearRect: noop,
    moveTo: (...a) => rec('moveTo', a), lineTo: (...a) => rec('lineTo', a),
    arc: (...a) => rec('arc', a), arcTo: (...a) => rec('arcTo', a), ellipse: (...a) => rec('ellipse', a),
    fillText: (...a) => rec('fillText', a), strokeText: (...a) => rec('strokeText', a),
    translate: (...a) => rec('translate', a), rotate: noop, scale: noop,
    setTransform: noop, resetTransform: noop, setLineDash: noop,
    createLinearGradient: () => ({ addColorStop: noop }),
    createRadialGradient: () => ({ addColorStop: noop }),
    createPattern: () => null,
    getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
    measureText: (t) => {
      // Approximate monospace advance (0.6 * px) from the *current* font so a
      // layout test can measure real text boxes.
      const m = /(\d+(?:\.\d+)?)px/.exec(String(s.font || ''));
      const px = m ? Number(m[1]) : 10;
      return { width: px * 0.6 * String(t == null ? '' : t).length };
    },
    drawImage: (...a) => rec('drawImage', a),
  };
  for (const p of ['fillStyle', 'strokeStyle', 'globalAlpha', 'font', 'lineWidth', 'textAlign',
    'textBaseline', 'filter', 'lineCap', 'lineJoin', 'shadowBlur', 'shadowColor', 'miterLimit']) {
    Object.defineProperty(ctx, p, { get: () => s[p], set: v => { s[p] = v; }, enumerable: true, configurable: true });
  }
  return ctx;
}
const alphaOf = style => {
  const m = /rgba\([^)]*,\s*([\d.]+)\s*\)/.exec(String(style || ''));
  return m ? Number(m[1]) : NaN;
};
const pxOf = font => {
  const m = /(\d+)px/.exec(String(font || ''));
  return m ? parseInt(m[1], 10) : NaN;
};

function makeNinja(extra = {}) {
  return { kind: 'brawler', dead: false, r: 14, x: 100, y: 400, z: 0, hp: 3, maxHp: 3, ...extra };
}
function synthState(over = {}) {
  return {
    player: { x: 100, y: 400, r: 16, z: 0 },
    pizzas: [], powerups: [], lives: 3, wave: 1, score: 0, combo: 0,
    ninjas: [], over: false, ...over,
  };
}
// Temporarily override a getter on the shared OPTIONS api, then restore it.
function withOptionOverride(obj, key, getter, fn) {
  const desc = Object.getOwnPropertyDescriptor(obj, key);
  Object.defineProperty(obj, key, { configurable: true, get: getter });
  try { return fn(); } finally {
    if (desc) Object.defineProperty(obj, key, desc); else delete obj[key];
  }
}

const { OPTIONS } = await import('../options-live.js');
const safe = await import('../effects-safe.js');

try {
  // =========================================================================
  // effects-safe
  // =========================================================================
  assert.equal(safe.FLASH_FACTOR, 0.25, 'FLASH_FACTOR is 0.25');
  OPTIONS.set('reducedFlash', false);
  assert.equal(safe.reducedFlash(), false);
  assert.equal(safe.flashAlpha(0.4), 0.4, 'flashAlpha unchanged when reducedFlash is off (no normal cap)');
  OPTIONS.set('reducedFlash', true);
  assert.equal(safe.reducedFlash(), true);
  assert.ok(Math.abs(safe.flashAlpha(0.4) - 0.1) < 1e-9, 'flashAlpha damped to 0.1 when reducedFlash is on');
  assert.equal(safe.flashAlpha(0.4, 0.5), 0.2, 'custom factor honoured');
  OPTIONS.set('reducedFlash', false);

  // shakeEnabled: independent need, defaults true, falls back on a missing getter.
  assert.equal(safe.shakeEnabled(), true, 'shakeEnabled defaults true');
  withOptionOverride(OPTIONS, 'shakeEnabled', () => false, () => assert.equal(safe.shakeEnabled(), false));
  withOptionOverride(OPTIONS, 'shakeEnabled', () => { throw new Error('boom'); }, () => assert.equal(safe.shakeEnabled(), true, 'missing/throwing getter falls back to true'));
  if ('screenShake' in OPTIONS) assert.equal(safe.shakeEnabled(), !!OPTIONS.screenShake, 'matches OPTIONS.screenShake');
  if ('shakeEnabled' in OPTIONS) assert.equal(safe.shakeEnabled(), OPTIONS.shakeEnabled !== false, 'matches OPTIONS.shakeEnabled');

  // shakeScale matches OPTIONS.shakeScale, with a safe fallback.
  withOptionOverride(OPTIONS, 'shakeScale', () => 0.5, () => assert.equal(safe.shakeScale(), 0.5));
  withOptionOverride(OPTIONS, 'shakeScale', () => { throw new Error('boom'); }, () => assert.equal(safe.shakeScale(), 1));
  assert.equal(safe.shakeScale(), OPTIONS.shakeScale, 'matches OPTIONS.shakeScale');
  // Independent master motion policy suppresses shake without touching flash.
  OPTIONS.set('reducedFlash', false); OPTIONS.set('reducedMotion', true);
  assert.equal(safe.shakeScale(), 0, 'reducedMotion suppresses shake');
  assert.equal(safe.reducedFlash(), false, 'reducedMotion does not flip reducedFlash');
  OPTIONS.set('reducedMotion', false); OPTIONS.set('reducedFlash', true);
  assert.ok(Math.abs(safe.shakeScale() - 0.33) < 1e-9, 'reducedFlash alone still damps shake');
  OPTIONS.set('reducedFlash', false);

  OPTIONS.set('reducedMotion', true);
  assert.equal(safe.reducedMotion(), true);
  OPTIONS.set('reducedMotion', false);
  assert.equal(safe.reducedMotion(), false);
  OPTIONS.set('colourSafe', true);
  assert.equal(safe.colourSafe(), true);
  OPTIONS.set('colourSafe', false);
  assert.equal(safe.colourSafe(), false);
  console.log('effects-safe: flashAlpha/shakeEnabled/shakeScale/reducedMotion/colourSafe gates OK.');

  // =========================================================================
  // fx.js
  // =========================================================================
  const { createFX } = await import('../fx.js');
  const fx = createFX(); fx.setImages({});
  const W = 740, H = 480;

  // life-loss flash: default ~0.32, reduced <= 0.32*0.25.
  OPTIONS.set('reducedFlash', false);
  fx.reset();
  fx.step(synthState({ lives: 3 }), 0);
  fx.step(synthState({ lives: 2 }), 0);
  let fctx = makeCtx();
  fx.end(fctx, W, H);
  const red0 = fctx.calls.filter(c => c.name === 'fillRect' && String(c.fillStyle).startsWith('rgba(255,0,0'));
  assert.equal(red0.length, 1, 'one full-screen life-loss fill');
  assert.ok(Math.abs(alphaOf(red0[0].fillStyle) - 0.32) < 1e-6,
    `default life-loss alpha stays 0.32 (got ${alphaOf(red0[0].fillStyle)})`);

  OPTIONS.set('reducedFlash', true);
  fx.reset();
  fx.step(synthState({ lives: 3 }), 0);
  fx.step(synthState({ lives: 2 }), 0);
  fctx = makeCtx();
  fx.end(fctx, W, H);
  const red1 = fctx.calls.filter(c => c.name === 'fillRect' && String(c.fillStyle).startsWith('rgba(255,0,0'));
  assert.ok(alphaOf(red1[0].fillStyle) <= 0.32 * 0.25 + 1e-9,
    `reduced life-loss alpha damped (got ${alphaOf(red1[0].fillStyle)})`);
  OPTIONS.set('reducedFlash', false);

  // particle budget: oldest evicted, newest (highest x) retained.
  fx.reset();
  const N = 20;
  const alive = Array.from({ length: N }, (_, i) => makeNinja({ x: 100 + i * 4, hp: 3 }));
  fx.step(synthState({ ninjas: alive }), 0);
  fx.step(synthState({ ninjas: [] }), 0);
  assert.ok(fx.parts.length <= 160, `fx.parts capped at 160 (got ${fx.parts.length})`);
  const maxX = 100 + (N - 1) * 4;
  assert.ok(fx.parts.some(q => Math.abs(q.x - maxX) < 1e-6), 'newest death particles retained (FIFO keeps newest)');
  assert.ok(!fx.parts.some(q => Math.abs(q.x - 100) < 1e-6), 'oldest death particles evicted');

  // newest contact cue (hit star) survives as the last part pushed.
  fx.reset(); fx.hold = 0;
  const hitNinja = makeNinja({ x: 300, hp: 3 });
  fx.step(synthState({ ninjas: [hitNinja] }), 0);
  hitNinja.hp = 2;
  fx.step(synthState({ ninjas: [hitNinja] }), 0);
  assert.equal(fx.parts.length, 1, 'one contact star pushed');
  assert.equal(fx.parts[fx.parts.length - 1].star, 1, 'newest contact star is retained as the last particle');

  // pops budget: driving 60 score pop-ups must cap at 40 (FIFO keeps newest).
  fx.reset(); fx.hold = 0;
  let score = 0;
  fx.step(synthState({ score: 0 }), 0);
  for (let i = 0; i < 60; i++) { score += 10; fx.step(synthState({ score }), 0); }
  assert.ok(fx.pops.length <= 40, `fx.pops capped at 40 (got ${fx.pops.length})`);
  console.log('fx: life-loss flash gating, particle FIFO cap (160), pop cap (40) and newest-cue retention OK.');

  // =========================================================================
  // impacts.js
  // =========================================================================
  const realImage = globalThis.Image;
  globalThis.Image = class FakeImage {
    constructor() { this.complete = true; this.naturalWidth = 1; this.width = 52; this.height = 56; }
    set src(v) { this._src = v; if (typeof this.onload === 'function') this.onload(); }
    get src() { return this._src; }
  };
  try {
    const { createImpacts, IMPACT_CAP } = await import('../impacts.js');
    assert.equal(IMPACT_CAP, 24, 'IMPACT_CAP is 24');
    const imp = createImpacts();
    for (let i = 0; i < 30; i++) imp.spawn('spark', i, 400);
    assert.ok(imp.stats().total >= 30, 'spawn counts every call');
    imp.spawn('dust', 999, 400);
    const st = imp.stats();
    assert.ok(st.live <= IMPACT_CAP, `live impacts capped (got ${st.live})`);
    assert.equal(st.live, IMPACT_CAP, 'live impacts pinned at the cap');
    assert.ok(st.total >= 31, 'stats total keeps growing');
    const ictx = makeCtx();
    imp.draw(ictx);
    const tx = ictx.calls.filter(c => c.name === 'translate').map(c => c.args[0]);
    assert.ok(Math.abs(tx[tx.length - 1] - 999) < 1e-9, 'newest impact is still drawn (drawn last)');
    console.log('impacts: FIFO cap (24) with newest call preserved, stats intact OK.');
  } finally {
    if (realImage === undefined) delete globalThis.Image; else globalThis.Image = realImage;
  }

  // =========================================================================
  // offscreen.js
  // =========================================================================
  const { drawOffscreenIndicators } = await import('../offscreen.js');
  const enemies = [
    { kind: 'boss', x: -100, y: 300, dead: false },
    { kind: 'clawninja', ext: true, x: -100, y: 310, dead: false },
    { kind: 'brawler', x: -100, y: 320, dead: false },
  ];
  // Default (colourSafe off): placement must be byte-identical to the pre-QoL
  // build — no de-overlap banding and no category glyphs.
  OPTIONS.set('colourSafe', false);
  let octx = makeCtx();
  const drawn = drawOffscreenIndicators(octx, { ninjas: enemies }, W, H, 0);
  assert.equal(drawn, 3, 'returns the number drawn');
  const ysDefault = octx.calls.filter(c => c.name === 'ellipse').map(c => c.args[1]).sort((a, b) => a - b);
  assert.deepEqual(ysDefault, [300, 310, 320], 'default placement unchanged when colourSafe is off');
  const defaultTexts = octx.calls.filter(c => c.name === 'fillText').map(c => c.args[0]);
  assert.ok(!defaultTexts.includes('B') && !defaultTexts.includes('X'), 'default path adds no category glyph');

  // Colour-safe on: de-overlap bands + per-category glyphs.
  OPTIONS.set('colourSafe', true);
  octx = makeCtx();
  drawOffscreenIndicators(octx, { ninjas: enemies }, W, H, 0);
  const ys = octx.calls.filter(c => c.name === 'ellipse').map(c => c.args[1]).sort((a, b) => a - b);
  assert.equal(ys.length, 3, 'one indicator per off-screen enemy');
  for (let i = 1; i < ys.length; i++) {
    assert.ok(ys[i] - ys[i - 1] >= 40, `indicators de-overlapped into bands (got ${JSON.stringify(ys)})`);
  }
  assert.ok(ys[0] >= 56 && ys[ys.length - 1] <= H - 56, 'indicators stay inside [56, H-56]');
  const csTexts = octx.calls.filter(c => c.name === 'fillText').map(c => c.args[0]);
  const csStrokes = octx.calls.filter(c => c.name === 'stroke');
  assert.ok(csTexts.includes('B'), 'colour-safe boss glyph drawn');
  assert.ok(csTexts.includes('X'), 'colour-safe ext glyph drawn');
  assert.ok(csStrokes.length >= 1, 'colour-safe base shape drawn');

  // Dense bottom edge: all three at H-56 must be fitted upward (not collapsed
  // onto one row by a forward/backward pass followed by a clamp).
  const bottom = [
    { kind: 'boss', x: -100, y: H - 56, dead: false },
    { kind: 'clawninja', ext: true, x: -100, y: H - 56, dead: false },
    { kind: 'brawler', x: -100, y: H - 56, dead: false },
  ];
  octx = makeCtx();
  drawOffscreenIndicators(octx, { ninjas: bottom }, W, H, 0);
  const bY = octx.calls.filter(c => c.name === 'ellipse').map(c => c.args[1]).sort((a, b) => a - b);
  assert.equal(new Set(bY).size, 3, 'bottom-edge stack is spread, not collapsed to one row');
  for (let i = 1; i < bY.length; i++) assert.ok(bY[i] - bY[i - 1] >= 40, 'bottom stack is spaced');
  assert.ok(bY[0] >= 56 && bY[bY.length - 1] <= H - 56, 'bottom stack stays inside [56, H-56]');
  assert.ok(octx.calls.filter(c => c.name === 'fillText').map(c => c.args[2]).every(y => y <= H), 'bottom labels stay inside the canvas');

  // Dense top edge must also spread downward, inside bounds.
  const top = [
    { kind: 'boss', x: -100, y: 56, dead: false },
    { kind: 'clawninja', ext: true, x: -100, y: 56, dead: false },
    { kind: 'brawler', x: -100, y: 56, dead: false },
  ];
  octx = makeCtx();
  drawOffscreenIndicators(octx, { ninjas: top }, W, H, 0);
  const tY = octx.calls.filter(c => c.name === 'ellipse').map(c => c.args[1]).sort((a, b) => a - b);
  assert.equal(new Set(tY).size, 3, 'top-edge stack is spread');
  assert.ok(tY[0] >= 56 && tY[tY.length - 1] <= H - 56, 'top stack stays inside [56, H-56]');

  // More enemies than slots on one side => bounded count of indicators, one +N group.
  const many = [];
  for (let i = 0; i < 14; i++) many.push({ kind: i === 0 ? 'boss' : 'brawler', ext: i % 3 === 0, x: -100, y: 56 + i * 30, dead: false });
  octx = makeCtx();
  drawOffscreenIndicators(octx, { ninjas: many }, W, H, 0);
  const mEll = octx.calls.filter(c => c.name === 'ellipse');
  assert.ok(mEll.length <= 12, `indicator count is bounded (got ${mEll.length})`);
  const groupText = octx.calls.filter(c => c.name === 'fillText').map(c => String(c.args[0])).find(t => /^\+\d+$/.test(t));
  assert.ok(groupText, 'overflow renders a +N group badge');
  assert.ok(mEll.map(c => c.args[1]).every(y => y >= 56 && y <= H - 56), 'group and badges stay inside bounds');
  assert.ok(octx.calls.filter(c => c.name === 'fillText').map(c => c.args[2]).every(y => y <= H), 'group labels stay inside the canvas');

  OPTIONS.set('colourSafe', false);
  console.log('offscreen: default unchanged; colour-safe fit/spread/overflow + glyphs OK.');

  // =========================================================================
  // hud.js
  // =========================================================================
  const hud = (await import('../hud.js')).createHud();
  OPTIONS.set('subtitleScale', 1);
  let hctx = makeCtx();
  hud.controls(hctx, W, H, { chain: 1, airborne: false });
  const ctrlSizes = hctx.calls.filter(c => c.name === 'fillText').map(c => pxOf(c.font));
  assert.ok(ctrlSizes.length >= 2, 'controls draws its labels');
  assert.ok(ctrlSizes.every(s => s >= 9), `all footer text now >=9px (got ${JSON.stringify(ctrlSizes)})`);
  const plate = hctx.calls.filter(c => (c.name === 'fill' || c.name === 'fillRect') && /rgba\(4,14,10/.test(String(c.fillStyle)));
  assert.ok(plate.length >= 1, 'footer legend backing plate drawn');

  const hstate = {
    selectedHero: 'turtle_purple', hp: 80, maxHp: 100, lives: 3, score: 1234,
    combo: 0, comboTimer: 0, weaponLevel: 2, weaponDurability: 5, player: { shield: false },
  };
  const p1 = makeCtx();
  hud.player(p1, hstate, 0.016);
  const fonts1 = p1.calls.filter(c => c.name === 'fillText').map(c => c.font);
  assert.ok(fonts1.some(f => /bold 12px monospace/.test(String(f))), 'subtitleScale 1 keeps the 12px hero label exactly');
  assert.ok(fonts1.every(f => pxOf(f) >= 9), `hero card has no sub-9px text (got ${JSON.stringify(fonts1)})`);

  OPTIONS.set('subtitleScale', 1.6);
  const p2 = makeCtx();
  assert.doesNotThrow(() => hud.player(p2, hstate, 0.016), 'player draws at subtitleScale 1.6');
  const fonts2 = p2.calls.filter(c => c.name === 'fillText').map(c => c.font);
  assert.ok(fonts2.some(f => /bold 19px monospace/.test(String(f))), 'subtitleScale 1.6 grows the 12px label to 19px');
  assert.ok(fonts2.some(f => pxOf(f) > 12), 'some HUD text px grew with subtitleScale');
  // 2P card at max subtitle scale must still draw and fit its fields.
  const p2b = makeCtx();
  assert.doesNotThrow(() => hud.player(p2b, { ...hstate, selectedHero: 'teknium' }, 0.016, 10, 22, { score: true, tag: '2P' }),
    '2P hero card draws at subtitleScale 1.6');

  // ACTUAL layout measurement at max subtitle scale (not just doesNotThrow).
  // The long hero name must be bounded to its field and cannot reach WEAPON.
  const pf = makeCtx();
  hud.player(pf, { ...hstate, selectedHero: 'don_piedro' }, 0.016);
  const nameC = pf.calls.find(c => c.name === 'fillText' && c.args[0] === 'DON PIEDRO');
  assert.ok(nameC, 'long hero name drawn');
  assert.ok(Number.isFinite(nameC.args[3]) && nameC.args[3] <= 144, 'hero name declares a maxWidth inside its 144px field');
  const nameW = Math.min(pxOf(nameC.font) * 0.6 * String(nameC.args[0]).length, nameC.args[3]);
  assert.ok(nameC.args[1] + nameW <= nameC.args[1] + 144 + 1e-9, 'hero name box stays inside its field (WEAPON label untouched)');
  const hpText = pf.calls.find(c => c.name === 'fillText' && /^\d+ \/ \d+$/.test(String(c.args[0])));
  assert.ok(hpText && Number.isFinite(hpText.args[3]) && hpText.args[3] <= 72, 'HP numeric is bounded to the hero card');
  // Footer legend must be bounded to the backing plate / frame.
  const cf = makeCtx();
  hud.controls(cf, W, H, { chain: 4, airborne: true });
  const footer = cf.calls.find(c => c.name === 'fillText' && /PUNCH/.test(String(c.args[0])));
  assert.ok(footer, 'footer legend drawn at max scale');
  assert.ok(Number.isFinite(footer.args[3]), 'footer legend declares a maxWidth');
  const rawF = pxOf(footer.font) * 0.6 * String(footer.args[0]).length;
  const effF = Math.min(rawF, footer.args[3]);
  assert.ok(footer.args[1] - effF / 2 >= 0 && footer.args[1] + effF / 2 <= W, 'footer legend fits inside the frame');
  assert.ok(footer.args[3] <= W, 'footer maxWidth is within the frame');
  OPTIONS.set('subtitleScale', 1);
  console.log('hud: >=9px footer, backing plate, fontFor(subtitleScale), max-scale field fitting OK.');

  // =========================================================================
  // boss.js + events.js flash paths
  // =========================================================================
  const bosses = (await import('../boss.js')).createBosses({});
  OPTIONS.set('reducedFlash', false);
  let bctx = makeCtx();
  bosses.drawHud(bctx, { bossFight: { flash: 0.45, active: null } }, 0.016, W, H);
  const w0 = bctx.calls.filter(c => c.name === 'fillRect' && String(c.fillStyle).startsWith('rgba(255,255,255'));
  assert.equal(w0.length, 1, 'boss white flash drawn once');
  assert.ok(Math.abs(alphaOf(w0[0].fillStyle) - 0.45) < 1e-6, 'boss flash default alpha unchanged');
  OPTIONS.set('reducedFlash', true);
  bctx = makeCtx();
  bosses.drawHud(bctx, { bossFight: { flash: 0.45, active: null } }, 0.016, W, H);
  const w1 = bctx.calls.filter(c => c.name === 'fillRect' && String(c.fillStyle).startsWith('rgba(255,255,255'));
  assert.ok(Math.abs(alphaOf(w1[0].fillStyle) - 0.45 * 0.25) < 1e-6, 'boss flash damped with reducedFlash');
  OPTIONS.set('reducedFlash', false);

  const { drawEventOverlay } = await import('../events.js');
  const evState = () => ({ level: 0, cameraX: 0, events: { flash: 0.35, barks: [], banner: null, go: null, line: null } });
  let ectx = makeCtx();
  drawEventOverlay(ectx, evState(), W, H);
  const b0 = ectx.calls.filter(c => c.name === 'fillRect' && String(c.fillStyle).startsWith('rgba(255,244,214'));
  assert.equal(b0.length, 1, 'breach flash drawn once');
  assert.ok(Math.abs(alphaOf(b0[0].fillStyle) - 0.7) < 1e-6, 'breach flash default alpha unchanged (0.7)');
  OPTIONS.set('reducedFlash', true);
  ectx = makeCtx();
  drawEventOverlay(ectx, evState(), W, H);
  const b1 = ectx.calls.filter(c => c.name === 'fillRect' && String(c.fillStyle).startsWith('rgba(255,244,214'));
  assert.ok(Math.abs(alphaOf(b1[0].fillStyle) - 0.7 * 0.25) < 1e-6, 'breach flash damped with reducedFlash');
  OPTIONS.set('reducedFlash', false);
  console.log('boss/events: white + breach flash route through flashAlpha OK (boss colour-safe glyphs need a live fight, not unit-driven here).');

  // =========================================================================
  // coop.js
  // =========================================================================
  const coop = await import('../coop.js');
  const { continueLabel, P2_KEYS, P2_PAD } = coop;
  assert.equal(typeof continueLabel, 'function', 'continueLabel exported');
  const l10 = continueLabel(3, 10), l2 = continueLabel(3, 2);
  assert.ok(l10.includes('3 left') && l2.includes('3 left'), 'pool text present when pool > 0');
  assert.ok(l10.includes('10s') && l2.includes('2s'), 'countdown text present');
  const secsOf = s => Number((/(\d+)s/.exec(s) || [0, 0])[1]);
  assert.ok(secsOf(l2) < secsOf(l10), 'countdown decreases as left decreases');
  assert.equal(continueLabel(0, 5), 'no continues left', 'empty pool message');
  assert.equal(continueLabel(2, 0), 'START: continue (2 left) - ready', 'continue remains available after countdown reaches zero');
  assert.equal(continueLabel(2, 1.2, 'J / ENTER: continue'), 'J / ENTER: continue (2 left) - 2s', 'custom prompt variant');
  assert.deepEqual(P2_KEYS, {
    left: 'Numpad4', right: 'Numpad6', up: 'Numpad8', down: 'Numpad5',
    punch: 'Numpad1', kick: 'Numpad2', jump: 'Numpad3', dash: 'Numpad0',
    throw: 'NumpadDecimal', taunt: 'NumpadAdd', start: 'NumpadEnter',
  }, 'P2_KEYS unchanged');
  assert.deepEqual(P2_PAD, { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, START: 9 }, 'P2_PAD unchanged');

  // Regression: the down HUD used to call the continueLeft GETTER as a function.
  // Drive the real createCoop drawHud with a joined, down P2 through BOTH the
  // hud-card path and the no-hud fallback strip.
  {
    const { createCoop } = coop;
    const { createState } = await import('../logic.js');
    const s = createState(); s.walkLevel = true; s.level = 1;
    const stubbedHud = { player(ctx, v, dt, x, y) { ctx.fillText('P2CARD', x, y); } };
    const withHud = createCoop({ playing: () => true, selecting: () => false, selectIndex: () => 0, hud: stubbedHud });
    withHud.join(s, 'teknium');
    assert.ok(withHud.p2, 'P2 view created');
    withHud.p2.over = true;
    const dctx = makeCtx();
    assert.doesNotThrow(() => withHud.drawHud(dctx, s, 0.016, W, H), '2P down HUD (hud card) draws without throwing');
    const texts = dctx.calls.filter(c => c.name === 'fillText').map(c => String(c.args[0]));
    assert.ok(texts.some(t => /\d+s/.test(t)), 'hud down card shows a live countdown');

    const noHud = createCoop({ playing: () => true, selecting: () => false, selectIndex: () => 0 });
    noHud.join(s, 'teknium');
    noHud.p2.over = true;
    const dctx2 = makeCtx();
    assert.doesNotThrow(() => noHud.drawHud(dctx2, s, 0.016, W, H), '2P down HUD (fallback strip) draws without throwing');
    assert.ok(dctx2.calls.filter(c => c.name === 'fillText').map(c => String(c.args[0])).some(t => /\d+s/.test(t)), 'fallback down card shows a live countdown');
    // The public getter must still be a number (not a function).
    assert.equal(typeof withHud.continueLeft, 'number', 'api.continueLeft stays a numeric getter');

    // P1-out card: the combined prompt overflowed the old 300px single line; it
    // is now two lines inside a wider card and must render without throwing.
    const p1c = createCoop({ playing: () => true, selecting: () => false, selectIndex: () => 0, hud: stubbedHud });
    p1c.join(s, 'teknium');
    s.over = true; s.runComplete = false;
    p1c.step(s, 0.016);
    assert.equal(p1c.p1Out, true, 'checkOut marks P1 out');
    const pctx = makeCtx();
    assert.doesNotThrow(() => p1c.drawHud(pctx, s, 0.016, W, H), 'P1-out card draws without throwing');
    const ptexts = pctx.calls.filter(c => c.name === 'fillText').map(c => String(c.args[0]));
    assert.ok(ptexts.some(t => /J \/ ENTER: continue/.test(t)), 'P1 continue prompt drawn');
    assert.ok(ptexts.some(t => /2P stands close/.test(t)), 'P1 revive hint on its own line (no 300px overflow)');
  }
  console.log('coop: continueLabel + down-HUD draw (countdown, no getter-as-call) OK.');
} finally {
  OPTIONS.reset(); // restore every option to its default for other suites
}

console.log('QoL effects checks: all assertions passed.');
