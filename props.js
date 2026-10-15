// Level props: the dressing MR.INDIA cut (props/*.png) placed where he specified,
// with the collision footprints from assets/props/PROPS.md.
//
// Authored baseY values stagger back-edge and foreground props. Narrow bands
// retain a radius-17 walking route; sewer foreground props avoid painted crates.
// Bands mirror assets/levels/LEVELS.md (sewer 363, street 358, rooftop 358).
//
// Objects are drawn bottom-anchored at (x, baseY) and their footprints become
// world obstacles for the collision map, so props block walking exactly where
// they look like they should (and stay jumpable, since barriers are jumpable in
// combat.js).

const PROPS = {
  crate: { file: 'crate.png', w: 62, h: 64, foot: [6, 43, 50, 21] },
  barrel: { file: 'barrel.png', w: 34, h: 56, foot: [3, 37, 28, 19] },
  valve: { file: 'valve.png', w: 39, h: 48, foot: [4, 32, 31, 16] },
  trashcan: { file: 'trashcan.png', w: 37, h: 56, foot: [4, 37, 29, 19] },
  hydrant: { file: 'hydrant.png', w: 29, h: 52, foot: [3, 35, 23, 17] },
  pizzaboxes: { file: 'pizzaboxes.png', w: 59, h: 48, foot: [6, 32, 47, 16] },
  acunit: { file: 'acunit.png', w: 55, h: 56, foot: [6, 37, 43, 19] },
};

// level id -> [prop, world x, baseY]. Tuple order is also the stable damage ID.
// Iteration 7: three segments per level, each dressed differently so the looping
// strip reads as new ground (segment 1 = original list, 2 and 3 vary the mix).
export const PLACEMENTS = {
  sewer: [['barrel', 700, 452], ['valve', 1050, 363], ['crate', 1650, 450],
    ['valve', 2050, 363], ['barrel', 2390, 380], ['barrel', 2450, 380], ['pizzaboxes', 2900, 452], ['crate', 3450, 378],
    ['barrel', 4230, 452], ['valve', 4380, 363], ['crate', 4700, 378], ['barrel', 4800, 452]],
  street: [['hydrant', 250, 380], ['trashcan', 800, 492], ['pizzaboxes', 1350, 409],
    ['trashcan', 2000, 378], ['trashcan', 2045, 390], ['crate', 2550, 480], ['hydrant', 3100, 382], ['pizzaboxes', 3500, 462],
    ['barrel', 3900, 410], ['hydrant', 4300, 492], ['trashcan', 4750, 378], ['crate', 5200, 370]],
  rooftop: [['acunit', 400, 368], ['crate', 900, 425], ['acunit', 1500, 368],
    ['barrel', 2000, 424], ['acunit', 2500, 366], ['pizzaboxes', 3000, 424], ['crate', 3400, 365], ['crate', 3460, 365],
    ['acunit', 3900, 424], ['valve', 4400, 358], ['barrel', 4750, 424], ['acunit', 5200, 358]],
};

const LEVEL_ORDER = ['sewer', 'street', 'rooftop', 'skate', 'tower', 'subway', 'harbor', 'arcade']; // skate/tower/subway: no placements (cheese: subway); mr_india: harbor (6) / arcade (7) draw their own props
export const PROP_WORLD_W = 1814 * 3;

export function placementsFor(levelIndex) {
  const id = LEVEL_ORDER[((levelIndex | 0) % LEVEL_ORDER.length + LEVEL_ORDER.length) % LEVEL_ORDER.length];
  return (PLACEMENTS[id] || []).map(([name, x, baseY], i) => ({ id: `${id}:prop:${i}`, name, x, spec: PROPS[name], baseY, level: id }));
}

// Footprint boxes in world coordinates, for the level collision maps.
export function propObstacles(levelIndex) {
  return placementsFor(levelIndex)
    .filter(p => p.spec)
    .map(({ id, x, spec, baseY }) => {
      const [fx, fy, fw, fh] = spec.foot;
      return { id, x: Math.round(x - spec.w / 2 + fx), y: Math.round(baseY - spec.h + fy), w: fw, h: fh };
    });
}

export function createProps() {
  const images = {};
  for (const [name, spec] of Object.entries(PROPS)) {
    const im = new Image();
    im.onload = () => { images[name] = im; };
    im.src = 'assets/props/' + spec.file;
  }
  let drawn = 0;
  // World-space entries merge with actor feet by ascending y; draw() is the
  // compatibility fallback. Do not call both in the same frame.
  // mod (optional, breakables.js): mod(i) -> null to skip a smashed prop, or {rot, flash}.
  function depthEntries(ctx, levelIndex, camL, camR, mod) {
    const entries = [];
    placementsFor(levelIndex).forEach((p, i) => {
      const im = images[p.name];
      if (!im || !p.spec) return;
      // Cheap culling: skip props fully outside the visible window.
      if (p.x + p.spec.w / 2 < camL - 20 || p.x - p.spec.w / 2 > camR + 20) return;
      const m = mod ? mod(i) : null;
      if (mod && m === null) return;
      entries.push({ y: p.baseY, draw: () => {
      if (m && (m.rot || m.flash)) {
        ctx.save(); ctx.translate(p.x, p.baseY); ctx.rotate(m.rot || 0);
        ctx.drawImage(im, -p.spec.w / 2, -p.spec.h, p.spec.w, p.spec.h);
        if (m.flash) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.5; ctx.drawImage(im, -p.spec.w / 2, -p.spec.h, p.spec.w, p.spec.h); }
        ctx.restore();
      } else ctx.drawImage(im, Math.round(p.x - p.spec.w / 2), Math.round(p.baseY - p.spec.h), p.spec.w, p.spec.h);
      drawn += 1;
      } });
    });
    return entries;
  }
  function draw(ctx, ...args) { for (const entry of depthEntries(ctx, ...args)) entry.draw(); }
  return { draw, depthEntries, images, stats: () => drawn };
}
