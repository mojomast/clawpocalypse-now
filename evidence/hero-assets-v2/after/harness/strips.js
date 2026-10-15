// Scratch evidence harness (NOT production): drives the production anim/foot-lock/rig path.
import { createRig, POSES, FOOT_Y, HERO_CHAIN, HERO_KICK } from '../rig.js';
import '../don.js';
import { createAnim } from '../anim.js';
import { createFootLocks } from '../foot-lock.js';
import { HERO_MOVES_COMBAT } from '../hero-moves.js';
import { HERO_RIGS } from '../hero-rigs.js';
const q = new URLSearchParams(location.search);
const hero = q.get('hero'), seq = q.get('seq');
const rig = createRig();
const files = [...new Set(Object.values(HERO_RIGS[hero]).map(p => p.file))];
for (let i = 0; i < 400 && files.some(f => !rig.images[hero]?.[f]); i++) await new Promise(r => setTimeout(r, 20));
if (files.some(f => !rig.images[hero]?.[f])) throw Error('rig images not loaded');
const DT = 1 / 60;
const PUNCH = [{ wind: 0.07, active: 0.08, rec: 0.14 }, { wind: 0.07, active: 0.08, rec: 0.14 }, { wind: 0.09, active: 0.09, rec: 0.17 }];
const fin = HERO_MOVES_COMBAT[hero]?.finisher;
const K = n => POSES[`${hero}_${n}`] ? `${hero}_${n}` : n;
// Each builder returns 60 Hz frames {name, info, flip, x}
function hold(name, secs, flip, x, info = {}) { const out = []; for (let i = 0; i < Math.round(secs / DT); i++) out.push({ name: K(name), info, flip, x }); return out; }
function attack(move, t, flip, x, heavy = false) {
  const out = [];
  for (const [ph, d] of [['wind', t.wind], ['active', t.active], ['recover', t.rec]]) {
    const n = Math.max(1, Math.round(d / DT));
    for (let i = 0; i < n; i++) out.push({ name: `${hero}_${move}_${ph}`, info: { phase: ph, dur: d, heavy }, flip, x, label: `${move}_${ph}` });
  }
  return out;
}
function gait(kind, cycles, flip, x0) {
  const speed = kind === 'run' ? 160 * 1.75 : 160, per = kind === 'run' ? 256 : 184, out = [];
  let x = x0, walkT = 0;
  const n = Math.round(cycles * (per / 2) / speed / DT);
  for (let i = 0; i < n; i++) {
    x += (flip ? -1 : 1) * speed * DT; walkT += speed * DT / per;
    out.push({ name: K(`${kind}${Math.floor(walkT * 8) % 4 + 1}`), info: { walkT, walkRate: 8 }, flip, x });
  }
  return out;
}
function build(flip) {
  const x0 = 400, chain = HERO_CHAIN[hero] || [];
  const last = f => f.length ? f[f.length - 1].x : x0;
  switch (seq) {
    case 'walk': return { frames: gait('walk', 2, flip, x0), every: 4 };
    case 'run': return { frames: gait('run', 2, flip, x0), every: 3 };
    case 'idle-to-attack': return { frames: [...hold('idleA', 0.25, flip, x0), ...attack(chain[0], PUNCH[0], flip, x0), ...hold('idleA', 0.2, flip, x0)], every: 2 };
    case 'combo': {
      const f = [...hold('idleA', 0.1, flip, x0)];
      for (let i = 0; i < 3; i++) f.push(...attack(chain[i], PUNCH[i], flip, x0));
      if (fin && POSES[`${hero}_${fin.name}_wind`]) f.push(...attack(fin.name, { wind: fin.wind, active: fin.active, rec: fin.rec }, flip, x0, !!fin.heavy));
      f.push(...hold('idleA', 0.2, flip, x0));
      return { frames: f, every: 3 };
    }
    case 'turn': { const a = gait('walk', 1, flip, x0); const t = hold('turn', 0.12, !flip, last(a)); const b = gait('walk', 1, !flip, last(a)); return { frames: [...a, ...t, ...b], every: 3 }; }
    case 'landing': return { frames: [...hold('jump', 0.25, flip, x0), ...hold('idleA', 0.45, flip, x0)], every: 2 };
    case 'hurt-down-getup': return { frames: [...hold('idleA', 0.1, flip, x0), ...hold('flinch', 0.28, flip, x0), ...hold('down', 0.68, flip, x0), ...hold('wake', 0.22, flip, x0), ...hold('idleA', 0.4, flip, x0)], every: 3 };
  }
  throw Error('seq ' + seq);
}
const rows = [false, true].map(flip => {
  const { frames, every } = build(flip);
  const anim = createAnim(), locks = createFootLocks();
  const samples = [];
  frames.forEach((f, i) => {
    const t = i * DT;
    const drawing = anim.step('p', f.name, f.info, DT, t);
    const angles = locks.place('p', hero, drawing, { x: f.x, y: 300, flip: f.flip, scale: 1, dt: DT });
    if (i % every === 0 || i === frames.length - 1) samples.push({ ...f, t, angles: { ...angles, __trail: undefined }, anchors: { ...(locks.tracks.get('p')?.anchors || {}) } });
  });
  return samples;
});
const cellW = 150, cellH = 240, header = 46, ground = 222;
const cols = Math.max(...rows.map(r => r.length));
const worldH = 260;
const c = document.getElementById('c');
c.width = Math.max(cols * cellW, 900); c.height = header + rows.length * (cellH + 18) + (/walk|run|turn/.test(seq) ? rows.length * worldH : 0);
const ctx = c.getContext('2d');
ctx.fillStyle = '#171b2b'; ctx.fillRect(0, 0, c.width, c.height);
ctx.fillStyle = '#fff'; ctx.font = 'bold 18px monospace'; ctx.fillText(`${hero} · ${seq} · production anim.step + foot-lock + rig.draw · rig scale 1.0 · 60 Hz sampled`, 10, 22);
ctx.font = '12px monospace'; ctx.fillStyle = '#9da8c5'; ctx.fillText(`feat/natural-hero-assets 2120bd6 (v2 assets) · rows: start facing RIGHT, start facing LEFT · yellow line = FOOT_Y ground contact`, 10, 40);
let y = header;
rows.forEach((samples, r) => {
  ctx.fillStyle = '#9da8c5'; ctx.font = 'bold 12px monospace'; ctx.fillText(r ? 'start LEFT' : 'start RIGHT', 6, y + 12);
  y += 16;
  samples.forEach((s, i) => {
    const x = i * cellW;
    ctx.fillStyle = i % 2 ? '#252c40' : '#20273a'; ctx.fillRect(x, y, cellW, cellH);
    ctx.strokeStyle = '#e8c547'; ctx.beginPath(); ctx.moveTo(x + 8, y + ground + .5); ctx.lineTo(x + cellW - 8, y + ground + .5); ctx.stroke();
    ctx.fillStyle = '#d9e6ff'; ctx.font = '10px monospace';
    const nm = (s.label || s.name.replace(hero + '_', ''));
    ctx.fillText(nm.slice(0, 22), x + 4, y + 12); ctx.fillText(`t=${s.t.toFixed(3)}s ${s.flip ? 'L' : 'R'}`, x + 4, y + 24);
    const drawing = { ...s.angles };
    // footTargets are rig-local relative to root x: keep them; draw at the cell centre
    rig.draw(ctx, hero, drawing, x + cellW / 2, y + ground - FOOT_Y, s.flip, 1);
  });
  y += cellH + 2;
});
if (/walk|run|turn/.test(seq)) rows.forEach((samples, r) => {
  // world-space onion: every sampled frame at its real x, so sliding feet are visible
  const minX = Math.min(...samples.map(s => s.x)), maxX = Math.max(...samples.map(s => s.x));
  const ox = 80 - minX + (c.width - 160 - (maxX - minX)) / 2;
  ctx.fillStyle = '#10131f'; ctx.fillRect(0, y, c.width, worldH);
  ctx.fillStyle = '#9da8c5'; ctx.font = '12px monospace'; ctx.fillText(`world-space onion (${r ? 'start LEFT' : 'start RIGHT'}): sampled frames at true x; red ticks = locked support anchors`, 8, y + 14);
  const gy = y + worldH - 20;
  ctx.strokeStyle = '#e8c547'; ctx.beginPath(); ctx.moveTo(0, gy + .5); ctx.lineTo(c.width, gy + .5); ctx.stroke();
  samples.forEach((s, i) => {
    ctx.save(); ctx.globalAlpha = i === samples.length - 1 ? 1 : 0.28;
    rig.draw(ctx, hero, { ...s.angles }, s.x + ox, gy - FOOT_Y, s.flip, 1); ctx.restore();
    ctx.fillStyle = '#ff4d4d';
    for (const ax of Object.values(s.anchors)) ctx.fillRect(ax + ox - 1, gy + 2, 2, 6);
  });
  y += worldH;
});
window.__strip = { hero, seq, frames: rows.map(r => r.length), png: c.toDataURL('image/png') };
