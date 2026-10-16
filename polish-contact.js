// The three v2 fighters use their authored contact drawing for melee contact.
// Legacy fighters retain the original broad rectangles byte-for-byte.
import { POSES, HERO_CHAIN, HERO_KICK, solve, apply } from './rig.js';
import { HERO_RIGS } from './hero-rigs.js';
import { HERO_SUPPORT } from './hero-support.js';
export const POLISHED_HEROES = new Set(['teknium', 'nous_girl', 'turbofit']);
// Same body/range units as combat.attackBox; return right-facing rig pixels.
export const presentationReach = (state, move) => move && !move.around ? (state.player.r * 2 * .3 + move.range * 1.8) / .7 : undefined;
export function contactPose(state, move) {
  const hero = state.hero || state.selectedHero, c = state.combat;
  if (!POLISHED_HEROES.has(hero) || !move) return null;
  if (/^(kick|jumpKick)$/.test(move.name) && POSES[`${hero}_${move.name}_active`]) return `${hero}_${move.name}_active`;
  const named = `${hero}_${move.name}_active`;
  if (POSES[named] && !/^(punch|kick|jumpKick)$/.test(move.name)) return named;
  const chain = HERO_CHAIN[hero];
  const action = move.name === 'kick' || move.air ? HERO_KICK[hero] : chain[Math.min(chain.length, Math.max(1, c.chain || 1)) - 1];
  return `${hero}_${action}_active`;
}
export function contactShape(state, move) {
  const hero = state.hero || state.selectedHero, name = contactPose(state, move);
  if (!name || move.noHit || move.grabbed) return null;
  // Sound/energy moves have an explicit reach cue, not a fictitious weapon tip.
  if (move.around || /_wave_active$/.test(name)) return { area: true, name };
  const pose = { ...POSES[name], __pose: name, __phase: 'active', __pt: 1 / 60, __reach: presentationReach(state, move) };
  const sol = solve(hero, pose, { poseName: name, animated: true });
  const T = HERO_RIGS[hero], points = [];
  const slots = /_(?:jumpKick|kick)_active$/.test(name) ? ['foot', 'shin']
    : move.behind ? ['hand_b', 'farm_b', 'uarm_b'] : ['weapon', 'hand', 'farm'];
  for (const slot of slots) {
    const p = sol.parts?.[slot] || T[slot];
    const vKey = sol.variants?.[slot] ? `${slot}@${sol.variants[slot]}` : null;
    const hull = (vKey && HERO_SUPPORT[hero]?.[vKey]) || HERO_SUPPORT[hero]?.[slot.replace(/_b$/, '')];
    if (p && hull) for (const [u, v] of hull) points.push(apply(sol.M[slot], u - p.px, v - p.py));
  }
  if (hero === 'nous_girl') for (const rope of Object.values(sol.ropes)) points.push(...rope);
  const player = state.player, face = state.combat.facing < 0 ? -1 : 1;
  const world = points.map(([x, y]) => [player.x + face * .7 * x, player.y + player.r - 63 - (player.z || 0) + .7 * y]);
  return { name, points: world, area: false,
    x0: Math.min(...world.map(p => p[0])) - 6, x1: Math.max(...world.map(p => p[0])) + 6,
    top: Math.min(...world.map(p => p[1])) - 6, bot: Math.max(...world.map(p => p[1])) + 6 };
}
export function alignContactBox(state, move, broad) {
  const shape = contactShape(state, move);
  if (!shape || shape.area) return broad;
  // Keep existing range/depth caps, but do not hit empty space past the visible
  // striking limb/weapon. Six pixels are the narrow contact/spark allowance.
  const box = { ...broad, x0: Math.max(broad.x0, shape.x0), x1: Math.min(broad.x1, shape.x1), top: Math.max(broad.top, shape.top), bot: Math.min(broad.bot, shape.bot) };
  box.empty = box.x0 > box.x1 || box.top > box.bot;
  return box;
}
export function impactPoint(box, target, hurtbox) {
  const hb = hurtbox(target);
  return { x: (Math.max(box.x0, hb.x0) + Math.min(box.x1, hb.x1)) / 2,
    y: (Math.max(box.top, hb.top) + Math.min(box.bot, hb.bot)) / 2 };
}
export function drawContactCue(ctx, state, box) {
  const hero = state.hero || state.selectedHero;
  const c = state.combat, move = c?.attack;
  if (!POLISHED_HEROES.has(hero) || c.phase !== 'active' || !move || move.noHit) return;
  const shape = contactShape(state, move);
  if (!shape) return;
  const col = hero === 'teknium' ? '#66f2ff' : hero === 'nous_girl' ? '#70c4ff' : '#ffb84d';
  const core = hero === 'teknium' ? '#eaffff' : hero === 'nous_girl' ? '#e4f7ff' : '#fff3c4';
  const sign = (c.attackFacing || c.facing || 1) < 0 ? -1 : 1;
  const y = state.player.y + state.player.r - 44 - (state.player.z || 0);
  ctx.save();
  ctx.lineCap = 'round';
  if (shape.area) {
    ctx.strokeStyle = col;
    ctx.globalAlpha *= 0.58;
    ctx.lineWidth = 2.4;
    if (move.around) {
      const rx = (box.x1 - box.x0) / 2;
      ctx.beginPath(); ctx.ellipse(state.player.x, y, rx, 34, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = core; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.ellipse(state.player.x, y, rx * 0.82, 26, 0, 0, Math.PI * 2); ctx.stroke();
    } else {
      const end = sign > 0 ? box.x1 : box.x0;
      for (let i = 0; i < 3; i++) {
        const x = end - sign * i * 9;
        ctx.beginPath(); ctx.moveTo(x - sign * 8, y - 25); ctx.quadraticCurveTo(x + sign * 9, y, x - sign * 8, y + 25); ctx.stroke();
      }
      ctx.strokeStyle = core; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(end - sign * 6, y - 18); ctx.quadraticCurveTo(end + sign * 8, y, end - sign * 6, y + 18); ctx.stroke();
    }
  } else if (shape.points && shape.points.length >= 2) {
    const tipX = sign > 0 ? shape.x1 - 4 : shape.x0 + 4;
    const midY = (shape.top + shape.bot) * 0.5;
    const spanY = Math.max(16, Math.min(38, (shape.bot - shape.top) * 0.65));
    ctx.globalAlpha *= move.heavy ? 0.68 : 0.48;
    ctx.strokeStyle = col;
    ctx.lineWidth = move.heavy ? 3.2 : 2.2;
    ctx.beginPath();
    ctx.moveTo(tipX - sign * 18, midY - spanY * 0.75);
    ctx.quadraticCurveTo(tipX + sign * 8, midY, tipX - sign * 14, midY + spanY * 0.75);
    ctx.stroke();
    ctx.strokeStyle = core;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(tipX - sign * 13, midY - spanY * 0.52);
    ctx.quadraticCurveTo(tipX + sign * 5, midY, tipX - sign * 10, midY + spanY * 0.52);
    ctx.stroke();
  }
  ctx.restore();
}
