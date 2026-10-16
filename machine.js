// machine.js — The Machine Beneath the Skin, a summonable ally.
// A quiet silicon sentinel the gang wakes in a flooded vault under the sewers.
// Shared assist meter (1P and 2P, one summon): combos and damage fill it; Q (P1),
// numpad 9 (P2) or R3 on either pad calls it. Activate, then a lens-beam line
// or a hex dome that blocks projectiles, then power-down and a cooldown.
// Bosses take a reduced hit and are not knocked down, so phases stay intact.
// The beam's own damage never refills the meter. R3 is read here, the same way
// assist.js reads L3, so gamepad.js does not put it on PLAY_MAP.
import { effectiveHit } from './logic.js';
import { ensureEvents, speakLine, readTime, READ } from './events.js';

export const PORTRAIT = 'assets/allies/machine/portrait.png';
export const MACHINE = {
  MAX: 100,
  GAIN: { hit: 5, ko: 10, hurt: 6 },
  ACTIVATE: 0.52,
  BEAM: 1.05,
  SHIELD: 1.65,
  DOWN: 0.62,
  COOLDOWN: 8,
  BEAM_DMG: 4,
  BOSS_DMG: 2,
  REACH: 280,
  DEPTH: 46,
  SHIELD_R: 124,
  DRAW_H: 204,
  MEET_X: 1880,
  R3: 11,
};
export const MACHINE_LINES = {
  meet: 'Awake. I stand with you.',
  hold: 'Shredclaw. Dome up. I hold.',
};
// Packed atlas rects (tools output). Bottoms share one baseline; eye is px inside the frame.
export const ATLAS = {
  w: 1296, h: 456,
  frames: {
    idle: { x: 0, y: 5, w: 262, h: 451, eye: [188, 49] },
    activate: { x: 264, y: 0, w: 346, h: 456, eye: [211, 60] },
    beam: { x: 612, y: 10, w: 375, h: 446, eye: [267, 133] },
    down: { x: 989, y: 157, w: 307, h: 299, eye: [218, 71] },
  },
};
export const FX = {
  w: 3233, h: 240,
  frames: {
    beam0: { x: 0, y: 18, w: 248, h: 203 },
    beam1: { x: 250, y: 74, w: 318, h: 92 },
    beam2: { x: 570, y: 22, w: 295, h: 195 },
    beam3: { x: 867, y: 68, w: 282, h: 103 },
    shield0: { x: 1151, y: 0, w: 228, h: 240 },
    shield1: { x: 1381, y: 7, w: 265, h: 226 },
    shield2: { x: 1648, y: 2, w: 274, h: 236 },
    shield3: { x: 1924, y: 0, w: 282, h: 240 },
    spark0: { x: 2208, y: 24, w: 250, h: 191 },
    spark1: { x: 2460, y: 22, w: 250, h: 196 },
    spark2: { x: 2712, y: 16, w: 263, h: 208 },
    spark3: { x: 2977, y: 23, w: 256, h: 193 },
  },
};
const PHASE_DUR = { activate: MACHINE.ACTIVATE, beam: MACHINE.BEAM, shield: MACHINE.SHIELD, down: MACHINE.DOWN };

const isBoss = n => !!(n && (n.boss || n.kind === 'boss' || n.levelBoss || n.rider || n.__boss));

export function owner(s) {
  let o = s;
  while (o && !Object.prototype.hasOwnProperty.call(o, 'ninjas')) {
    const p = Object.getPrototypeOf(o);
    if (!p || p === Object.prototype) break;
    o = p;
  }
  return o || s;
}

// True when a projectile sits inside the hex dome. Combat, ext shots and drone
// bolts call this before they can hurt a player.
export function shotBlocked(state, shot) {
  const g = state && owner(state).machineShield;
  if (!g || !shot || !g.circles) return false;
  const ys = [shot.y || 0, (shot.y || 0) + 36];
  for (const c of g.circles) {
    for (const y of ys) {
      const dx = (shot.x || 0) - c.x, dy = y - c.y;
      if (dx * dx + dy * dy <= c.r * c.r) {
        owner(state).machineBlocked = (owner(state).machineBlocked || 0) + 1;
        return true;
      }
    }
  }
  return false;
}

export function createMachine(opts = {}) {
  const audio = opts.audio || null;
  const playScene = opts.playScene || null;
  const cinemaActive = opts.cinemaActive || (() => false);
  const getPads = opts.getPads || (() => {
    try {
      // An empty usablePads array is authoritative: do not fall through to raw
      // hardware while the controller's neutral-return latch is active.
      const usable = typeof window !== 'undefined' && window.__ppGamepad && window.__ppGamepad.usablePads;
      if (usable !== undefined) return usable;
      return typeof navigator !== 'undefined' && navigator.getGamepads ? [...navigator.getGamepads()] : [];
    }
    catch (_) { return []; }
  });
  const play = n => { try { audio && audio.play && audio.play(n); } catch (_) {} };
  const img = {};
  const load = (k, src) => {
    if (typeof Image === 'undefined') return;
    try { const im = new Image(); im.src = src; img[k] = im; } catch (_) {}
  };
  load('atlas', 'assets/allies/machine/atlas.webp');
  load('fx', 'assets/allies/machine/fx.webp');
  load('portrait', PORTRAIT);
  const imgReady = im => !!(im && im.complete && im.naturalWidth);

  let bound = null, seen = new WeakMap(), lastHp = null, lastSpecial = 0, lastP2 = null, padPrev = false, clock = 0;
  const stats = { fired: 0, beams: 0, shields: 0, hits: 0, bossHits: 0 };

  function bind(s) {
    const o = owner(s);
    if (bound !== o) {
      bound = o; seen = new WeakMap(); lastHp = o.hp; lastSpecial = o.hpHit || 0; lastP2 = null; padPrev = false;
      if (o.machineGauge == null) o.machineGauge = 0;
      if (!o.machineNext) o.machineNext = 'beam';
    }
    return o;
  }
  function partner(o) {
    if (o.machinePartner && o.machinePartner.player) return o.machinePartner;
    try {
      const v = typeof window !== 'undefined' && window.__ppCoop && window.__ppCoop.p2;
      if (v && !v.over && v.player && Object.getPrototypeOf(v) === o) return v;
    } catch (_) {}
    return null;
  }
  function bodies(o) {
    const list = [];
    if (o.player) list.push(o.player);
    const p2 = partner(o);
    if (p2 && p2.player) list.push(p2.player);
    return list;
  }
  function add(o, v) { o.machineGauge = Math.max(0, Math.min(MACHINE.MAX, (o.machineGauge || 0) + v)); }
  function remember(o) {
    for (const n of o.ninjas || []) if (n) seen.set(n, { hp: n.hp, dead: !!n.dead });
    lastHp = o.hp; lastSpecial = o.hpHit || 0;
    const p2 = partner(o); lastP2 = p2 ? p2.hp : null;
  }
  function collect(o) {
    for (const n of o.ninjas || []) {
      if (!n) continue;
      const p = seen.get(n);
      if (p && !p.dead) {
        if (n.dead) add(o, MACHINE.GAIN.ko);
        else if (n.hp < p.hp) add(o, MACHINE.GAIN.hit);
      }
    }
    if (lastHp != null && o.hp < lastHp && (o.hpHit || 0) === lastSpecial) add(o, MACHINE.GAIN.hurt);
    const p2 = partner(o);
    if (p2 && lastP2 != null && p2.hp < lastP2) add(o, MACHINE.GAIN.hurt);
  }
  function line(text) {
    return { speaker: 'THE MACHINE', text, portrait: PORTRAIT, t: 0, dur: readTime(text) + READ.PAUSE };
  }
  function queue(o, entry) {
    const e = ensureEvents(o);
    if (e.line && e.line.t < (e.line.dur || 0) - 0.4) e.lineQ = (e.lineQ || []).concat(entry).slice(-3);
    else e.line = entry;
  }
  function followMeet(o) {
    try {
      queue(o, line(MACHINE_LINES.meet));
      speakLine(o, 'vault', { level: 0 });
    } catch (_) {}
  }
  function followPayoff(o) {
    try {
      queue(o, line(MACHINE_LINES.hold));
      speakLine(o, 'migrate', { level: 4 });
    } catch (_) {}
  }
  function story(o) {
    if (!o.hpMode || o.over || !o.player) return;
    if (!o.machineMet && (o.level | 0) === 0 && o.player.x >= MACHINE.MEET_X && !(cinemaActive && cinemaActive())) {
      o.machineMet = true;
      if (playScene) playScene('machineMeet', () => followMeet(o));
      else followMeet(o);
    }
    const shred = (o.level | 0) === 4 && (o.ninjas || []).some(n => n && !n.dead && (n.kind === 'boss' || (n.boss && /shred/i.test(n.name || ''))));
    if (!o.machinePayoff && shred) { o.machinePayoff = true; followPayoff(o); }
  }
  function strikeBeam(o, c, prev, sweep) {
    for (const n of o.ninjas || []) {
      if (!n || n.dead || c.hit.has(n)) continue;
      const dx = (n.x - c.x) * c.face;
      if (dx < 20 || dx > MACHINE.REACH) continue;
      if (Math.abs((n.y || 0) - c.y) > MACHINE.DEPTH) continue;
      const along = dx / MACHINE.REACH;
      if (along <= prev || along > sweep) continue;
      c.hit.add(n);
      const boss = isBoss(n);
      const hit = effectiveHit(o, n, boss ? MACHINE.BOSS_DMG : MACHINE.BEAM_DMG, Math.random, { source: 'machine' });
      if (!hit.landed) continue;
      n.hitFlash = 0.14;
      n.face = -c.face;
      if (boss) {
        n.stun = Math.max(n.stun || 0, 0.22);
        if (!n.react) n.react = 'flinch';
        n.knock = (n.knock || 0) + c.face * 36;
        stats.bossHits++;
      } else {
        n.stun = Math.max(n.stun || 0, 0.55);
        n.react = 'stagger';
        n.knock = c.face * 240;
        n.atk = null; n.move = null; n.phase = null; n.token = false;
      }
      stats.hits++;
      if (o.fxCue) try { o.fxCue('hit', { x: n.x, y: n.y - 36, heavy: !boss, shake: boss ? 0.08 : 0.22 }); } catch (_) {}
    }
  }
  function syncShield(o, c) {
    const pts = bodies(o);
    const circles = (pts.length ? pts : [{ x: c.x, y: c.y }]).map(p => ({ x: p.x, y: p.y, r: MACHINE.SHIELD_R }));
    o.machineShield = { circles };
  }
  function advance(o, dt) {
    let left = dt;
    while (o.machineCast && left > 0) {
      const c = o.machineCast;
      const dur = PHASE_DUR[c.phase] || 0.5;
      const use = Math.min(Math.max(0, dur - c.t), left);
      const prevSweep = c.sweep || 0;
      c.t += use; left -= use;
      if (c.phase === 'beam') {
        c.sweep = Math.min(1, c.t / MACHINE.BEAM);
        strikeBeam(o, c, prevSweep, c.sweep);
      } else if (c.phase === 'shield') syncShield(o, c);
      if (c.t + 1e-4 < dur) break;
      if (c.phase === 'activate') {
        c.phase = c.mode === 'shield' ? 'shield' : 'beam';
        c.t = 0; c.sweep = 0;
        if (c.phase === 'beam') { stats.beams++; play('smash'); }
        else { stats.shields++; play('power'); syncShield(o, c); }
      } else if (c.phase === 'beam' || c.phase === 'shield') {
        c.phase = 'down'; c.t = 0; o.machineShield = null;
      } else {
        o.machineCast = null; o.machineShield = null; o.machineCool = MACHINE.COOLDOWN;
        break;
      }
    }
  }

  function press(s, mode, by) {
    const o = bind(s);
    if (!o || o.over || o.machineCast || (o.machineCool || 0) > 0 || (o.machineGauge || 0) < MACHINE.MAX) return false;
    if (cinemaActive && cinemaActive()) return false;
    const forced = mode === 'beam' || mode === 'shield';
    const use = forced ? mode : (o.machineNext || 'beam');
    if (!forced) o.machineNext = use === 'beam' ? 'shield' : 'beam';
    const p2 = by === 2 ? partner(o) : null;
    const who = (p2 && p2.player) || o.player;
    if (!who) return false;
    const face = (p2 && p2.combat && p2.combat.facing) || (o.combat && o.combat.facing) || 1;
    o.machineGauge = 0;
    o.machineCast = { phase: 'activate', mode: use, t: 0, x: who.x - face * 40, y: who.y, face: face < 0 ? -1 : 1, hit: new Set(), sweep: 0 };
    o.machineShield = null;
    stats.fired++;
    play('sting');
    return true;
  }

  function step(s, dt) {
    const o = bind(s);
    if (!o) return;
    dt = Math.max(0, Number(dt) || 0);
    clock += dt;
    if ((o.machineCool || 0) > 0) o.machineCool = Math.max(0, o.machineCool - dt);
    const locked = (o.machineCool || 0) > 0 || !!o.machineCast;
    if (!locked) collect(o);
    let pad = false;
    try {
      for (const g of getPads() || []) {
        const b = g && g.buttons && g.buttons[MACHINE.R3];
        if (b && (b.pressed || b.value > 0.5)) pad = true;
      }
    } catch (_) {}
    if (pad && !padPrev) press(o);
    padPrev = pad;
    advance(o, dt);
    if (!o.machineCast || o.machineCast.phase !== 'shield') o.machineShield = o.machineCast && o.machineCast.phase === 'shield' ? o.machineShield : null;
    remember(o);
    story(o);
  }

  function handleKey(e, s) {
    if (!e || e.repeat || (e.code !== 'KeyQ' && e.code !== 'Numpad9')) return false;
    return press(s, null, e.code === 'Numpad9' ? 2 : 1);
  }
  function gain(s, kind) {
    const o = bind(s);
    if ((o.machineCool || 0) > 0 || o.machineCast) return o.machineGauge || 0;
    const v = typeof kind === 'number' ? kind : (MACHINE.GAIN[kind] || 0);
    add(o, v);
    return o.machineGauge;
  }

  function frameOf(phase) {
    if (phase === 'activate') return ATLAS.frames.activate;
    if (phase === 'beam') return ATLAS.frames.beam;
    if (phase === 'down') return ATLAS.frames.down;
    return ATLAS.frames.idle;
  }
  function drawWorld(ctx, s) {
    const o = owner(s), c = o && o.machineCast;
    if (!c || !ctx) return;
    const fr = frameOf(c.phase);
    const bob = Math.sin(clock * 6.4) * (c.phase === 'down' ? 1 : 3.4);
    const sway = Math.sin(clock * 4.6) * (c.phase === 'down' ? 0.018 : 0.06);
    let sx = 1, sy = 1, alpha = 1, sink = 0, glow = 0.55 + 0.45 * Math.sin(clock * 9);
    if (c.phase === 'activate') {
      const u = Math.min(1, c.t / MACHINE.ACTIVATE);
      const pop = 1 - Math.pow(1 - u, 3);
      sy = 0.4 + 0.6 * pop; sx = 1.2 - 0.2 * pop; glow *= u;
    } else if (c.phase === 'down') {
      const u = Math.min(1, c.t / MACHINE.DOWN);
      sy = 1 - 0.18 * u; sx = 1 + 0.1 * u; sink = 10 * u; alpha = 1 - 0.35 * u; glow *= 0.35 * (1 - u);
    } else {
      const p = Math.sin(clock * 7.5);
      sx = 1 + p * 0.03; sy = 1 - p * 0.03;
      if (c.phase === 'beam') glow = 0.75 + 0.25 * Math.sin(clock * 22);
    }
    const feet = c.y + ((o.player && o.player.r) || 16) + sink;
    const dh = MACHINE.DRAW_H, dw = dh * fr.w / fr.h;
    ctx.save();
    ctx.globalAlpha = Math.max(0, alpha);
    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    ctx.beginPath(); ctx.ellipse(c.x, feet + 2, dw * 0.28 * sx, 6, 0, 0, 7); ctx.fill();
    // Lens beam sits behind the body so the sentinel stays readable and the
    // streak leaves the eye instead of painting over the whole sprite.
    if (c.phase === 'beam' && imgReady(img.fx)) {
      const fi = Math.min(3, Math.floor((c.sweep || 0) * 3.99));
      const bf = FX.frames['beam' + fi];
      const scb = dh / ATLAS.frames.beam.h;
      const beamW = MACHINE.DRAW_H * ATLAS.frames.beam.w / ATLAS.frames.beam.h;
      const eyeFwd = (ATLAS.frames.beam.eye[0] * scb - beamW / 2) * c.face;
      const eyeUp = MACHINE.DRAW_H - ATLAS.frames.beam.eye[1] * scb;
      const len = Math.max(36, MACHINE.REACH * Math.max(0.15, c.sweep || 0));
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.translate(c.x + eyeFwd, feet + bob - eyeUp);
      ctx.scale(c.face, 1);
      ctx.globalAlpha = 0.78 * alpha;
      ctx.drawImage(img.fx, bf.x, bf.y, bf.w, bf.h, 18, -22, len, 44);
      ctx.restore();
    }
    ctx.translate(c.x, feet + bob);
    ctx.transform(1, 0, sway, 1, 0, 0);
    ctx.scale((c.face < 0 ? -1 : 1) * sx, sy);
    if (imgReady(img.atlas)) ctx.drawImage(img.atlas, fr.x, fr.y, fr.w, fr.h, -dw / 2, -dh, dw, dh);
    else {
      ctx.fillStyle = '#9aa7b4'; ctx.fillRect(-dw * 0.28, -dh * 0.92, dw * 0.56, dh * 0.92);
      ctx.fillStyle = '#d8a15a'; ctx.fillRect(-dw * 0.08, -dh * 0.42, dw * 0.16, dw * 0.16);
    }
    const sc = dh / fr.h;
    const ex = -dw / 2 + fr.eye[0] * sc, ey = -dh + fr.eye[1] * sc;
    ctx.globalCompositeOperation = 'lighter';
    const rad = ctx.createRadialGradient(ex, ey, 1, ex, ey, 18);
    rad.addColorStop(0, `rgba(190,255,255,${0.85 * glow})`);
    rad.addColorStop(1, 'rgba(0,160,255,0)');
    ctx.fillStyle = rad; ctx.beginPath(); ctx.arc(ex, ey, 18, 0, 7); ctx.fill();
    if ((c.phase === 'activate' || c.phase === 'down') && imgReady(img.fx)) {
      const sp = FX.frames['spark' + (Math.floor(clock * 12) % 4)];
      const sz = c.phase === 'down' ? 54 : 40;
      ctx.globalAlpha = 0.8 * alpha;
      ctx.drawImage(img.fx, sp.x, sp.y, sp.w, sp.h, -sz / 2, -dh * 0.55 - (clock % 0.4) * 30, sz, sz * 0.7);
    }
    ctx.restore();
    if (c.phase === 'shield' && o.machineShield) {
      const u = c.t / MACHINE.SHIELD;
      const name = u < 0.16 ? 'shield0' : u > 0.84 ? 'shield3' : (Math.sin(clock * 30) > 0.55 ? 'shield2' : 'shield1');
      const sf = FX.frames[name];
      for (const circ of o.machineShield.circles) {
        const size = circ.r * 2.15;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = name === 'shield3' ? 0.55 : 0.8;
        if (imgReady(img.fx)) ctx.drawImage(img.fx, sf.x, sf.y, sf.w, sf.h, circ.x - size / 2, circ.y - size * 0.72, size, size * 0.86);
        else {
          ctx.strokeStyle = 'rgba(80,220,255,0.8)'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(circ.x, circ.y - 20, circ.r, 0, 7); ctx.stroke();
        }
        ctx.restore();
      }
    }
  }

  function drawHud(ctx, s, W, H) {
    const o = owner(s);
    if (!o || !ctx) return;
    const v = Math.max(0, Math.min(MACHINE.MAX, o.machineGauge || 0));
    const cool = o.machineCool || 0;
    const cast = o.machineCast;
    const full = v >= MACHINE.MAX && !cast && cool <= 0;
    const x = W - 120, y = H - 66, w = 108, h = 30;
    let two = false;
    try { two = !!(typeof window !== 'undefined' && window.__ppCoop && window.__ppCoop.joined); } catch (_) {}
    const next = (o.machineNext || 'beam') === 'shield' ? 'DOME' : 'BEAM';
    ctx.save();
    const pulse = full ? 0.5 + 0.5 * Math.sin(clock * 8) : 0;
    ctx.fillStyle = 'rgba(8,14,30,0.78)';
    ctx.strokeStyle = full ? `rgba(120,230,255,${0.55 + 0.45 * pulse})` : 'rgba(140,170,190,0.4)';
    ctx.lineWidth = full ? 2 : 1;
    if (full) { ctx.shadowBlur = 8 + 8 * pulse; ctx.shadowColor = '#7ee9ff'; }
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, 7); else ctx.rect(x, y, w, h);
    ctx.fill(); ctx.stroke(); ctx.shadowBlur = 0;
    ctx.font = 'bold 8px monospace'; ctx.textAlign = 'left';
    ctx.fillStyle = full ? '#bff6ff' : 'rgba(180,210,220,0.85)';
    const label = cast ? (cast.mode === 'shield' ? 'DOME' : 'BEAM') : cool > 0 ? 'COOL ' + Math.ceil(cool) : full ? (two ? 'Q/9 ' : 'Q ') + next : 'MACHINE';
    ctx.fillText(label, x + 6, y + 11);
    ctx.textAlign = 'right'; ctx.fillStyle = 'rgba(255,255,255,0.55)';
    if (!full && !cast) ctx.fillText(cool > 0 ? '' : (v | 0) + '%', x + w - 6, y + 11);
    const segs = 10, sw = 8.2, gap = 1.2;
    const shown = cast ? 100 : cool > 0 ? (1 - cool / MACHINE.COOLDOWN) * 100 : v;
    for (let i = 0; i < segs; i++) {
      const sx = x + 6 + i * (sw + gap);
      const fill = Math.max(0, Math.min(1, shown / 10 - i));
      ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.fillRect(sx, y + 16, sw, 8);
      if (fill > 0) {
        ctx.fillStyle = cool > 0 ? '#6d7c88' : full || cast ? `hsl(${188 + 12 * Math.sin(clock * 8)}, 90%, ${58 + 12 * pulse}%)` : `hsl(${196 + i * 4}, 70%, 52%)`;
        ctx.fillRect(sx, y + 16, sw * fill, 8);
      }
    }
    if (full) {
      const kx = x + w - 24, ky = y - 24;
      ctx.shadowBlur = 10; ctx.shadowColor = '#7ee9ff';
      ctx.fillStyle = '#d7fbff';
      ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(kx, ky, 22, 22, 5); else ctx.rect(kx, ky, 22, 22);
      ctx.fill(); ctx.shadowBlur = 0;
      ctx.fillStyle = '#042028'; ctx.font = 'bold 13px monospace'; ctx.textAlign = 'center';
      ctx.fillText(two ? 'Q' : 'Q', kx + 11, ky + 15);
    }
    ctx.restore();
  }

  const api = {
    step, drawWorld, drawHud, handleKey, press, gain, shotBlocked, stats, MACHINE, PORTRAIT,
    ready: () => imgReady(img.atlas) && imgReady(img.fx) && imgReady(img.portrait),
    gauge: s => owner(s).machineGauge || 0,
    phase: s => (owner(s).machineCast && owner(s).machineCast.phase) || 'idle',
    mode: s => (owner(s).machineCast && owner(s).machineCast.mode) || null,
    next: s => owner(s).machineNext || 'beam',
    cool: s => owner(s).machineCool || 0,
    debug: s => {
      const o = s ? owner(s) : bound;
      if (!o) return null;
      return { phase: (o.machineCast && o.machineCast.phase) || 'idle', mode: o.machineCast && o.machineCast.mode, next: o.machineNext || 'beam', gauge: o.machineGauge || 0, cool: o.machineCool || 0, met: !!o.machineMet, payoff: !!o.machinePayoff, shield: !!o.machineShield, blocked: o.machineBlocked || 0, stats: { ...stats } };
    },
  };
  return api;
}

// Portrait chip while a cinematic line belongs to the Machine (same slot don.js uses for Don).
let chip = null;
const MACHINE_CHIP = false;   // story v3: cine-v3.js draws the Machine's portrait with the other speakers, so a chip would be a second Machine
export function drawMachineSpeaker(ctx, W, H, cinema) {
  try {
    if (!MACHINE_CHIP) return false;
    const id = cinema && cinema.scene && cinema.scene(); if (!id) return false;
    const panel = cinema.panels && cinema.panels()[id];
    const d = cinema.debug && cinema.debug();
    if (!panel || !d) return false;
    const li = d.phase === 'tail' || d.phase === 'out' ? panel.lines.length : d.li;
    const text = li >= 1 ? panel.lines[li - 1] : null;
    if (!text || !/^THE MACHINE:/.test(text)) return false;
    if (!chip && typeof Image !== 'undefined') { chip = new Image(); chip.src = PORTRAIT; }
    if (!chip || !chip.complete || !chip.naturalWidth) return false;
    const w = 96, h = 120, x = 14, y = H - 182 - h - 8;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x - 4, y - 4, w + 8, h + 26);
    ctx.drawImage(chip, x, y, w, h);
    ctx.strokeStyle = '#7ee9ff'; ctx.lineWidth = 3; ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = '#7ee9ff'; ctx.font = 'bold 11px monospace'; ctx.textAlign = 'center';
    ctx.fillText('THE MACHINE', x + w / 2, y + h + 16);
    ctx.restore();
    return true;
  } catch (_) { return false; }
}
