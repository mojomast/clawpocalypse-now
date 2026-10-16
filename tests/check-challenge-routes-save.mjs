import assert from 'node:assert/strict';
import { createState, spawnWave } from '../logic.js';
import { createCheckpoint, validSave, SAVE_KEY, SAVE_VERSION } from '../save.js';
import { createPause } from '../pause.js';
import { createScreens } from '../screens.js';

const raw = { v: SAVE_VERSION, wave: 2, hero: 'teknium', difficulty: 'normal', coins: 13, score: 50, lives: 3 };
assert.equal(validSave(raw).route, 'classic', 'old saves default to classic');
assert.equal(validSave({ ...raw, route: 'unknown' }).route, 'classic', 'unknown routes cannot enter the run');
assert.equal(validSave({ ...raw, route: 'challenge' }).route, 'challenge');

const disk = new Map();
const checkpoint = createCheckpoint({ store: {
  get: k => disk.get(k) ?? null, set: (k, v) => disk.set(k, v), remove: k => disk.delete(k),
} });
const s = createState(); s.hpMode = true; s.selectedHero = 'teknium';
s.route = 'classic'; s.nextRoute = 'challenge'; spawnWave(s);
checkpoint.watch(s);
assert.equal(checkpoint.load(), null, 'no midstage checkpoint');
s.wave = 2; s.route = s.nextRoute; s.nextRoute = 'classic';
checkpoint.watch(s);
assert.equal(checkpoint.load().route, 'challenge', 'stage entry snapshots active route, not pending route');
assert.equal(JSON.parse(disk.get(SAVE_KEY)).route, 'challenge');
s.coins = 42;
checkpoint.watch(s, { shop: true });
checkpoint.watch(s, { shop: false });
assert.equal(checkpoint.load().coins, 42, 'shop closure refreshes inventory');
assert.equal(checkpoint.load().route, 'challenge', 'shop closure does not save pending route');
s.coins = 999; s.nextRoute = 'classic';
checkpoint.watch(s);
assert.equal(checkpoint.load().coins, 42, 'midstage inventory changes do not overwrite the checkpoint');

const fresh = createState(); fresh.hpMode = true; fresh.route = 'classic'; fresh.nextRoute = 'classic';
spawnWave(fresh);
assert.equal(checkpoint.arm(), true);
assert.equal(checkpoint.resume(fresh), true);
assert.equal(fresh.wave, 2);
assert.equal(fresh.route, 'challenge');
assert.equal(fresh.nextRoute, 'challenge', 'resume overrides stale next-stage preference before spawn');
assert.equal(fresh.coins, 42);
assert.match(checkpoint.items()[0], /CHALLENGE/);

const legacy = createCheckpoint({ store: { get: () => JSON.stringify(raw), set() {} } });
const oldRun = createState(); oldRun.hpMode = true; oldRun.route = 'challenge'; oldRun.nextRoute = 'challenge'; spawnWave(oldRun);
legacy.arm(); legacy.resume(oldRun);
assert.equal(oldRun.route, 'classic'); assert.equal(oldRun.nextRoute, 'classic');

let active = 'classic', pending = 'classic', routeContext = 'stage';
const pause = createPause(740, 510, { getRoute: () => pending, getActiveRoute: () => active, getRouteContext: () => routeContext, onRouteChange: v => { pending = v; } });
const routeIndex = pause.optionRows().findIndex(r => r.id === 'route');
assert.ok(routeIndex >= 0, 'route selection is an options row');
pause.open('options');
for (let i = 0; i < routeIndex; i++) pause.handleKey({ code: 'ArrowDown' });
assert.equal(pause.index(), routeIndex);
pause.handleKey({ code: 'ArrowRight' });
assert.equal(pending, 'challenge'); assert.equal(active, 'classic');
const texts = [];
const ctx = { save() {}, restore() {}, fillRect() {}, strokeRect() {}, fillText(text) { texts.push(text); } };
pause.draw(ctx);
assert.ok(texts.some(t => t.includes('CHALLENGE (PENDING)')));
assert.ok(texts.some(t => t.includes('Current: CLASSIC')));
pause.handleKey({ code: 'ArrowLeft' });
assert.equal(pending, 'classic');
pause.handleKey({ code: 'Enter', preventDefault() {} });
assert.equal(pending, 'challenge', 'Enter uses the same option bridge as keyboard and pad confirmation');
active = 'challenge'; texts.length = 0; pause.draw(ctx);
assert.ok(texts.some(t => t.includes('CHALLENGE (ACTIVE)')));
routeContext = 'new'; pending = 'classic'; texts.length = 0;
assert.equal(pause.optionRows()[routeIndex].label, 'New run route');
pause.draw(ctx);
assert.ok(texts.includes('New run route'));
assert.ok(texts.some(t => t.includes('CLASSIC (SELECTED)')));
assert.ok(!texts.some(t => t.includes('Current:')));
pending = 'challenge'; texts.length = 0; pause.draw(ctx);
assert.ok(texts.some(t => t.includes('CHALLENGE (SELECTED)')));

const screens = createScreens();
const stage = createState(); stage.selectedHero = 'teknium'; stage.level = 0; stage.route = 'classic'; stage.ninjas = [];
screens.reset(stage);
stage.wave = 2; stage.level = 1; stage.route = 'challenge';
screens.stageClear(stage, 0);
assert.equal(screens.data.route, 'classic', 'clear card names the completed stage, not the next stage');
assert.equal(screens.data.level, 0);

console.log('check-challenge-routes-save: OK');
