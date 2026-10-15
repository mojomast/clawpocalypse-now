// Scratch audit metrics (pure node; production solve()).
import { readFileSync } from 'node:fs';
import { HERO_RIGS } from '../hero-rigs.js';
import '../don.js';
import { POSES, solve, apply, SOLES, FOOT_Y, PART_SCALE, HERO_MOVES, MECHANICS } from '../rig.js';
const hulls = JSON.parse(readFileSync('/tmp/hv2/hulls.json', 'utf8'));
const heroes = Object.keys(HERO_RIGS);
const deg = m => Math.atan2(m[1], m[0]) * 180 / Math.PI;
const out = {};
for (const h of heroes) {
  const T = HERO_RIGS[h];
  const pt = (sol, n, u, v) => apply(sol.M[n], (u - T[n].px) * sol.S[n][0], (v - T[n].py) * sol.S[n][1]);
  const idle = solve(h, POSES[`${h}_idleA`], { poseName: `${h}_idleA`, animated: true });
  // proportions in idle (rig px, scale 1)
  const L = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const shoulder = pt(idle, 'uarm', T.uarm.px, T.uarm.py), elbow = pt(idle, 'farm', T.farm.px, T.farm.py);
  const farmTip = (() => { let best = null; for (const [u, v] of hulls[h].farm) { const p = pt(idle, 'farm', u, v); const d = L(p, elbow); if (!best || d > best) best = d; } return best; })();
  const hip = pt(idle, 'thigh', T.thigh.px, T.thigh.py), knee = pt(idle, 'shin', T.shin.px, T.shin.py);
  const sole = Math.max(...SOLES[h].map(([u, v]) => L(pt(idle, 'shin', u, v), knee)));
  let top = Infinity; for (const [u, v] of hulls[h].head) top = Math.min(top, pt(idle, 'head', u, v)[1]);
  const torsoH = T.torso.h * ((PART_SCALE[h]?.torso || [1, 1])[1]);
  const height = FOOT_Y - top;
  // per-pose metrics
  let weaponBelow = [], footTilt = [], torsoRot = 0, headRot = 0, n = 0, tiltOver10 = 0, grounded = 0;
  const states = ['idleA','idleB','idleC','walk1','walk2','walk3','walk4','run1','run2','run3','run4','turn','jump','taunt','victory','flinch','stagger','knockdownAir','down','downB','wake','grabHold','grabbed'];
  const reach = [...states, ...[...Object.keys(HERO_MOVES[h] || {}), ...MECHANICS].flatMap(m => ['wind','active','recover','follow'].map(ph => `${m}_${ph}`))];
  const poses = [...new Set(reach.map(p => `${h}_${p}`))].filter(p => POSES[p]);
  const tilts = [];
  for (const p of poses) {
    const sol = solve(h, POSES[p], { poseName: p, animated: true });
    n++;
    torsoRot = Math.max(torsoRot, Math.abs(deg(sol.M.torso)));
    headRot = Math.max(headRot, Math.abs(deg(sol.M.head)));
    if (sol.order.includes('weapon') && !/down|downB/.test(p)) {
      const ys = hulls[h].weapon.map(([u, v]) => pt(sol, 'weapon', u, v)[1]);
      const pen = Math.max(...ys) - FOOT_Y; if (pen > 2) weaponBelow.push([p.replace(h + '_', ''), +pen.toFixed(1)]);
    }
    for (const side of sol.contacts) {
      const s = side === 'front' ? 'shin' : 'shin_b';
      const [a, b] = SOLES[h].map(([u, v]) => pt(sol, s, u, v));
      const tilt = Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI; // 0 = sole flat; + = toe down
      tilts.push(Math.abs(tilt)); if (/idleA$/.test(p)) out.__idle = (out.__idle||{}); grounded++; if (Math.abs(tilt) > 10) { tiltOver10++; footTilt.push([p.replace(h + '_', ''), side, +tilt.toFixed(1)]); }
    }
  }
  footTilt.sort((a, b) => Math.abs(b[2]) - Math.abs(a[2]));
  weaponBelow.sort((a, b) => b[1] - a[1]);
  out[h] = { idleHeight: +height.toFixed(1), headH: T.head.h, torsoH, upperArm: +L(shoulder, elbow).toFixed(1), forearmToFist: +farmTip.toFixed(1),
    thigh: +L(hip, knee).toFixed(1), shinToSole: +sole.toFixed(1),
    armOverTorso: +((L(shoulder, elbow) + farmTip) / torsoH).toFixed(2), legOverTorso: +((L(hip, knee) + sole) / torsoH).toFixed(2), headOverHeight: +(T.head.h / height).toFixed(2),
    poses: n, maxTorsoRot: +torsoRot.toFixed(0), maxHeadRot: +headRot.toFixed(0), plantedContacts: grounded, plantedSoleTiltOver10: tiltOver10,
    worstSoleTilt: footTilt.slice(0, 4), weaponBelowFloorPoses: weaponBelow.length, medianSoleTilt: +tilts.sort((a,b)=>a-b)[tilts.length>>1].toFixed(1), idleSoleTilt: (() => { const sol = idle; return ['shin','shin_b'].map(s => { const [a,b] = SOLES[h].map(([u,v]) => pt(sol, s, u, v)); return +(Math.atan2(b[1]-a[1], b[0]-a[0])*180/Math.PI).toFixed(1); }); })(), worstWeaponBelow: weaponBelow.slice(0, 4) };
}
console.log(JSON.stringify(out, null, 1));
