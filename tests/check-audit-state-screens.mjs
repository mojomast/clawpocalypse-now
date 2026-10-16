import assert from 'node:assert/strict';
import { createScreens } from '../screens.js';

function makeCtx(W = 740, H = 480) {
  return {
    canvas: { width: W, height: H },
    globalAlpha: 1,
    fillStyle: '',
    font: '',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    strokeStyle: '',
    lineWidth: 1,
    save() {},
    restore() {},
    fillRect() {},
    translate() {},
    scale() {},
    rotate() {},
    fillText() {},
    strokeRect() {},
    createLinearGradient() { return { addColorStop() {} }; },
  };
}

const screens = createScreens({});
const s = { level: 0, score: 123, selectedHero: 'turtle_blue', hpHit: 0, coins: 0, ninjas: [] };

screens.reset(s);
screens.ending(s);
const ctx = makeCtx(740, 480);
for (let i = 0; i < 450; i++) screens.update(0.1);
screens.draw(ctx, 740, 480);
assert.equal(screens.rollDone, true, 'roll should be done after full credit roll');

screens.reset(s);
screens.ending(s);
screens.draw(ctx, 740, 480);
assert.equal(screens.rollDone, false, 'fresh credit roll is not done');
assert.equal(screens.mode(), 'credits', 'mode is credits before key');
screens.handleKey({ code: 'Space' });
assert.equal(screens.mode(), 'credits', 'Space does not exit before rollDone');
console.log('check-audit-state-screens: OK');