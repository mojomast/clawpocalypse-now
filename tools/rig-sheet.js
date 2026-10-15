import { createRig, POSES, HEROES, HERO_MOVES, MECHANICS, REACTIONS } from '../rig.js';
import '../don.js';
import { HERO_RIGS } from '../hero-rigs.js';

const c = document.querySelector('#sheet');
const ctx = c.getContext('2d');
const rig = createRig();
const query = new URLSearchParams(location.search);
const hero = query.get('hero');
const common = ['idle', 'idleA', 'idleB', 'idleC', 'walk1', 'walk2', 'walk3', 'walk4', 'run', 'turn', 'jump', 'hurt', 'taunt', 'victory', 'punchWind', 'punch', 'kickWind', 'kick'];
const states = [...new Set([...REACTIONS, 'knockdownAir', 'down', 'downB', 'wake'])];
const heroMoves = Object.keys(HERO_MOVES[hero] || {});
const requested = [...common, ...states, ...heroMoves.flatMap(m => ['wind', 'active', 'recover', 'follow'].map(phase => `${m}_${phase}`)), ...MECHANICS.flatMap(m => ['wind', 'active', 'recover', 'follow'].map(phase => `${m}_${phase}`))];
const absent = [...new Set(requested.filter(p => !POSES[`${hero}_${p}`] && !POSES[p]).map(p => `${hero}_${p}`))];
const sharedFallbacks = [...new Set(requested.filter(p => !POSES[`${hero}_${p}`] && POSES[p]).map(p => ({ requested: `${hero}_${p}`, drawn: p })))];
const poses = [...Object.keys(POSES).filter(p => p.startsWith(`${hero}_`)), ...requested.filter(p => !POSES[`${hero}_${p}`] && POSES[p])];
const unique = [...new Set(poses)];
const missing = unique.filter(p => !Object.hasOwn(POSES, p));
const cols = 8, cellW = 184, cellH = 230, header = 80;
c.width = cols * cellW;
c.height = header + Math.ceil(unique.length * 2 / cols) * cellH;
ctx.fillStyle = '#171b2b'; ctx.fillRect(0, 0, c.width, c.height);
ctx.fillStyle = '#fff'; ctx.font = 'bold 25px monospace'; ctx.fillText(hero, 20, 34);
ctx.font = '15px monospace'; ctx.fillStyle = '#9da8c5'; ctx.fillText(`${unique.length} named poses · both facings · production rig`, 20, 59);

const files = [...new Set(Object.values(HERO_RIGS[hero] || {}).map(p => p.file))];
const assets = await Promise.all(files.map(async file => {
  const url = `../assets/heroes/${hero}/${file}`;
  try {
    const response = await fetch(url);
    if (!response.ok) return `${url}: HTTP ${response.status}`;
    const image = new Image(); image.src = url; await image.decode();
    return null;
  } catch (e) { return `${url}: ${e.message}`; }
}));
const failures = assets.filter(Boolean);
for (let retry = 0; !failures.length && files.some(file => !rig.images[hero]?.[file]) && retry < 250; retry++) await new Promise(resolve => setTimeout(resolve, 20));
for (const file of files) if (!rig.images[hero]?.[file]) failures.push(`production rig image not loaded: ${hero}/${file}`);
if (missing.length || failures.length || !HEROES.includes(hero)) {
  window.__rigSheet = { error: { hero, missing, failures, registered: HEROES.includes(hero) } };
} else {
  for (let i = 0; i < unique.length; i++) for (let side = 0; side < 2; side++) {
    const index = i * 2 + side, col = index % cols, row = Math.floor(index / cols), x = col * cellW, y = header + row * cellH;
    ctx.fillStyle = (row + col) % 2 ? '#252c40' : '#20273a'; ctx.fillRect(x, y, cellW, cellH);
    ctx.strokeStyle = '#34425d'; ctx.strokeRect(x + .5, y + .5, cellW - 1, cellH - 1);
    const pose = unique[i];
    ctx.fillStyle = '#d9e6ff'; ctx.font = '11px monospace';
    ctx.fillText(pose.length > 27 ? pose.slice(0, 27) : pose, x + 6, y + 16);
    ctx.fillStyle = '#99aace'; ctx.fillText(side ? 'LEFT' : 'RIGHT', x + 6, y + 31);
    ctx.strokeStyle = '#5d6780'; ctx.beginPath(); ctx.moveTo(x + 16, y + 205); ctx.lineTo(x + cellW - 16, y + 205); ctx.stroke();
    if (!rig.draw(ctx, hero, pose, x + cellW / 2, y + 108, !!side, .85)) failures.push(`draw failed: ${hero} ${pose}`);
  }
  window.__rigSheet = failures.length ? { error: { hero, missing, failures } } : { hero, poses: unique, absent, sharedFallbacks, facings: ['right', 'left'], assets: files, width: c.width, height: c.height, png: c.toDataURL('image/png') };
}
