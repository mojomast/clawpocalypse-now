import assert from 'node:assert/strict';
import { createState, effectiveHit, damageNinja } from '../logic.js';
import { teamwork } from '../teamwork.js';

const enemy = (hp = 40, extra = {}) => ({ kind: 'brawler', hp, maxHp: hp, x: 500, y: 400, r: 16, ...extra });
function party() {
  const s = createState(); s.wave = 1; s.level = 0; s.hpMode = true;
  const p2 = Object.assign(Object.create(s), { hitOwnerState: s, coopSecondary: true, hp: 100, lives: 3, over: false, playerDown: 0, combo: 0, score: 0 });
  teamwork.step(s, 0, p2);
  const links = [];
  s.onTeamLink = event => {
    const before = s.super || 0;
    s.super = Math.min(100, before + event.amount);
    links.push(event.commit(s.super - before));
  };
  const hit = (who, n, source = 'melee', opts = {}) => effectiveHit(who === 1 ? s : p2, n, 1, () => 1,
    { owner: who === 1 ? 'p1' : 'p2', source, ...opts });
  return { s, p2, links, hit };
}

for (const [first, second] of [[1, 2], [2, 1]]) {
  const { s, p2, links, hit } = party(), n = enemy();
  assert.equal(hit(first, n).amount, 1);
  teamwork.step(s, 1.99, p2);
  const payoff = hit(second, n);
  assert.equal(payoff.teamLink.amount, 6);
  assert.deepEqual(payoff.teamLink.owners, [1, 2]);
  assert.deepEqual(links, [6]);
  assert.equal(payoff.teamLink.commit(6), 0, 'one commit only');
  hit(first, n); hit(second, n);
  assert.equal(teamwork.stageCredit(s), 6, 'one link per enemy');
  assert.deepEqual(links, [6]);
}

{
  const { s, hit, links } = party(), n = enemy();
  assert.equal(hit(1, n).landed, true);
  assert.equal(hit(1, n).landed, true, 'same owner makes a second effective contact');
  assert.deepEqual(links, [], 'repeated same-owner hits never award');
  assert.equal(teamwork.stageCredit(s), 0);
  assert.equal(hit(2, n).teamLink.amount, 6, 'the other owner can still finish the setup');
  assert.deepEqual(links, [6]);
}

{
  const { s, hit, links } = party();
  const immune = enemy();
  assert.equal(hit(1, immune).landed, true);
  s.bossFight = { active: { n: immune, invuln: 1 } };
  const rejected = hit(2, immune);
  assert.equal(rejected.immune, true);
  assert.equal(rejected.landed, false);
  assert.equal(rejected.teamLink, undefined);
  delete s.bossFight;

  const dead = enemy(1);
  assert.equal(hit(1, dead).killed, true, 'first effective hit can kill');
  const afterDeath = hit(2, dead);
  assert.equal(afterDeath.dead, true);
  assert.equal(afterDeath.landed, false);
  assert.equal(afterDeath.teamLink, undefined);
  assert.deepEqual(links, [], 'immune and already-dead second contacts cannot award');
  assert.equal(teamwork.stageCredit(s), 0);
}

{
  const { s, hit, links } = party(), n = enemy(2);
  assert.equal(hit(1, n).landed, true);
  const finishing = hit(2, n);
  assert.equal(finishing.killed, true);
  assert.equal(finishing.teamLink.amount, 6, 'a lethal effective second hit still qualifies');
  assert.deepEqual(links, [6]);
  assert.equal(teamwork.stageCredit(s), 6);
}

{
  const { s, p2, hit, links } = party();
  const late = enemy(); hit(1, late); teamwork.step(s, 2.01, p2); hit(2, late);
  assert.deepEqual(links, []);
  const down = enemy(); hit(1, down); p2.playerDown = 0.5; teamwork.step(s, 0.1, p2);
  p2.playerDown = 0; teamwork.step(s, 0.1, p2); hit(2, down);
  assert.deepEqual(links, [], 'down cancels setup');
  const leave = enemy(); hit(1, leave); teamwork.step(s, 0.1, null); teamwork.step(s, 0.1, p2); hit(2, leave);
  assert.deepEqual(links, [], 'leave cancels setup');
  const out = enemy(); hit(1, out); teamwork.step(s, 0.1, p2, true); teamwork.step(s, 0.1, p2); hit(2, out);
  assert.deepEqual(links, [], 'P1 out cancels setup');
  const reject = [enemy(20, { boss: true }), enemy(20, { levelBoss: true }), enemy(20, { __boss: true }), enemy(20, { rider: true }), enemy(20, { kind: 'boss' })];
  for (const n of reject) { hit(1, n); hit(2, n); }
  const adopted = enemy(); s.bossFight = { active: { n: adopted, invuln: 0 } }; hit(1, adopted); hit(2, adopted);
  assert.deepEqual(links, [], 'boss flags and adopted boss identity');
  delete s.bossFight;
  for (const source of ['assist', 'hazard', 'machine', 'screen-throw', 'thrown-body']) {
    const n = enemy(); hit(1, n, source); hit(2, n, source); assert.deepEqual(links, [], source);
  }
  const blocked = enemy(); hit(1, blocked, 'melee', { blocked: true }); hit(2, blocked);
  assert.deepEqual(links, [], 'blocked hit cannot create setup');
}

{
  const { s, p2, hit, links } = party();
  for (let i = 0; i < 6; i++) { const n = enemy(2); hit(1, n); hit(2, n); }
  assert.deepEqual(links, [6, 6, 6, 6, 6], 'stage award cap');
  assert.equal(teamwork.stageCredit(s), 30);
  teamwork.step(s, 0, null);
  teamwork.step(s, 0, p2);
  const capped = enemy(); hit(1, capped);
  assert.equal(hit(2, capped).teamLink, null, 'rejoining cannot bypass the cap');
  assert.equal(teamwork.stageCredit(s), 30);
  assert.deepEqual(links, [6, 6, 6, 6, 6]);
  s.wave++; teamwork.step(s, 0, p2);
  assert.equal(teamwork.stageCredit(s), 0);
  const n = enemy(); hit(1, n); hit(2, n);
  assert.equal(teamwork.stageCredit(s), 6, 'new stage can award again');
}

{
  const { s, p2, hit, links } = party(), n = enemy();
  hit(1, n); hit(2, n);
  assert.deepEqual(links, [6]);
  teamwork.step(s, 0, null);
  teamwork.step(s, 0, p2);
  hit(1, n); hit(2, n);
  assert.deepEqual(links, [6], 'same consumed enemy stays consumed across leave/rejoin');
  assert.equal(teamwork.stageCredit(s), 6);
  for (const down of [s, p2]) {
    const target = enemy();
    hit(1, target);
    down.playerDown = 0.5; teamwork.step(s, 0, p2);
    assert.equal(hit(2, target).teamLink, null, 'either down player suspends links');
    down.playerDown = 0; teamwork.step(s, 0, p2);
    assert.equal(hit(2, target).teamLink, null, 'recovery cannot finish pre-down setup');
  }
  assert.deepEqual(links, [6]);
}

{
  const first = party(), n = enemy();
  first.hit(1, n);
  const next = party();
  assert.equal(next.hit(2, n).teamLink, null, 'a fresh state cannot inherit another run’s pending hit');
  assert.equal(teamwork.stageCredit(next.s), 0);
  const fresh = enemy(); next.hit(1, fresh); next.hit(2, fresh);
  assert.equal(teamwork.stageCredit(next.s), 6, 'new run starts with a fresh budget');
}

{
  const { s, p2, hit, links } = party();
  s.super = 98;
  const n = enemy(); hit(1, n); hit(2, n);
  assert.equal(links[0], 2, 'credit tracks actual meter increase');
  assert.equal(teamwork.stageCredit(s), 2);
  s.super = 0;
  const next = enemy();
  assert.equal(damageNinja(s, next, 1, () => 1, { owner: 'p1', source: 'melee' }), next);
  assert.equal(damageNinja(p2, next, 1, () => 1, { owner: 'p2', source: 'projectile' }), next);
  assert.deepEqual(links, [2, 6], 'legacy caller publishes exactly once');
  teamwork.reset(s);
  assert.equal(teamwork.stageCredit(s), 0);
}
console.log('team link: real contact, symmetric payoff, exclusion, expiry, lifecycle, capped actual credit OK');
