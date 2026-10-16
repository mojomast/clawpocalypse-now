// Bounded early-telegraph check: enemy AI must start its wind-up through the shared
// windFor(state, spec) helper (WIND_SCALE by level) instead of raw spec.wind, while
// leaving every other balance value and the wake/stun recovery untouched.
//
// Scope note: this asserts the authored telegraph cue only. It does NOT rebalance
// HP, damage, reach, recovery, co-op party damage or continue counts.
import assert from 'node:assert/strict';
import { createState, H } from '../logic.js';
import { enemyAI, windFor, WIND_SCALE } from '../combat.js';
import * as combatMod from '../combat.js';

function makeNinja(extra = {}) {
  return {
    kind: 'brawler', dead: false, r: 14, x: 140, y: 400, z: 0,
    hp: 3, maxHp: 3, falling: false, down: 0, wake: 0, grabbed: false,
    vx: 0, vy: 0, stun: 0, token: true, tokenCd: 0, holdT: 0, waitT: 0,
    cool: 0, atk: null, move: null, phase: null, face: -1, ...extra,
  };
}

function attackingState(level) {
  const s = createState();
  s.hpMode = true; s.level = level; s.wave = 1; s.scrollSpeed = 0;
  s.player.x = 200; s.player.y = H - 130;
  const n = makeNinja({ x: 140, y: s.player.y }); // 60px away: inside brawler reach (44 * 1.8)
  s.ninjas = [n];
  return { s, n };
}

// KIND_ATTACK isn't exported; mirror the brawler spec the AI uses so the expected
// wind can be derived independently of the implementation under test.
const BRAWLER = { wind: 0.5 };
const scaleAt = level => WIND_SCALE[level | 0] || 1;

let cases = 0;

// 1. windFor is the single source of truth, and only levels 0/1 are scaled.
assert.equal(WIND_SCALE[0], 1.3);
assert.equal(WIND_SCALE[1], 1.15);
assert.equal(WIND_SCALE[2], undefined, 'level 2+ uses the base wind (scale 1)');
for (const level of [0, 1, 2, 3, 4, 6, 7]) {
  assert.equal(windFor({ level }, BRAWLER), BRAWLER.wind * scaleAt(level), `windFor level ${level}`);
}
cases++;

// 2. enemyAI starts the wind-up with windFor(), consistently at the early levels and
//    at base speed later. Level 0 (sewer) is intentionally longer than the raw spec.
for (const level of [0, 1, 2, 3]) {
  const { s, n } = attackingState(level);
  enemyAI(s, 1 / 120);
  assert.ok(n.atk, `level ${level}: expected a wind-up to start`);
  assert.equal(n.atk.phase, 'wind');
  const expected = BRAWLER.wind * scaleAt(level);
  assert.equal(n.atk.t, expected, `level ${level}: wind-up t must be windFor(spec)`);
  assert.equal(n.atk.dur, expected, `level ${level}: wind-up dur must be windFor(spec)`);
  assert.equal(n.move, 'swing');
  assert.equal(n.phase, 'wind');
  assert.ok(n.atk.t > 0, 'wind-up must not already be past its wind phase');
  cases++;
}

// 3. Deterministic: the same authored input produces the same telegraph every run.
{
  const a = attackingState(1); enemyAI(a.s, 1 / 120);
  const b = attackingState(1); enemyAI(b.s, 1 / 120);
  assert.equal(a.n.atk.t, b.n.atk.t);
  assert.equal(a.n.atk.dur, b.n.atk.dur);
  cases++;
}

// 4. Preserved wake fix: a waking/knocked enemy never starts a wind-up and gives up its
//    token, so the windFor change does not resurrect attacks during recovery.
for (const flag of ['wake', 'down', 'stun']) {
  const { s, n } = attackingState(0);
  n[flag] = flag === 'stun' ? 0.2 : 0.4;
  const before = n.token;
  enemyAI(s, 1 / 120);
  assert.equal(n.atk, null, `${flag}: must not start an attack`);
  assert.equal(n.token, false, `${flag}: token released while not ready`);
  assert.notEqual(before, undefined);
  cases++;
}

// 5. The shared helper is the one wired in (guard against a silent re-inline of spec.wind).
{
  const { s, n } = attackingState(0);
  enemyAI(s, 1 / 120);
  assert.notEqual(n.atk.t, BRAWLER.wind, 'level 0 must not use the raw 0.5s wind');
}

assert.ok(combatMod.windFor, 'combat.js still exports windFor');
console.log(`Early telegraphs: windFor wiring verified across levels 0/1/2/3 plus wake/down/stun recovery (${cases} cases).`);
