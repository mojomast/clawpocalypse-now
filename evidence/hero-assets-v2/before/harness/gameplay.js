// Scratch evidence harness: gameplay-scale (RIG_SCALE 0.7, FEET_SCREEN 63) captures on the sewer art.
import { createRig, POSES, FOOT_Y, HERO_CHAIN } from '../rig.js';
import '../don.js';
import { createAnim } from '../anim.js';
import { createFootLocks } from '../foot-lock.js';
import { HERO_MOVES_COMBAT } from '../hero-moves.js';
import { HERO_RIGS } from '../hero-rigs.js';
const hero = new URLSearchParams(location.search).get('hero');
const rig = createRig();
const files = [...new Set(Object.values(HERO_RIGS[hero]).map(p => p.file))];
for (let i = 0; i < 400 && files.some(f => !rig.images[hero]?.[f]); i++) await new Promise(r => setTimeout(r, 20));
if (files.some(f => !rig.images[hero]?.[f])) throw Error('rig images not loaded');
const bg = new Image(); bg.src = 'assets/sewer.jpg'; await bg.decode();
const c = document.getElementById('c'), ctx = c.getContext('2d');
ctx.imageSmoothingEnabled = true;
ctx.drawImage(bg, 0, 0, bg.width * 540 / bg.height, 540);
const chain = HERO_CHAIN[hero], fin = HERO_MOVES_COMBAT[hero].finisher.name;
const shots = [['idleA', null], ['walk2', null], ['run1', null], [`${chain[0]}_active`, 'active'], [`${fin}_active`, 'active'], ['jump', null], ['flinch', null], ['down', null]];
const W = 112, feetY = 430, RIG_SCALE = 0.7, FEET_SCREEN = 63;
const crops = [];
shots.forEach(([p, phase], i) => {
  const name = `${hero}_${p}`, x = 60 + i * W, flip = i % 2 === 1;
  const anim = createAnim(), locks = createFootLocks();
  let d;
  for (let k = 0; k < 40; k++) d = anim.step('g', name, { phase, dur: 0.2, walkT: /walk|run/.test(p) ? 0.13 : null, walkRate: 8 }, 1 / 60, k / 60);
  const angles = locks.place('g', hero, d, { x, y: feetY - FEET_SCREEN, flip, scale: RIG_SCALE });
  ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(x, feetY + 2, 18, 5, 0, 0, 7); ctx.fill();
  rig.draw(ctx, hero, angles, x, feetY - FEET_SCREEN, flip, RIG_SCALE);
  crops.push({ pose: p, flip, x: x - W / 2, y: feetY - 190, w: W, h: 205 });
});
ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(0, 0, 960, 22); ctx.fillStyle = '#fff'; ctx.font = '13px monospace';
ctx.fillText(`${hero} at gameplay scale (RIG_SCALE 0.7, 960x540 canvas) · alternating facing · ${shots.map(s => s[0]).join(' ')}`, 6, 15);
// 3x nearest crop strip of the hero row
const z = document.createElement('canvas'); z.width = 3 * W * shots.length; z.height = 3 * 205 + 24;
const zc = z.getContext('2d'); zc.imageSmoothingEnabled = false; zc.fillStyle = '#111'; zc.fillRect(0, 0, z.width, z.height);
crops.forEach((cr, i) => { zc.drawImage(c, cr.x, cr.y, cr.w, cr.h, i * 3 * W, 24, 3 * W, 3 * cr.h); zc.fillStyle = '#fff'; zc.font = '14px monospace'; zc.fillText(`${cr.pose} ${cr.flip ? 'L' : 'R'}`, i * 3 * W + 4, 16); });
window.__gameplay = { png: c.toDataURL('image/png'), crop: z.toDataURL('image/png') };
