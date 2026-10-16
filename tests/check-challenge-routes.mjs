// Run: node tests/check-challenge-routes.mjs
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { normalizeRoute, CHALLENGE_VARIANTS } from '../challenge-routes.js';
import { TRIGGERS, KIND_HP, KIND_R, levelBeats, levelPlan, stepEvents, ensureEvents } from '../events.js';
import { isWalkable, LEVELS } from '../collision.js';
import { createState } from '../logic.js';

// Independent fixture: SHA-256 of JSON.stringify(TRIGGERS) at git HEAD before
// adding routes. This catches accidental edits to any Classic beat, not just
// the two replaced encounters.
const CLASSIC_SHA256 = '926185804e2b00372eb37a400043f2334724a5316d817693f237468bf745a9da';
const digest = beats => createHash('sha256').update(JSON.stringify(beats)).digest('hex');
assert.equal(digest(TRIGGERS), CLASSIC_SHA256, 'Classic authored trigger table changed');
for (const [id, expected] of [[undefined, 'classic'], ['classic', 'classic'], ['challenge', 'challenge'], ['unknown', 'classic'], [null, 'classic']]) {
  assert.equal(normalizeRoute(id), expected);
}

const changes = [];
for (const level of LEVELS.keys()) {
  const classic = levelPlan(level);
  assert.strictEqual(levelBeats(level), levelBeats(level, 'classic'), 'Classic catalog reference is stable');
  assert.strictEqual(levelBeats(level, 'unknown'), levelBeats(level), 'unknown route reuses Classic catalog');
  assert.strictEqual(levelBeats(level, 'challenge'), levelBeats(level, 'challenge'), 'Challenge catalog reference is stable');
  assert.notStrictEqual(classic.beats, levelBeats(level), 'report cannot mutate catalog ordering');
  for (const beat of classic.beats) assert.strictEqual(beat, TRIGGERS.find(t => t.level === level && t.x === beat.x), 'Classic retains authored object identity');
  assert.deepEqual(classic, levelPlan(level, 'classic'));
  assert.deepEqual(classic, levelPlan(level, 'unrecognized'), 'unknown route falls back to Classic');
  assert.deepEqual(classic.beats, TRIGGERS.filter(t => t.level === level));
  const challenge = levelPlan(level, 'challenge');
  for (let i = 0; i < challenge.beats.length; i++) {
    assert.strictEqual(challenge.beats[i], levelBeats(level, 'challenge')[i], 'report reuses precomputed beat objects');
    assert.strictEqual(challenge.beats[i], levelPlan(level, 'challenge').beats[i], 'beat identity survives repeated reports');
  }
  assert.equal(challenge.beats.length, classic.beats.length);
  for (let i = 0; i < classic.beats.length; i++) {
    const before = classic.beats[i], after = challenge.beats[i];
    if (JSON.stringify(before) === JSON.stringify(after)) {
      assert.strictEqual(after, before, 'unchanged Challenge beats reuse Classic triggers');
      continue;
    }
    assert.notStrictEqual(after, before, 'variant is a distinct precomputed trigger');
    changes.push(`${level}:${before.x}`);
    assert.equal(after.level, before.level);
    assert.equal(after.x, before.x);
    assert.ok(!before.boss && before.type !== 'boss' && before.type !== 'miniBoss' && before.type !== 'breather');
    assert.deepEqual({ ...after, kinds: before.kinds, from: before.from }, before, 'only roles and entry sides change');
    assert.equal(after.from, 'both', 'alternate pincer entry from opposing arena sides');
    assert.equal(after.kinds.length, before.kinds.length, 'same enemy count');
    const budget = kinds => kinds.reduce((sum, kind) => sum + KIND_HP[kind], 0);
    assert.equal(budget(after.kinds), budget(before.kinds), 'same total HP budget');
  }
}
assert.deepEqual(changes, ['0:300', '1:300'], 'exactly one sewer and one street beat change');
assert.deepEqual(Object.keys(CHALLENGE_VARIANTS), changes);
assert.deepEqual(levelPlan(0, 'challenge').beats[0].kinds, ['skater', 'striker']);
assert.deepEqual(levelPlan(1, 'challenge').beats[0].kinds, ['acrobat', 'thrower']);

// Exercise the real entry calculation and collision resolution at the random
// extremes, rather than trusting only the authored spawnAt coordinate.
const originalRandom = Math.random;
try {
  for (const random of [0, 0.5, 0.999999]) {
    Math.random = () => random;
    for (const level of [0, 1]) {
      const t = levelPlan(level, 'challenge').beats[0];
      const state = createState();
      state.route = 'challenge'; state.level = level; state.walkLevel = true;
      state.player.x = t.x;
      stepEvents(state, 0);
      assert.deepEqual(state.ninjas.map(n => n.kind), t.kinds);
      for (const n of state.ninjas) {
        assert.equal(n.r, KIND_R[n.kind]);
        assert.ok(isWalkable(level, n.x, n.y, n.r), `${level}:${t.x} ${n.kind} spawn obstructed`);
        assert.ok(n.x >= 0 && n.x <= LEVELS[level].width);
      }
      const lock = state.events.lock;
      assert.ok(state.ninjas[0].x < lock.L && state.ninjas[1].x > lock.R, 'actual pincer spawns outside opposite arena edges');
    }
  }
} finally { Math.random = originalRandom; }

// Two successive real triggers on each route: killing each wave releases its
// arena lock and the GO cue, allowing the next trigger to fire exactly once.
for (const route of [undefined, 'classic', 'challenge']) for (const level of [0, 1]) for (const coop of [false, true]) {
  const state = createState();
  state.route = route; state.level = level; state.walkLevel = true; state.hpMode = true;
  const previousWindow = globalThis.window;
  globalThis.window = coop ? { __ppCoop: { p2: Object.assign(Object.create(state), {
    selectedHero: 'turtle_blue', player: { x: 300, y: 420, r: 16 }
  }) } } : undefined;
  try {
    const e = ensureEvents(state), beats = levelPlan(level, route).beats.filter(t => t.kinds.length).slice(0, 2);
    for (let index = 0; index < beats.length; index++) {
      const t = beats[index];
      state.player.x = t.x;
      const spawned = stepEvents(state, 0);
      assert.deepEqual(spawned.map(n => n.kind), t.kinds);
      assert.ok(e.lock, `${route}:${level}:${t.x} acquired arena lock`);
      assert.equal(e.firedCount, index + 1);
      assert.equal(stepEvents(state, 0).length, 0, 'locked trigger cannot fire again');
      for (const n of state.ninjas) n.dead = true;
      stepEvents(state, 0);
      assert.equal(e.lock, null, 'arena released on clear');
      assert.ok(e.go, 'GO cue after clearing encounter');
      state.ninjas.length = 0;
      stepEvents(state, 20); // drain dialogue cooldown before advancing
    }
    assert.equal(e.log.filter(item => item.type === 'arenaClear').length, 2);
    assert.equal(e.log.filter(item => item.type === 'arenaLock').length, 2);
    assert.equal(e.firedCount, 2);
    assert.equal(e.log.filter(item => item.type === 'say').length, 2);
    assert.deepEqual(e.log.filter(item => item.type === 'say').map(item => item.hero),
      coop ? ['turtle_blue', 'turtle_purple'] : ['turtle_purple', 'turtle_purple']);
  } finally { globalThis.window = previousWindow; }
}

console.log('Challenge routes OK: Classic fixture, two equal-budget variants, collision and sequential solo/P2 arena clears');
