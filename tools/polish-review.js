// Deterministic production-animation replay; no game or original evidence edits.
import { createRig, POSES, HERO_MOVES, MECHANICS, heroSecondary } from '../rig.js';
import '../don.js';
import { HERO_RIGS } from '../hero-rigs.js';
import { createAnim } from '../anim.js';
import { createFootLocks } from '../foot-lock.js';
import { HERO_MOVES_COMBAT } from '../hero-moves.js';

const rig = createRig(), canvas = document.querySelector('canvas'), ctx = canvas.getContext('2d');
const heroes = Object.keys(HERO_RIGS);
const files = heroes.flatMap(h => Object.values(HERO_RIGS[h]).flatMap(p => [p.file, ...Object.values(p.variants || {}).map(v => v.file)]).map(f => [h, f]));
for (let n = 0; files.some(([h, f]) => !rig.images[h]?.[f]) && n < 500; n++) await new Promise(r => setTimeout(r, 20));
for (const [h, f] of files) if (!rig.images[h]?.[f]) throw Error(`Unloaded image: ${h}/${f}`);
let anim, locks, sequence, hero, frame = 0;
const moves = h => [...new Set([...Object.keys(HERO_MOVES[h]), ...MECHANICS, ...(h === 'turbofit' ? ['axeB'] : [])])].filter(m => POSES[`${h}_${m}_active`]);
const duration = (h, m) => Object.values(HERO_MOVES_COMBAT[h] || {}).find(a => a.name === m) || { wind: .16, active: .13, rec: .32 };
function start(h, move) {
  hero = h; frame = 0; anim = createAnim(); locks = createFootLocks();
  for (let side = 0; side < 2; side++) heroSecondary.forget(`review:${side}`);
  if (moves(h).includes(move)) {
    const a = duration(h, move);
    sequence = [{ state: 'idleA', time: .2 }, { state: move + '_wind', phase: 'wind', time: a.wind },
      { state: move + '_active', phase: 'active', time: a.active }, { state: move + '_recover', phase: 'rec', time: a.rec }, { state: 'idleA', time: .3 }];
  } else if (move === 'hurt-down-getup') sequence = [{ state: 'flinch', time: .2 }, { state: 'down', time: .4 }, { state: 'wake', time: .3 }, { state: 'idleA', time: .3 }];
  else sequence = [{ state: move, time: 1.2 }];
  return { frames: sequence.reduce((n, s) => n + Math.ceil(s.time * 60), 0), sequence };
}
function draw() {
  let n = frame, part = sequence.at(-1);
  for (const s of sequence) { const count = Math.ceil(s.time * 60); if (n < count) { part = s; break; } n -= count; }
  const dt = 1 / 60, t = frame * dt, gait = /^(walk|run)$/.test(part.state);
  const walkT = gait ? t * (part.state === 'run' ? 385 / 256 : 220 / 184) : null;
  const state = gait ? part.state + (Math.floor(walkT * 8) % 4 + 1) : part.state;
  const name = `${hero}_${state}`;
  ctx.fillStyle = '#151c2b'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#e2e9ff'; ctx.font = '15px monospace'; ctx.fillText(`${hero}  ${state}  ${part.phase || ''}  frame ${frame}`, 12, 22);
  for (let side = 0; side < 2; side++) {
    const x = side ? 700 : 260, y = 182, key = `review:${side}`;
    ctx.strokeStyle = '#46536f'; ctx.beginPath(); ctx.moveTo(side * 480 + 10, 245); ctx.lineTo(side * 480 + 470, 245); ctx.stroke();
    const p = anim.step(key, name, { phase: part.phase, dur: part.time, heavy: true, walkT, walkRate: 8 }, dt, t);
    const drawing = locks.place(key, hero, p, { x: x + (gait ? t * (part.state === 'run' ? 385 : 220) * (side ? -1 : 1) : 0), y, flip: !!side, scale: .7, dt });
    drawing.__actor = key; drawing.__dt = dt;
    if (!rig.draw(ctx, hero, drawing, x, y, !!side, .7, null, dt)) throw Error(`Draw failed: ${name}`);
  }
  frame++;
  return canvas.toDataURL('image/png');
}
async function protectedHashes() {
  const c = document.createElement('canvas'); c.width = 400; c.height = 320; const x = c.getContext('2d');
  const result = {};
  for (const h of heroes.filter(h => !['teknium', 'nous_girl', 'turbofit'].includes(h))) {
    result[h] = {};
    for (const name of Object.keys(POSES).filter(n => n.startsWith(h + '_'))) for (const flip of [false, true]) {
      x.clearRect(0, 0, 400, 320);
      rig.draw(x, h, { ...POSES[name], __pose: name, __phase: name.endsWith('_active') ? 'active' : null, __pt: 1 / 60 }, 200, 180, flip, .7);
      const bytes = x.getImageData(0, 0, 400, 320).data;
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      result[h][name + ':' + flip] = [...new Uint8Array(digest)].map(v => v.toString(16).padStart(2, '0')).join('');
    }
  }
  return result;
}
window.polish = { moves, start, draw, protectedHashes, states: ['idleA', 'idleB', 'idleC', 'walk', 'run', 'jump', 'turn', 'grabHold', 'grabbed', 'stagger', 'hurt-down-getup', 'taunt', 'victory'] };
