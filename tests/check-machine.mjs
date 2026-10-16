// Dev check for the Machine Beneath the Skin ally.
// Run from the repo root: node tests/check-machine.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { HEROES } from '../heroes.js';
import { voiceLine, presentHeroes, speakLine } from '../events.js';
import { createCinematics } from '../cinematics.js';
import { createState } from '../logic.js';
import { createCombat, combatStep } from '../combat.js';
import { createMachine, shotBlocked, MACHINE, MACHINE_LINES, PORTRAIT, ATLAS, FX } from '../machine.js';

const grunt = (x, y, hp = 6) => ({ kind: 'striker', x, y, r: 14, hp, maxHp: hp, vx: 0, vy: 0, dead: false });
const fresh = (x = 240) => {
  const s = createState();
  s.hpMode = true;
  s.level = 0;
  s.player.x = x;
  s.player.y = 380;
  s.combat = { facing: 1 };
  s.ninjas = [];
  s.selectedHero = 'turtle_blue';
  return s;
};

// Packed art is real image bytes, not placeholders.
{
  const atlas = readFileSync('assets/allies/machine/atlas.webp');
  const fx = readFileSync('assets/allies/machine/fx.webp');
  const portrait = readFileSync('assets/allies/machine/portrait.png');
  const cine = readFileSync('assets/cine/machine_meet.jpg');
  assert.equal(atlas.subarray(0, 4).toString(), 'RIFF');
  assert.equal(atlas.subarray(8, 12).toString(), 'WEBP');
  assert.equal(fx.subarray(0, 4).toString(), 'RIFF');
  assert.equal(fx.subarray(8, 12).toString(), 'WEBP');
  assert.equal(portrait.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(cine[0], 0xff);
  assert.ok(atlas.length > 20000 && atlas.length < 400000, 'atlas size');
  assert.ok(fx.length > 20000 && fx.length < 500000, 'fx atlas size');
  assert.equal(ATLAS.frames.idle.y + ATLAS.frames.idle.h, ATLAS.h);
  assert.equal(ATLAS.frames.down.y + ATLAS.frames.down.h, ATLAS.h, 'shared baseline');
  assert.equal(Object.keys(FX.frames).length, 12);
}

// Every hero who can be in a run has their own vault reply and migration payoff.
{
  for (const h of HEROES) {
    const a = voiceLine(h.id, 'vault', 0, { level: 0 });
    const b = voiceLine(h.id, 'vault', 1, { level: 0 });
    assert.ok(a && b && a !== b, h.id + ' vault');
    const m = voiceLine(h.id, 'migrate', 0, { level: 4 });
    const n = voiceLine(h.id, 'migrate', 1, { level: 4 });
    assert.ok(m && n && m !== n, h.id + ' migrate');
    assert.ok(m.length < 90 && a.length < 90, h.id + ' stays short');
  }
  assert.ok(MACHINE_LINES.meet.length < 48 && MACHINE_LINES.hold.length < 48);
  assert.equal(PORTRAIT, 'assets/allies/machine/portrait.png');
}

// Cinematic meeting, and the migration payoff names the command without deleting anyone.
{
  const cine = createCinematics(null);
  const panels = cine.panels();
  assert.equal(panels.machineMeet.img, 'machineMeet');
  assert.ok(panels.machineMeet.lines.filter(l => l.startsWith('THE MACHINE:')).length >= 2);
  assert.ok(panels.machineMeet.lines.some(l => /hermes claw migrate/i.test(l)));
  assert.ok(panels.bossDefeat.lines.some(l => l.startsWith('THE MACHINE:')));
  assert.ok(panels.bossDefeat.lines.some(l => /hermes claw migrate/i.test(l) && /nothing deleted/i.test(l)));
  assert.ok(panels.ending.lines.some(l => /machine/i.test(l)));
}

// Meter: hits, KOs and hurt. A cast and its cooldown do not bank that damage.
{
  const s = fresh();
  const m = createMachine();
  const foe = grunt(s.player.x + 30, s.player.y, 4);
  s.ninjas = [foe];
  m.step(s, 1 / 60);
  foe.hp = 2;
  m.step(s, 1 / 60);
  assert.equal(m.gauge(s), MACHINE.GAIN.hit);
  foe.dead = true;
  m.step(s, 1 / 60);
  assert.equal(m.gauge(s), MACHINE.GAIN.hit + MACHINE.GAIN.ko);
  const before = s.hp;
  s.hp = before - 15;
  m.step(s, 1 / 60);
  assert.equal(m.gauge(s), MACHINE.GAIN.hit + MACHINE.GAIN.ko + MACHINE.GAIN.hurt);
  assert.equal(m.press(s), false, 'not full yet');
}

// P2 damage fills the same meter. Two pads cannot double-summon.
{
  const s = fresh();
  const mButtons = () => Array.from({ length: 16 }, () => ({ pressed: false, value: 0 }));
  const pads = [{ connected: true, buttons: mButtons() }, { connected: true, buttons: mButtons() }];
  const m = createMachine({ getPads: () => pads });
  const p2 = Object.create(s);
  p2.player = { x: s.player.x - 50, y: s.player.y, r: 16 };
  p2.hp = 90;
  p2.over = false;
  p2.combat = { facing: 1 };
  s.machinePartner = p2;
  m.step(s, 1 / 60);
  p2.hp = 70;
  m.step(s, 1 / 60);
  assert.equal(m.gauge(s), MACHINE.GAIN.hurt);
  for (let i = 0; i < 20; i++) m.gain(s, 'ko');
  assert.equal(m.gauge(s), MACHINE.MAX);
  pads[0].buttons[MACHINE.R3] = { pressed: true, value: 1 };
  pads[1].buttons[MACHINE.R3] = { pressed: true, value: 1 };
  m.step(s, 1 / 60);
  assert.equal(m.phase(s), 'activate');
  assert.equal(m.stats.fired, 1, 'both pads are one summon');
  assert.equal(m.press(p2), false, 'P2 view shares the cast');
  assert.equal(m.press(s), false);
  m.step(s, 1 / 60);
  assert.equal(m.stats.fired, 1, 'held R3 does not retrigger');
}

// Beam hits a lane, bosses take less, and the blast does not refill the meter.
{
  const s = fresh();
  const m = createMachine();
  const front = grunt(s.player.x + 150, s.player.y);
  const boss = { kind: 'boss', boss: true, name: 'SHREDCLAW', x: s.player.x + 210, y: s.player.y, r: 26, hp: 40, maxHp: 40, vx: 0, vy: 0, dead: false };
  const behind = grunt(s.player.x - 180, s.player.y);
  const other = grunt(s.player.x + 150, s.player.y + 90);
  s.ninjas = [front, boss, behind, other];
  for (let i = 0; i < 20; i++) m.gain(s, 'ko');
  assert.equal(m.press(s), true);
  assert.equal(m.mode(s), 'beam');
  assert.equal(m.gauge(s), 0);
  let guard = 0;
  while (m.phase(s) !== 'down' && guard++ < 80) m.step(s, 0.05);
  assert.equal(m.phase(s), 'down');
  assert.equal(front.hp, 6 - MACHINE.BEAM_DMG);
  assert.equal(boss.hp, 40 - MACHINE.BOSS_DMG);
  assert.ok(MACHINE.BOSS_DMG < MACHINE.BEAM_DMG);
  assert.equal(behind.hp, 6);
  assert.equal(other.hp, 6);
  assert.equal(boss.react, 'flinch');
  assert.notEqual(front.react, 'knockdown');
  assert.equal(m.gauge(s), 0, 'beam damage does not refill');
  assert.equal(m.stats.bossHits, 1);
  assert.equal(m.stats.hits, 2);
  while (m.phase(s) !== 'idle') m.step(s, 0.05);
  assert.ok(m.cool(s) > 0);
  assert.equal(m.gain(s, 'ko'), 0, 'cooldown ignores gains');
  assert.equal(m.press(s), false, 'cooldown blocks a second summon');
  m.step(s, m.cool(s));
  assert.equal(m.cool(s), 0);
  assert.equal(m.press(s), false, 'meter is empty after cooldown');
  for (let i = 0; i < 20; i++) m.gain(s, 'ko');
  assert.equal(m.press(s), true);
  assert.equal(m.mode(s), 'shield', 'summons alternate');
}

// Hex dome blocks a projectile on the players and leaves a far shot alone.
{
  const s = fresh();
  createCombat(s);
  s.player.x = 240;
  s.player.y = 380;
  const m = createMachine();
  for (let i = 0; i < 20; i++) m.gain(s, 'ko');
  assert.equal(m.press(s, 'shield'), true);
  let guard = 0;
  while (m.phase(s) !== 'shield' && guard++ < 40) m.step(s, 0.05);
  assert.equal(m.phase(s), 'shield');
  const hp = s.hp;
  const near = { x: s.player.x + 8, y: s.player.y - 36, vx: 0, r: 8, dmg: 12, t: 0 };
  s.enemyShots = [near];
  combatStep(s, 1 / 60);
  assert.equal(s.hp, hp, 'dome blocks the shot');
  assert.equal(near.dead, true);
  assert.ok((s.machineBlocked || 0) >= 1);
  const far = { x: s.player.x + 420, y: s.player.y - 36, vx: 0, r: 8, dmg: 12, t: 0 };
  assert.equal(shotBlocked(s, far), false);
  s.enemyShots = [far];
  combatStep(s, 1 / 60);
  assert.ok(!far.dead, 'a far shot is not deleted');
  assert.equal(s.hp, hp);
}

// Meeting plays once in the sewers. Only the hero in the run answers.
{
  const plays = [];
  const m = createMachine({ playScene: (id, done) => { plays.push(id); if (done) done(); } });
  const s = fresh(100);
  s.selectedHero = 'turtle_red';
  s.voiceSeed = 0;
  m.step(s, 1 / 60);
  assert.equal(plays.length, 0);
  s.player.x = MACHINE.MEET_X;
  m.step(s, 1 / 60);
  assert.deepEqual(plays, ['machineMeet']);
  m.step(s, 1 / 60);
  assert.equal(plays.length, 1);
  assert.equal(s.events.line.speaker, 'THE MACHINE');
  assert.equal(s.events.line.portrait, PORTRAIT);
  assert.equal(s.events.line.text, MACHINE_LINES.meet);
  const reply = s.events.lineQ && s.events.lineQ[0];
  assert.equal(reply.hero, 'turtle_red');
  assert.equal(reply.key, 'vault');
  assert.ok(reply.text.includes('sai') || reply.text.includes('shield'));
  assert.deepEqual(presentHeroes(s), ['turtle_red']);
}

// Climax: the Machine speaks, then only a present hero, once.
{
  const m = createMachine();
  const s = fresh();
  s.level = 4;
  s.selectedHero = 'teknium';
  s.voiceSeed = 0;
  s.ninjas = [{ kind: 'boss', name: 'SHREDCLAW', boss: true, hp: 75, maxHp: 75, dead: false, x: 400, y: 380, r: 26, vx: 0, vy: 0 }];
  m.step(s, 1 / 60);
  assert.equal(s.machinePayoff, true);
  assert.equal(s.events.line.speaker, 'THE MACHINE');
  assert.equal(s.events.line.text, MACHINE_LINES.hold);
  const reply = s.events.lineQ[0];
  assert.equal(reply.hero, 'teknium');
  assert.equal(reply.key, 'migrate');
  assert.ok(/migrate/i.test(reply.text));
  const said = s.events.log.filter(e => e.key === 'migrate').length;
  m.step(s, 1 / 60);
  assert.equal(s.events.log.filter(e => e.key === 'migrate').length, said);
  // An absent hero is not handed the line.
  const other = speakLine(s, 'migrate', { level: 4, hero: 'don_piedro' });
  assert.notEqual(other.hero, 'don_piedro');
}

console.log('check-machine: meter, beam, dome, 2P, story ok');
