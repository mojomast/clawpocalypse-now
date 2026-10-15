// Controlled hit fixtures through the real combat state machine and pose selector.
import { createState } from '../logic.js';
import { createCombat, combatStep, attackBox, MOVES } from '../combat.js';
import { HERO_MOVES_COMBAT } from '../hero-moves.js';
import { GRAB_MOVES } from '../grab.js';
import { createRig, heroSecondary } from '../rig.js';
import { HERO_RIGS } from '../hero-rigs.js';
import '../don.js';
import { createAnim } from '../anim.js';
import { createFootLocks } from '../foot-lock.js';
const rig = createRig(), canvas = document.querySelector('canvas'), ctx = canvas.getContext('2d');
const needed = ['teknium','nous_girl','turbofit'].flatMap(h => Object.values(HERO_RIGS[h]).flatMap(p => [p.file, ...Object.values(p.variants || {}).map(v => v.file)]).map(f => [h, f]));
for (let n = 0; n < 500 && needed.some(([h, f]) => !rig.images[h]?.[f]); n++) await new Promise(r => setTimeout(r, 20));
for (const [h, f] of needed) if (!rig.images[h]?.[f]) throw Error(`Unloaded combat capture image ${h}/${f}`);
const specs = hero => Object.fromEntries([
  ...MOVES.punch.map((m, i) => ['punch' + (i + 1), { ...m, ...(i === 3 ? HERO_MOVES_COMBAT[hero].finisher : {}), chain: i + 1 }]),
  ...['kick', 'launcher', 'jumpKick', 'juggle', 'dashAttack', 'backAttack', 'dash', 'dodgeRoll'].map(k => [k, MOVES[k]]),
  ['special', HERO_MOVES_COMBAT[hero].special], ...Object.entries(GRAB_MOVES),
]);
let actors, anim, locks, frame, label, traces;
function start(hero, move) {
  frame = 0; label = `${hero} / ${move}`; traces = []; anim = createAnim(); locks = createFootLocks();
  actors = [1, -1].map((facing, side) => {
    const state = createState(), spec = specs(hero)[move === 'combo' ? 'punch1' : move];
    Object.assign(state, { hero, selectedHero: hero, hpMode: true, coopSecondary: true, ninjas: [], level: null });
    Object.assign(state.player, { x: side ? 240 : 220, y: 229, z: 0 });
    createCombat(state); Object.assign(state.combat, { facing, attackFacing: spec.behind ? -facing : facing, chain: spec.chain || 1 });
    state.combat.attack = spec;
    const box = attackBox(state, spec), n = { x: (box.x0 + box.x1) / 2, y: 229, r: 16, hp: 100, maxHp: 100, kind: 'brawler', face: -facing, stun: 0, z: spec.air ? 35 : 0, juggle: !!spec.juggle };
    if (box.empty) n.x = state.player.x + facing * 55;
    state.ninjas = [n]; state.combat.attack = null;
    const hits = []; state.fxCue = (kind, data) => { if (kind === 'hit') hits.push({ ...data, frame }); };
    const key = 'combat-review:' + side; heroSecondary.forget(hero + ':' + key);
    return { state, spec, hits, key, combo: move === 'combo', comboIndex: 0, next: 12 };
  });
  return { frames: move === 'combo' ? 360 : 150, sequence: [{ state: move, time: move === 'combo' ? 6 : 2.5, fixture: 'real combatStep; fixed targets; no enemy AI' }] };
}
function draw() {
  ctx.fillStyle = '#151c2b'; ctx.fillRect(0, 0, 960, 300); ctx.fillStyle = '#e2e9ff'; ctx.font = '14px monospace'; ctx.fillText(label + '  real combat fixture / scale 0.7', 10, 20);
  for (const [side, actor] of actors.entries()) {
    const { state: s, key, hits } = actor, c = s.combat, p = s.player, n = s.ninjas[0];
    if (actor.combo && actor.comboIndex > 0 && actor.comboIndex < 4 && !c.attack && actor.next == null) actor.next = frame + 6;
    if (frame === actor.next) {
      if (actor.combo) actor.spec = specs(s.hero)['punch' + (++actor.comboIndex)];
      const spec = actor.spec; actor.next = null; c.chain = spec.chain || 1;
      Object.assign(c, { attack: { ...spec }, phase: 'wind', timer: spec.wind, hitDone: false, struck: null, multiT: 0, linked: 0 });
      if (spec.grabbed) { n.grabbed = true; c.grab = { n, t: 2, knees: 1 }; }
      if (spec.air) Object.assign(c, { airborne: true, jumpZ: 35, jumpV: 110 });
    }
    combatStep(s, 1 / 60);
    const name = rig.playerPose(s, frame / 60), a = c.attack, dur = a ? (c.phase === 'wind' ? a.wind : c.phase === 'active' ? a.active : a.rec) : 0;
    const dt = c.hitStop > 0 ? 0 : 1 / 60;
    const drawing = anim.step(key, name, { phase: a && !a.hold ? c.phase : null, dur, heavy: !!a?.heavy, reach: a && !a.around ? (p.r * .6 + a.range * 1.8) / .7 : undefined }, dt, frame / 60);
    const rootY = p.y + p.r - 63 - (p.z || 0), pose = locks.place(key, s.hero, drawing, { x: p.x, y: rootY, flip: c.facing < 0, scale: .7, dt });
    ctx.save(); ctx.translate(side * 480, 0);
    ctx.strokeStyle = '#46536f'; ctx.beginPath(); ctx.moveTo(10, 245); ctx.lineTo(470, 245); ctx.stroke();
    const box = a && !a.hold && !a.noHit ? attackBox(s, a) : null;
    if (box && !box.empty) { ctx.strokeStyle = c.phase === 'active' ? '#ff8585' : '#827443'; ctx.strokeRect(box.x0, box.top, box.x1 - box.x0, box.bot - box.top); }
    ctx.fillStyle = n.hp < 100 ? '#ad4b56' : '#485676'; ctx.fillRect(n.x - 15, n.y - 90 - (n.z || 0), 30, 105);
    rig.draw(ctx, s.hero, pose, p.x, rootY, c.facing < 0, .7, null, dt);
    for (const hit of hits.filter(h => frame - h.frame < 8)) { ctx.strokeStyle = '#ffe8a7'; ctx.beginPath(); ctx.arc(hit.x, hit.y, 7, 0, Math.PI * 2); ctx.stroke(); }
    ctx.fillStyle = '#dbe6fa'; ctx.fillText(`${c.phase} | HP ${n.hp} | stop ${c.hitStop.toFixed(3)}`, 10, 280); ctx.restore();
    traces.push({ frame, side, pose: name, phase: c.phase, hp: n.hp, hitStop: c.hitStop, box });
  }
  frame++; return canvas.toDataURL('image/png');
}
window.polish = { moves: h => [...Object.keys(specs(h)), 'combo'], states: [], start, draw, traces: () => traces };
