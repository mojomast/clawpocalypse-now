import assert from 'node:assert/strict';
import { createState, damageNinja, effectiveHit, update } from '../logic.js';
import { createShop } from '../shop.js';
import { createCombat, combatStep, attackBox, MOVES } from '../combat.js';
import { releaseGrab, GRAB_MOVES } from '../grab.js';

const target = (hp = 20, kind = 'brawler') => ({ kind, hp, maxHp: hp, x: 520, y: 400, r: 16, vx: 0, vy: 0, dead: false });
const state = () => { const s = createState(); Object.assign(s, { hpMode: true, wave: 1, dmgMult: 1.15, coins: 0 }); return s; };
const rand = () => 1; // no random drops except guaranteed boss drops

// Carry fractions per enemy across genuine contacts, not across ambient HP loss.
{
  const s = state(), n = target(); s.ninjas = [n]; const shop = createShop(); shop.stepWorld(s);
  const hazard = effectiveHit(s, n, 4, rand, { source: 'hazard' });
  assert.deepEqual([hazard.owner, hazard.amount, hazard.bonus, n.hp], [null, 4, 0, 16]);
  n.hp -= 2; shop.stepWorld(s); assert.equal(n.hp, 14); assert.equal(shop.stats.extraDmg, 0);
  const a = effectiveHit(s, n, 4, rand, { owner: 'p1', source: 'melee' });
  const b = effectiveHit(s, n, 4, rand, { owner: 'p2', source: 'projectile' });
  assert.deepEqual([a.bonus, b.bonus, a.amount, b.amount, n.hp], [0, 1, 4, 5, 5]);
  shop.stepWorld(s); assert.equal(shop.stats.extraDmg, 1);
  const kill = effectiveHit(s, n, 4, rand, { owner: 'p1', source: 'melee' });
  assert.equal(kill.killed, false); // 5 HP -> 1 HP, next hit kills
  const finish = effectiveHit(s, n, 1, rand, { owner: 'p1', source: 'melee' });
  assert.equal(finish.killed, true);
  assert.equal(effectiveHit(s, n, 99, rand, { owner: 'p2', source: 'melee' }).dead, true);
  shop.stepWorld(s); shop.stepWorld(s);
  assert.equal(s.coins, 1, 'one KO coin');
  assert.equal(s.powerups.length, 0, 'one drop roll, deterministic miss');
  assert.equal(shop.stats.extraDmg, 1, 'only actual extra HP counted');
}
// Shared P2 view uses P1 purchase, without an independent second multiplier.
{
  const s = state(), n = target(); s.dmgMult = 1.5;
  const v = Object.assign(Object.create(s), { hitOwnerState: s, combo: 0, score: 0 });
  const hit = effectiveHit(v, n, 4, rand, { owner: 'p2', source: 'projectile' });
  assert.deepEqual([hit.amount, hit.bonus, n.hp, s.shopExtraDmg], [6, 2, 14, 2]);
  assert.equal(v.combo, 1); assert.equal(s.combo, 0);
  assert.equal(effectiveHit(s, n, 4, rand, { source: 'assist' }).bonus, 0);
  assert.equal(effectiveHit(s, n, 4, rand, { source: 'machine' }).bonus, 0);
  assert.equal(effectiveHit(s, n, 4, rand, { owner: 'p1', source: 'melee', blocked: true }).blocked, true);
  for (const source of ['hazard', 'assist', 'machine', 'thrown-body']) {
    const hp = n.hp, extras = s.shopExtraDmg;
    assert.equal(effectiveHit(s, n, 1, rand, { owner: 'p1', source }).bonus, 0, `${source} cannot inherit P1 upgrade`);
    assert.equal(n.hp, hp - 1); assert.equal(s.shopExtraDmg, extras);
  }
}
// A bonus-assisted kill is scored and dropped exactly once, including its
// effective bonus damage; subsequent hits cannot farm score or rewards.
{
  const s = state(), n = target(5, 'trooper'); s.dmgMult = 1.5; s.ninjas = [n];
  const shop = createShop(); shop.stepWorld(s);
  const hit = effectiveHit(s, n, 4, () => 0, { owner: 'p1', source: 'melee' });
  assert.deepEqual([hit.killed, hit.amount, hit.bonus], [true, 5, 1]);
  const score = s.score, combo = s.combo, drops = s.powerups.length;
  assert.equal(drops, 1); assert.equal(effectiveHit(s, n, 4, () => 0, { owner: 'p2', source: 'melee' }).dead, true);
  assert.deepEqual([s.score, s.combo, s.powerups.length], [score, combo, drops]);
  shop.stepWorld(s); shop.stepWorld(s); assert.equal(s.coins, 1); assert.equal(shop.stats.extraDmg, 1);
}
// Normal no-upgrade damage and legacy result; lethal bonus is calculated before
// death, but overkill is not reported as extra HP removed.
{
  const s = state(), n = target(2); s.dmgMult = 1;
  assert.equal(damageNinja(s, n, 2, rand), n);
  assert.equal(n.dead, true); assert.equal(s.shopExtraDmg || 0, 0);
  const t = target(2); s.dmgMult = 1.5;
  const out = effectiveHit(s, t, 2, rand, { owner: 'p1', source: 'melee' });
  assert.deepEqual([out.killed, out.amount, out.bonus, s.shopExtraDmg || 0], [true, 2, 0, 0]);
}
// Real projectile resolution uses P1 attribution and one contact per nonpiercing pie.
{
  const s = state(), n = target(12); s.dmgMult = 2; s.ninjas = [n];
  s.pizzas = [{ x: n.x, y: n.y, vx: 0, vy: 0, r: 8, dead: false, piercing: false }];
  update(s, 0.001, rand);
  assert.equal(n.hp, 10); assert.equal(s.shopExtraDmg, 1);
}
// Adopted rider immunity rejects both direct contact and all combat feedback.
{
  const s = state(), n = target(50, 'rider'); s.ninjas = [n]; s.player.x = 480; s.player.y = 400;
  s.bossFight = { active: { n, invuln: 2 } }; createCombat(s);
  const move = MOVES.punch[0], c = s.combat;
  Object.assign(c, { attack: move, phase: 'wind', timer: move.wind, chain: 1, facing: 1, attackFacing: 1 });
  n.x = (attackBox(s, move).x0 + attackBox(s, move).x1) / 2;
  const cues = []; s.audioCue = cue => cues.push(cue); s.fxCue = cue => cues.push(cue);
  for (let i = 0; i < 120 && c.landed === 0 && c.phase !== 'rec'; i++) combatStep(s, 1 / 120);
  assert.equal(n.hp, 50); assert.equal(c.landed, 0); assert.equal(s.combo, 0);
  assert.equal(n.react || null, null); assert.equal(n.stun || 0, 0);
  assert.equal(cues.includes('melee'), false); assert.equal(cues.includes('hit'), false);
  const immune = effectiveHit(s, n, 99, rand, { owner: 'p2', source: 'projectile' });
  assert.equal(immune.immune, true); assert.equal(immune.amount, 0);
  assert.equal(effectiveHit(s, n, 2, rand, { owner: 'p1', source: 'melee', blocked: true }).immune, true);
  s.pizzas = [{ x: n.x, y: n.y, vx: 0, vy: 0, r: 8, piercing: false, dead: false }];
  update(s, 0.001, rand);
  assert.equal(s.pizzas.length, 0, 'immune phase consumes a nonpiercing projectile without hit feedback');
  assert.equal(s.shopExtraDmg || 0, 0);
}
// A synthetic held adopted boss exercises the release caller contract even
// though normal grab eligibility excludes it. Immunity cannot manufacture KO.
{
  const s = state(), n = target(25, 'rider'); n.grabbed = true; s.ninjas = [n];
  s.bossFight = { active: { n, invuln: 3 } }; createCombat(s);
  s.combat.grab = { n, knees: 0 };
  const cues = []; s.audioCue = cue => cues.push(cue);
  releaseGrab(s, GRAB_MOVES.screenThrow);
  assert.equal(n.grabbed, false); assert.equal(s.combat.grab, null);
  assert.equal(n.dead, false); assert.equal(n.hp, 25);
  assert.equal((s.screenThrows || []).length, 0); assert.equal(cues.includes('impact'), false);
  // The same caller through combat's final release must not produce a hit cue.
  n.grabbed = true; s.combat.grab = { n, knees: 0 };
  Object.assign(s.combat, { attack: GRAB_MOVES.screenThrow, phase: 'wind', timer: GRAB_MOVES.screenThrow.wind, attackFacing: 1, facing: 1 });
  s.fxCue = cue => cues.push(cue);
  for (let i = 0; i < 100 && s.combat.grab; i++) combatStep(s, 1 / 120);
  assert.equal(n.dead, false); assert.equal((s.screenThrows || []).length, 0);
  assert.equal(cues.includes('hit'), false); assert.equal(cues.includes('impact'), false);
}
// An immune adopted blocker must not even flash/parry as a guard contact.
{
  const s = state(), n = target(30, 'blocker'); n.face = -1; n.stun = 0;
  s.player.x = 480; s.player.y = 400; s.ninjas = [n];
  s.bossFight = { active: { n, invuln: 2 } }; createCombat(s);
  const move = MOVES.punch[0], c = s.combat; n.x = (attackBox(s, move).x0 + attackBox(s, move).x1) / 2;
  Object.assign(c, { attack: move, phase: 'wind', timer: move.wind, attackFacing: 1, facing: 1 });
  const cues = []; s.audioCue = cue => cues.push(cue); s.fxCue = cue => cues.push(cue);
  for (let i = 0; i < 100 && c.phase !== 'rec'; i++) combatStep(s, 1 / 120);
  assert.equal(n.hp, 30); assert.equal(c.landed, 0); assert.equal(n.guardHit || 0, 0);
  assert.equal(n.hitFlash || 0, 0); assert.equal(n.parry || false, false);
  assert.equal(cues.includes('block'), false); assert.equal(cues.includes('hit'), false);
}
// Piercing pizza touches each distinct target once; no bonus is inferred from
// unrelated changes to another target between world steps.
{
  const s = state(), a = target(10), b = target(10); s.dmgMult = 2;
  a.x = b.x = 520; s.ninjas = [a, b];
  s.pizzas = [{ x: 520, y: 400, vx: 0, vy: 0, r: 8, piercing: true, dead: false }];
  update(s, 0.001, rand);
  assert.deepEqual([a.hp, b.hp, s.shopExtraDmg], [8, 8, 2]);
}
// One heavy melee swing can resolve two independent eligible contacts, each
// receiving exactly one upgrade calculation before either KO/reward decision.
{
  const s = state(), move = MOVES.kick; s.dmgMult = 1.5;
  s.player.x = 480; s.player.y = 400; createCombat(s);
  const box = attackBox(s, move), x = (box.x0 + box.x1) / 2;
  const a = target(3), b = target(3); a.x = b.x = x; s.ninjas = [a, b];
  const shop = createShop(); shop.stepWorld(s);
  Object.assign(s.combat, { attack: move, phase: 'wind', timer: move.wind, attackFacing: 1, facing: 1 });
  for (let i = 0; i < 100 && s.combat.phase !== 'rec'; i++) combatStep(s, 1 / 120);
  assert.deepEqual([a.dead, b.dead, s.shopExtraDmg, s.combat.landed], [true, true, 2, 1]);
  shop.stepWorld(s); assert.equal(s.coins, 2);
}
console.log('effective hits: ownership, carry, lethal/KO, P2, projectile, guard and adopted immunity OK');
