// TEAM LINK: a bounded, per-stage payoff for two living players contacting the
// same ordinary enemy. All accounting is on the shared state, never P2's view.
export const TEAM_LINK_WINDOW = 2;
export const TEAM_LINK_AWARD = 6;
export const TEAM_LINK_STAGE_CAP = 30;

const runs = new WeakMap();
const rootOf = state => state && (state.hitOwnerState || state);
const living = p => !!p && !p.over && (p.lives == null || p.lives > 0) && (p.hp == null || p.hp > 0) && !(p.playerDown > 0);
const boss = (root, enemy) => !!(enemy.boss || enemy.__boss || enemy.levelBoss || enemy.rider || enemy.kind === 'boss' ||
  (root.bossFight && root.bossFight.active && root.bossFight.active.n === enemy));

function fresh(root) {
  return { wave: root.wave, level: root.level, clock: 0, p2: null, p1Out: false,
    pending: new WeakMap(), consumed: new WeakSet(), credit: 0 };
}
function entry(root) {
  let run = runs.get(root);
  if (!run || run.wave !== root.wave || run.level !== root.level) {
    run = fresh(root);
    runs.set(root, run);
  }
  return run;
}
function active(root, run) {
  return !run.p1Out && living(root) && living(run.p2) &&
    run.p2.hitOwnerState === root && !root.runComplete && !root.holdTeamLink;
}

// Call once per simulation step. A missing/down player discards pending setups;
// returning later cannot finish one created before the interruption.
export function step(state, dt, p2, p1Out = false) {
  const root = rootOf(state);
  if (!root) return;
  const run = entry(root);
  run.clock += Number.isFinite(dt) ? Math.max(0, dt) : 0;
  if (run.p2 && run.p2 !== p2) run.pending = new WeakMap();
  run.p2 = p2 || null;
  run.p1Out = !!p1Out;
  if (!active(root, run)) run.pending = new WeakMap();
}

// The caller supplies the *actual* effectiveHit result, never a guessed HP delta.
// The meter owner applies the requested amount and commits only the actual gain.
export function record(state, enemy, contact) {
  const root = rootOf(state);
  if (!root || !enemy || !contact) return null;
  const run = entry(root);
  if (!active(root, run)) { run.pending = new WeakMap(); return null; }
  if (run.consumed.has(enemy) || boss(root, enemy) || contact.landed !== true ||
      !(contact.amount > 0) || (contact.owner !== 'p1' && contact.owner !== 'p2') ||
      (contact.source !== 'melee' && contact.source !== 'projectile') ||
      contact.blocked || contact.immune || contact.dead) return null;
  const prior = run.pending.get(enemy);
  // A lethal second contact is valid: the target was alive immediately before it.
  // The boundary calls record after damage, so do not read enemy.hp/dead here.
  if (prior && prior.owner !== contact.owner && run.clock - prior.at <= TEAM_LINK_WINDOW) {
    run.pending.delete(enemy);
    run.consumed.add(enemy);
    const amount = Math.max(0, Math.min(TEAM_LINK_AWARD, TEAM_LINK_STAGE_CAP - run.credit));
    if (!amount) return null;
    let committed = false;
    return { amount, owners: [1, 2], commit(actual) {
      if (committed || runs.get(root) !== run) return 0;
      committed = true;
      const credited = Math.max(0, Math.min(amount, TEAM_LINK_STAGE_CAP - run.credit, Number.isFinite(actual) ? actual : 0));
      run.credit += credited;
      return credited;
    } };
  }
  run.pending.set(enemy, { owner: contact.owner, at: run.clock });
  return null;
}

export function stageCredit(state) {
  const root = rootOf(state);
  return root ? entry(root).credit : 0;
}
export function reset(state) {
  const root = rootOf(state);
  if (root) runs.delete(root);
}

export const teamwork = { step, record, stageCredit, reset };
if (typeof window !== 'undefined') window.__ppTeamwork = teamwork;
