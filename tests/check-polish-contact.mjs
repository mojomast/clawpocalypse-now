// Real combat eligibility, visual reach and hit-stop, not a screenshot of a box.
import assert from 'node:assert/strict';
import { createState } from '../logic.js';
import { MOVES, createCombat, combatStep, attackBox, boxHits, hurtbox } from '../combat.js';
import { HERO_MOVES_COMBAT } from '../hero-moves.js';
import { contactShape, contactPose } from '../polish-contact.js';
import { createAnim } from '../anim.js';
import { POSES, solve, createRig } from '../rig.js';
import { GRAB_MOVES } from '../grab.js';
const attacks = hero => [...MOVES.punch.map((m, i) => ({ ...m, chain: i + 1, ...(i === 3 ? HERO_MOVES_COMBAT[hero].finisher : {}) })),
  MOVES.kick, MOVES.launcher, MOVES.jumpKick, MOVES.juggle, MOVES.dashAttack, MOVES.backAttack, HERO_MOVES_COMBAT[hero].special];
let cases = 0;
for (const hero of ['teknium', 'nous_girl', 'turbofit']) for (const move of attacks(hero)) for (const facing of [-1, 1]) {
  const state = createState(); Object.assign(state, { hero, selectedHero: hero, hpMode: true, coopSecondary: true, ninjas: [] });
  Object.assign(state.player, { x: 500, y: 410, z: 0 });
  createCombat(state); const c = state.combat;
  Object.assign(c, { attack: move, phase: 'wind', timer: move.wind, chain: move.chain || 1, facing, attackFacing: move.behind ? -facing : facing });
  const shape = contactShape(state, move), box = attackBox(state, move);
  assert.ok(!box.empty, `${hero}/${move.name}/${move.chain || ''}: authored contact does not reach its attack side`);
  if (shape && !shape.area) {
    assert.ok(box.x0 >= shape.x0 && box.x1 <= shape.x1 && box.top >= shape.top && box.bot <= shape.bot, `${hero}/${move.name}: damaging box extends outside visible contact envelope`);
  }
  const n = { x: (box.x0 + box.x1) / 2, y: state.player.y, r: 16, hp: 100, maxHp: 100, kind: 'brawler', face: -facing, z: 0, stun: 0, juggle: !!move.juggle };
  assert.ok(boxHits(box, n), 'inside target rejected');
  const hw = (hurtbox(n).x1 - hurtbox(n).x0) / 2;
  assert.ok(!boxHits(box, { ...n, x: box.x1 + hw + .01 }), 'outside target hit');
  assert.ok(!boxHits(box, { ...n, y: n.y + box.depth + .01 }), 'outside lane hit');
  state.ninjas = [n];
  const effects = []; state.fxCue = (type, data) => effects.push({ type, ...data });
  const anim = createAnim(), name = contactPose(state, move), wind = name.replace('_active', '_wind');
  for (let f = 0; c.phase === 'wind' && f < 100; f++) {
    combatStep(state, 1 / 120);
    assert.equal(n.hp, 100, `${hero}/${move.name}: damage in wind-up`);
    anim.step(hero, wind, { phase: 'wind', dur: move.wind }, 1 / 120, f / 120);
  }
  assert.equal(c.phase, 'active');
  combatStep(state, 1 / 120);
  assert.ok(n.hp < 100, `${hero}/${move.name}: contact frame did not hit its visual target`);
  assert.ok(c.hitStop > 0, 'contact did not stop');
  const pose = anim.step(hero, name, { phase: 'active', dur: move.active }, 0, 1);
  assert.ok(Math.abs(pose.weapon - POSES[name].weapon) < 1e-8, 'hit-stop froze wind-up instead of contact');
  const frozen = structuredClone(pose), hp = n.hp;
  combatStep(state, 1 / 120);
  assert.equal(n.hp, hp, 'hit-stop applied damage again');
  assert.deepEqual(anim.step(hero, name, { phase: 'active', dur: move.active }, 0, 2), frozen);
  const impact = effects.find(e => e.type === 'hit');
  assert.ok(impact && impact.x >= box.x0 - 1 && impact.x <= box.x1 + 1 && impact.y >= box.top - 1 && impact.y <= box.bot + 1, 'spark outside contact box');
  cases++;
}
console.log(`Visual contact: ${cases} actual combat hits, both facings; no anticipation damage, bounded melee reach, aligned sparks and frozen contact frames.`);

// Pose selection only; image decoding is verified separately by browser tests.
globalThis.Image = class {};
const selector = createRig();
delete globalThis.Image;
for (const hero of ['teknium', 'nous_girl', 'turbofit']) {
  for (const move of [GRAB_MOVES.knee, GRAB_MOVES.kneeFinal]) {
    const state = { hero, combat: { attack: move, phase: 'active' } };
    const name = selector.playerPose(state);
    assert.match(name, /_kick_knee(?:Final)?_active$/, 'held hit must select a supported knee lift');
    const sol = solve(hero, POSES[name], { poseName: name, animated: true });
    assert.deepEqual(sol.contacts, ['back'], `${name}: striking knee must not be planted`);
    assert.ok(sol.M.shin[5] < sol.M.shin_b[5] - 15, `${name}: knee lift not readable`);
  }
  if (hero !== 'nous_girl') {
    const second = hero === 'teknium' ? 'bladeB' : 'axeB';
    const a = solve(hero, POSES[`${hero}_${second}_active`], { poseName: `${hero}_${second}_active`, animated: true });
    const b = solve(hero, POSES[`${hero}_hook_active`], { poseName: `${hero}_hook_active`, animated: true });
    assert.ok(Math.hypot(a.M.hand[4] - b.M.hand[4], a.M.hand[5] - b.M.hand[5]) > 15, `${hero}: J2/J3 hand silhouettes too similar`);
  }
}

for (const hero of ['teknium', 'nous_girl', 'turbofit']) for (const move of Object.values(GRAB_MOVES)) for (const facing of [-1, 1]) {
  const s = createState(); Object.assign(s, { hero, hpMode: true, coopSecondary: true }); createCombat(s);
  const n = { x: s.player.x + facing * 30, y: s.player.y, r: 16, hp: 100, maxHp: 100, kind: 'brawler', grabbed: true, stun: 1, z: 0 };
  s.ninjas = [n];
  Object.assign(s.combat, { facing, attackFacing: facing, attack: move, phase: 'active', timer: move.active, grab: { n, t: 2, knees: 1 } });
  const hits = []; s.fxCue = (type, data) => { if (type === 'hit') hits.push(data); };
  combatStep(s, 1 / 120);
  assert.ok(n.hp < 100, `${hero}/${move.label}: pinned target did not take damage`);
  assert.ok(hits[0] && hits[0].y < s.player.y - 20, `${hero}/${move.label}: impact spark is at the floor instead of the held body`);
  assert.ok(s.combat.hitStop > 0, `${hero}/${move.label}: missing contact stop`);
}
console.log('Held contact: 24 knee/throw cases, both facings; raised-body impact and hit-stop.');

for (const hero of ['teknium', 'nous_girl', 'turbofit']) for (const move of [MOVES.dash, MOVES.dodgeRoll]) {
  const s = createState(); Object.assign(s, { hero, hpMode: true, coopSecondary: true, level: null }); createCombat(s);
  const n = { x: s.player.x + 20, y: s.player.y, r: 16, hp: 100, maxHp: 100, kind: 'brawler' }; s.ninjas = [n];
  Object.assign(s.combat, { attack: move, phase: 'wind', timer: move.wind, facing: 1, attackFacing: 1 });
  for (let f = 0; f < 120; f++) combatStep(s, 1 / 60);
  assert.equal(n.hp, 100, `${hero}/${move.name}: locomotion unexpectedly damaged a target`);
}
{
  const s = createState(); Object.assign(s, { hero: 'turbofit', hpMode: true, coopSecondary: true }); createCombat(s);
  const move = HERO_MOVES_COMBAT.turbofit.special;
  const n = { x: s.player.x + 40, y: s.player.y, r: 16, hp: 100, maxHp: 100, kind: 'brawler', stun: 0 }; s.ninjas = [n];
  Object.assign(s.combat, { attack: move, phase: 'wind', timer: move.wind, facing: 1, attackFacing: 1 });
  for (let f = 0; f < 180; f++) combatStep(s, 1 / 120);
  assert.equal(100 - n.hp, move.dmg * 2, 'Power Chord must retain both contact pulses');
}
