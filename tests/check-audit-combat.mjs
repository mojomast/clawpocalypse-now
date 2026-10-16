import assert from 'node:assert/strict';
import { createState, update, damageNinja, throwPizza } from '../logic.js';
import { createCombat, combatStep, enemyAI } from '../combat.js';

const bossMod = await import('../boss.js');
const bosses = bossMod.createBosses({});

function makeNinja(extra = {}) {
  return {
    kind: 'brawler', dead: false, r: 14, x: 100, y: 400, z: 0,
    hp: 3, maxHp: 3, falling: false, down: 0, wake: 0, grabbed: false,
    vx: 0, vy: 0, stun: 0, token: false, tokenCd: 0, holdT: 0, waitT: 10,
    cool: 0, atk: null, move: null, phase: null, face: -1, ...extra,
  };
}

let cases = 0;

// 1. Ground bounce: a hard landing above the impact-speed threshold must bounce.
{
  const state = createState();
  state.hpMode = true;
  state.walkLevel = true;
  state.combat = createCombat(state);
  const n = makeNinja({ launchV: -500, z: 4, falling: true, groundBounce: false, ground: true });
  state.ninjas = [n];
  combatStep(state, 0.01);
  assert.equal(n.groundBounce, true, 'hard launch impact should ground-bounce');
  assert.ok(n.launchV > 0, 'bounce should produce upward velocity');
  cases++;

  // Full trajectory: exactly one bounce, then down/wake recovery (no loop).
  {
    const st = createState();
    st.hpMode = true;
    st.walkLevel = true;
    st.combat = createCombat(st);
    const m = makeNinja({ launchV: -500, z: 4, falling: true, groundBounce: false });
    st.ninjas = [m];
    let bounces = 0;
    let prevBounce = false;
    let sawDown = false;
    let sawWake = false;
    for (let f = 0; f < 200; f++) {
      combatStep(st, 1 / 60);
      if (!prevBounce && m.groundBounce) bounces++;
      prevBounce = m.groundBounce;
      if (m.down > 0) sawDown = true;
      if (m.wake > 0) sawWake = true;
    }
    assert.equal(bounces, 1, 'a hard launch must bounce exactly once');
    assert.equal(m.falling, false, 'trajectory must settle out of launch/falling');
    assert.ok(sawDown, 'settled trajectory enters down recovery');
    assert.ok(sawWake, 'settled trajectory enters wake recovery');
    cases++;
  }
}
// 1b. Below the threshold: no bounce; enemy enters down/wake recovery instead.
{
  const state = createState();
  state.hpMode = true;
  state.walkLevel = true;
  state.combat = createCombat(state);
  const n = makeNinja({ launchV: -200, z: 1, falling: true, groundBounce: false });
  state.ninjas = [n];
  combatStep(state, 0.01);
  assert.equal(n.groundBounce, false, 'soft impact must not bounce');
  assert.equal(n.falling, false, 'soft impact should leave the launch state');
  assert.ok(n.down > 0, 'soft impact should become a grounded recovery');
  cases++;
}
console.log('Ground bounce: hard impact bounces, soft impact recovers.');

// 2. Wake blocks attack entitlement and AI execution.
{
  const state = createState();
  state.hpMode = true;
  state.player = { x: 100, y: 400, r: 16, z: 0 };
  const waking = makeNinja({ wake: 0.45, token: false, waitT: 10 });
  state.ninjas = [waking];
  enemyAI(state, 0.016);
  assert.equal(waking.token, false, 'a waking enemy must not receive an attack token');
  assert.equal(waking.atk, null, 'a waking enemy must not start an attack');

  const awake = makeNinja({ wake: 0, token: false, waitT: 10 });
  const st2 = createState();
  st2.hpMode = true;
  st2.player = { x: 100, y: 400, r: 16, z: 0 };
  st2.ninjas = [awake];
  enemyAI(st2, 0.016);
  assert.equal(awake.token, true, 'an eligible awake enemy can receive a token');
  cases += 1;
}
// 2b. Real 60Hz wake loop: no HP loss and no attack while wake > 0; normal attack
// starts only after recovery completes.
{
  const state = createState();
  state.hpMode = true;
  state.holdWave = true;
  state.level = 0;
  Object.assign(state.player, { x: 100, y: 400, r: 16, z: 0 });
  createCombat(state);
  const n = makeNinja({ kind: 'striker', wake: 0.45, token: false, cool: 0, x: 60 });
  state.ninjas = [n];
  state.hp = 100;
  const startHp = state.hp;
  let sawAttackDuringWake = false;
  for (let f = 0; f < 28; f++) {
    combatStep(state, 1 / 60);
    if (n.wake > 0) {
      if (n.atk) sawAttackDuringWake = true;
      assert.equal(state.hp, startHp, 'HP must not change while wake remains');
    }
  }
  assert.equal(sawAttackDuringWake, false, 'no attack may be armed while wake > 0');

  let damaged = false;
  for (let f = 0; f < 200; f++) {
    const before = state.hp;
    combatStep(state, 1 / 60);
    if (state.hp < before) { damaged = true; break; }
  }
  assert.ok(damaged, 'after recovery the striker starts and damages normally');
  cases += 2;
}
console.log('Wake gating: waking enemies neither receive tokens nor attack and attacks resume after recovery.');

// 3. WeaponLevel boundary controls pizza piercing.
{
  const s2 = createState(); s2.weaponLevel = 2;
  throwPizza(s2);
  assert.equal(s2.pizzas[0].piercing, false, 'level 2 shots are not piercing');
  const s3 = createState(); s3.weaponLevel = 3;
  throwPizza(s3);
  assert.equal(s3.pizzas[0].piercing, true, 'level 3 shots are piercing');
  cases++;
}
// 3b. Non-piercing pizza damages only the first overlapped enemy.
{
  const a = makeNinja({ x: 100 });
  const b = makeNinja({ x: 100 });
  const state = createState();
  state.hpMode = true; state.holdWave = true; state.level = 0; state.wave = 1;
  state.player = { x: 200, y: 400, r: 16, z: 0 };
  const pizzaNon = { x: 100, y: 400, vx: 0, vy: 0, r: 8, dead: false, piercing: false };
  state.ninjas = [a, b];
  state.pizzas = [pizzaNon];
  update(state, 0.016);
  assert.equal(a.hp, 2, 'first target takes the non-piercing hit');
  assert.equal(b.hp, 3, 'second target must not be damaged by a non-piercing shot');
  assert.equal(state.combo, 1, 'only one combo credit for a non-piercing hit');
  assert.equal(pizzaNon.dead, true, 'non-piercing shot is consumed');
  assert.equal(state.pizzas.length, 0, 'non-piercing shot is filtered out after use');
  cases++;
}
// 3c. Piercing pizza damages every overlapped enemy.
{
  const a = makeNinja({ x: 100 });
  const b = makeNinja({ x: 100 });
  const state = createState();
  state.hpMode = true; state.holdWave = true; state.level = 0; state.wave = 1;
  state.player = { x: 200, y: 400, r: 16, z: 0 };
  const pizzaPiercing = { x: 100, y: 400, vx: 0, vy: 0, r: 8, dead: false, piercing: true };
  state.ninjas = [a, b];
  state.pizzas = [pizzaPiercing];
  update(state, 0.016);
  assert.equal(a.hp, 2, 'piercing first target');
  assert.equal(b.hp, 2, 'piercing second target');
  assert.equal(state.combo, 2, 'two combo credits for a piercing hit');
  assert.equal(pizzaPiercing.dead, false, 'piercing shot survives');
  assert.equal(state.pizzas.length, 1, 'piercing shot remains active');
  cases++;
}
console.log('Pizza piercing: non-piercing single-target, piercing multi-target.');

// 4. Pizza respects the same recovery immunity as melee.
{
  const makeState = extra => {
    const n = makeNinja({ x: 100, ...extra });
    const pizza = { x: 100, y: 400, vx: 0, vy: 0, r: 8, dead: false, piercing: false };
    const state = createState();
    state.hpMode = true; state.holdWave = true; state.level = 0; state.wave = 1;
    state.player = { x: 200, y: 400, r: 16, z: 0 };
    state.ninjas = [n];
    state.pizzas = [pizza];
    return { state, n, pizza };
  };

  // eligible target takes damage
  {
    const { state, n } = makeState({});
    update(state, 0.016);
    assert.equal(n.hp, 2, 'eligible target takes pizza damage');
    assert.equal(state.combo, 1, 'eligible pizza hit grants combo');
  }
  // wake/down/grabbed targets are immune
  for (const extra of [{ wake: 0.4 }, { down: 0.4 }, { grabbed: true }]) {
    const { state, n, pizza } = makeState(extra);
    const beforeCombo = state.combo;
    update(state, 0.016);
    assert.equal(n.hp, 3, `recovering/grabbed target immune: ${JSON.stringify(extra)}`);
    assert.equal(state.combo, beforeCombo, 'immune pizza hit grants no combo');
    assert.equal(pizza.dead, false, 'missed immune target leaves pizza active');
  }
  // A recovering target must not consume the shot before an eligible one behind it.
  const { state: st0, pizza: pz0 } = makeState({ wake: .4 });
  const target = makeNinja();
  st0.ninjas.push(target);
  update(st0, 0.016);
  assert.equal(target.hp, 2, 'shot passes the immune enemy and hits an eligible target');
  assert.equal(pz0.dead, true, 'eligible pizza hit consumes shot');
  cases++;
}
console.log('Pizza immunity: eligible hit damages; wake/down/grab immune.');

function adoptBoss(invulnOverride = null, advance = 0, kind = 'boss', rider = false, levelBoss = true) {
  const state = createState();
  state.hpMode = true; state.level = 0; state.difficulty = 'normal'; state.wave = 2;
  const n = { kind, dead: false, levelBoss, rider, r: 24, x: 200, y: 400, z: 0,
    hp: 20, maxHp: 20, falling: false, down: 0, wake: 0, grabbed: false, vx: 0, vy: 0,
    atk: null, phase: null, move: null };
  state.ninjas = [n];
  bosses.step(state, 0.016);
  const b = state.bossFight.active;
  if (advance > 0) bosses.step(state, advance);
  if (invulnOverride !== null) b.invuln = invulnOverride;
  return { state, n, b };
}

// 5. Invulnerable boss hit grants no side effects.
{
  const { state, n, b } = adoptBoss(1.1, 0);
  state.player = { x: 200, y: 400, r: 16, z: 0 };
  state.pizzas = [{ x: n.x, y: n.y, vx: 0, vy: 0, r: 8, dead: false, piercing: false }];
  const beforeHp = n.hp;
  const beforeCombo = state.combo;
  const beforeScore = state.score;
  const beforePowerups = state.powerups.length;
  const beforeBHp = b.hp;
  update(state, 0.016);
  bosses.step(state, 0.016);
  assert.equal(n.hp, beforeHp, 'invulnerable boss HP must not change');
  assert.equal(b.hp, beforeBHp, 'boss account HP must not change');
  assert.equal(state.combo, beforeCombo, 'no combo credit on immune boss hit');
  assert.equal(state.score, beforeScore, 'no score on immune boss hit');
  assert.equal(n.dead, false, 'immune boss must not die');
  assert.equal(state.powerups.length, beforePowerups, 'immune boss grants no drops');
  const timer = state.comboTimer;
  damageNinja(state, n, 100000, () => { throw new Error('immune hit must not roll a drop'); });
  assert.equal(n.hp, beforeHp, 'lethal-strength immune hit is rejected before damage');
  assert.equal(n.dead, false);
  assert.equal(state.comboTimer, timer, 'immune hit does not extend the combo timer');
  assert.equal(state.score, beforeScore);
  cases++;
}
// 5b. Vulnerable boss hit still applies damage/score/combo.
{
  const { state, n, b } = adoptBoss(0, 1.2);
  b.invuln = 0;
  state.player = { x: 200, y: 400, r: 16, z: 0 };
  state.pizzas = [{ x: n.x, y: n.y, vx: 0, vy: 0, r: 8, dead: false, piercing: false }];
  const beforeBHp = b.hp;
  const beforeCombo = state.combo;
  const beforeScore = state.score;
  update(state, 0.016);
  bosses.step(state, 0.016);
  assert.ok(b.hp < beforeBHp, 'vulnerable boss HP decreases');
  assert.ok(state.combo > beforeCombo, 'vulnerable boss hit grants combo');
  assert.ok(state.score > beforeScore, 'vulnerable boss hit grants score');
  assert.equal(n.dead, false, 'nonfatal vulnerable boss survives');
  cases++;
}
// 5c. Vulnerable boss damage can cause death and drops.
{
  const { state, n, b } = adoptBoss(0, 1.2);
  b.invuln = 0;
  const beforePowerups = state.powerups.length;
  damageNinja(state, n, 100000, () => 0.5);
  assert.equal(n.dead, true, 'lethal vulnerable boss damage marks boss dead');
  assert.ok(state.powerups.length > beforePowerups, 'vulnerable boss death grants drops');
  cases++;
}
// 5d. Adopted non-boss kind (rider) is still gated during invulnerability.
{
  const { state, n, b } = adoptBoss(1.1, 0, 'rider', true, true);
  assert.equal(n.kind, 'rider', 'adopt must not force kind to boss');
  assert.ok(!!b && b.invuln > 0, 'rider boss must be adopted and invulnerable');
  state.player = { x: 200, y: 400, r: 16, z: 0 };
  const beforeHp = n.hp;
  const beforeCombo = state.combo;
  const beforeScore = state.score;
  const beforePowerups = state.powerups.length;
  const beforeBHp = b.hp;
  const result = damageNinja(state, n, 3);
  assert.equal(result, null, 'immune rider hit returns null');
  assert.equal(n.hp, beforeHp, 'immune rider HP must not change');
  assert.equal(b.hp, beforeBHp, 'immune rider boss HP must not change');
  assert.equal(state.combo, beforeCombo, 'immune rider hit grants no combo');
  assert.equal(state.score, beforeScore, 'immune rider hit grants no score');
  assert.equal(n.dead, false, 'immune rider must not die');
  assert.equal(state.powerups.length, beforePowerups, 'immune rider grants no drops');
  cases++;

  // real pizza path on the same invulnerable rider
  const pstate = state;
  pstate.pizzas = [{ x: n.x, y: n.y, vx: 0, vy: 0, r: 8, dead: false, piercing: false }];
  update(pstate, 0.016);
  bosses.step(pstate, 0.016);
  assert.equal(n.hp, beforeHp, 'pizza path does not bypass rider immunity');
  assert.equal(state.combo, beforeCombo, 'pizza path grants no combo to immune rider');
  assert.equal(state.score, beforeScore, 'pizza path grants no score to immune rider');
}
// 5e. Object.create(state) P2 view inherits bossFight and still gates immunity.
{
  const owner = createState();
  owner.hpMode = true; owner.level = 0; owner.difficulty = 'normal'; owner.wave = 2;
  const n = { kind: 'rider', dead: false, levelBoss: true, rider: true, r: 24, x: 200, y: 400, z: 0,
    hp: 20, maxHp: 20, falling: false, down: 0, wake: 0, grabbed: false, vx: 0, vy: 0,
    atk: null, phase: null, move: null };
  owner.ninjas = [n];
  bosses.step(owner, 0.016);
  const b = owner.bossFight.active;
  b.invuln = 1.1;

  const view = Object.create(owner);
  Object.assign(view, { combo: 0, score: 0, hp: owner.hp, maxHp: owner.maxHp, powerups: owner.powerups });

  const beforeHp = n.hp;
  const beforeCombo = view.combo;
  const beforeScore = view.score;
  const beforePowerups = view.powerups.length;
  const beforeBHp = b.hp;
  const result = damageNinja(view, n, 3);
  assert.equal(result, null, 'P2 view immune hit returns null');
  assert.equal(n.hp, beforeHp, 'P2 view does not damage immune rider HP');
  assert.equal(b.hp, beforeBHp, 'P2 view does not change boss HP');
  assert.equal(view.combo, beforeCombo, 'P2 view grants no combo on immune hit');
  assert.equal(view.score, beforeScore, 'P2 view grants no score on immune hit');
  assert.equal(view.powerups.length, beforePowerups, 'P2 view grants no drops on immune hit');
  cases += 2;
}
console.log('Boss damage: immune hit has no side effects; vulnerable hit works; adopted rider and P2 view gated.');

console.log(`CatJam audit combat: ${cases} behavioral cases passed.`);
