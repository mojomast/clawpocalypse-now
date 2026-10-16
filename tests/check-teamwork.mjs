import assert from 'node:assert/strict';
import { createState, effectiveHit } from '../logic.js';
import { createCoop } from '../coop.js';
import { createAssist } from '../assist.js';

const foe = (hp = 20) => ({ kind: 'brawler', x: 450, y: 400, hp, maxHp: hp, r: 16, dead: false });
const s = createState(); Object.assign(s, { wave: 1, level: 0, walkLevel: true, hpMode: true, selectedHero: 'teknium' });
const assist = createAssist(); assist.step(s, 0);
const coop = createCoop({ assist });
const hit = (who, n) => effectiveHit(who === 1 ? s : coop.p2, n, 1, () => 1, { owner: who === 1 ? 'p1' : 'p2', source: 'melee' });
const v = coop.join(s, 'turbofit');
assert.equal(v.hitOwnerState, s);
s.super = 97;
const a = foe(); hit(1, a); hit(2, a);
assert.equal(s.super, 100);
assert.equal(coop.teamLinkStageCredit(s), 3);
assert.equal(assist.linkCue.amount, 3);
assert.equal(assist.stats.teamLinks, 1);
coop.leave();
const b = foe(); effectiveHit(s, b, 1, () => 1, { owner: 'p1', source: 'melee' });
assert.equal(s.super, 100, 'leaving cannot trigger a solo link');
coop.join(s, 'turbofit');
hit(2, b);
assert.equal(coop.teamLinkStageCredit(s), 3, 'a pre-leave setup cannot survive rejoins');
s.super = 0;
const c = foe(); hit(2, c); hit(1, c);
assert.equal(coop.teamLinkStageCredit(s), 9);
coop.p2.playerDown = 0.5;
const down = foe(); hit(1, down); hit(2, down);
assert.equal(coop.teamLinkStageCredit(s), 9, 'down P2 cannot link');
coop.p2.playerDown = 0;
coop.step(s, 0);
hit(1, down);
assert.equal(coop.teamLinkStageCredit(s), 9, 'down transition discards pending');
for (const player of [s, coop.p2]) {
  const interrupted = foe(); hit(1, interrupted);
  player.playerDown = 0.5;
  coop.step(s, 0);
  assert.equal(hit(2, interrupted).teamLink, null, 'either down player blocks a real-view payoff');
  player.playerDown = 0;
  coop.step(s, 0);
  assert.equal(hit(2, interrupted).teamLink, null, 'down transition clears a real-view setup');
}
assert.equal(coop.teamLinkStageCredit(s), 9);
s.wave++;
coop.step(s, 0);
assert.equal(coop.teamLinkStageCredit(s), 0, 'stage transitions reset credit');
s.super = 0;
for (let i = 0; i < 6; i++) { const n = foe(); hit(1, n); hit(2, n); }
assert.equal(coop.teamLinkStageCredit(s), 30, 'stage credit is bounded');
assert.equal(s.super, 30);
assert.equal(assist.stats.fired, 0, 'link credit does not invoke the assist');

coop.leave();
assert.equal(coop.p2, null);
const rejoined = coop.join(s, 'turbofit');
assert.equal(rejoined.hitOwnerState, s, 'rejoin creates another real P2 view');
const capped = foe(); hit(1, capped); hit(2, capped);
assert.equal(coop.teamLinkStageCredit(s), 30, 'leave/rejoin retains the stage cap');
assert.equal(s.super, 30);

const consumed = foe();
s.wave++; coop.step(s, 0);
hit(1, consumed); hit(2, consumed);
assert.equal(coop.teamLinkStageCredit(s), 6);
coop.leave(); coop.join(s, 'turbofit');
hit(1, consumed); hit(2, consumed);
assert.equal(coop.teamLinkStageCredit(s), 6, 'rejoining does not recycle a linked enemy');

const bench = foe(); hit(1, bench);
s.walkLevel = false;
coop.step(s, 0);
assert.equal(hit(2, bench).teamLink, null, 'benched P2 cannot complete a link');
s.walkLevel = true;
coop.step(s, 0);
assert.equal(hit(2, bench).teamLink, null, 'benched setup is discarded on return');
const back = foe(); hit(1, back); hit(2, back);
assert.equal(coop.teamLinkStageCredit(s), 12, 'active players can link after the bench');

const priorRun = foe(); hit(1, priorRun);
const next = createState(); Object.assign(next, { wave: 1, level: 0, walkLevel: true, hpMode: true, selectedHero: 'teknium' });
assist.step(next, 0);
coop.step(next, 0);
assert.equal(coop.p2.hitOwnerState, next, 'co-op adopts the new shared run');
assert.equal(effectiveHit(coop.p2, priorRun, 1, () => 1, { owner: 'p2', source: 'melee' }).teamLink, null,
  'old run pending hit cannot cross into adopted run');
assert.equal(coop.teamLinkStageCredit(next), 0);
const newRunEnemy = foe();
effectiveHit(next, newRunEnemy, 1, () => 1, { owner: 'p1', source: 'melee' });
effectiveHit(coop.p2, newRunEnemy, 1, () => 1, { owner: 'p2', source: 'melee' });
assert.equal(coop.teamLinkStageCredit(next), 6, 'new run has a fresh link budget');
assert.equal(next.super, 6);
console.log('teamwork integration: real P2 view, near-full credit, leave/down/stage/cap/assist OK');
