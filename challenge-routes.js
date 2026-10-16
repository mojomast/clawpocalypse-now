// Challenge changes two ordinary opening encounters; all other authored beats
// (including breathers and gates) come from the Classic trigger table.
export function normalizeRoute(id) {
  return id === 'challenge' ? 'challenge' : 'classic';
}

export const CHALLENGE_VARIANTS = Object.freeze({
  '0:300': Object.freeze({ kinds: Object.freeze(['skater', 'striker']), from: 'both' }),
  '1:300': Object.freeze({ kinds: Object.freeze(['acrobat', 'thrower']), from: 'both' }),
});

export function routeTriggers(triggers, route) {
  if (normalizeRoute(route) === 'classic') return triggers;
  return triggers.map(t => {
    const variant = CHALLENGE_VARIANTS[`${t.level}:${t.x}`];
    return variant ? { ...t, ...variant, kinds: [...variant.kinds] } : t;
  });
}
