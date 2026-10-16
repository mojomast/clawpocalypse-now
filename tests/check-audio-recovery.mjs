import assert from 'node:assert/strict';
import { createAudio } from '../audio.js';
import { MUSIC } from '../audio-pack.js';

const flush = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((r, j) => { resolve = r; reject = j; }); return { promise, resolve, reject }; };
const param = () => ({ value: 1, cancelScheduledValues() {}, setValueAtTime(v) { this.value = v; },
  linearRampToValueAtTime(v) { this.value = v; }, exponentialRampToValueAtTime(v) { this.value = v; }, setTargetAtTime(v) { this.value = v; } });
const node = () => ({ gain: param(), threshold: param(), knee: param(), ratio: param(), attack: param(), release: param(),
  connect() { return this; }, disconnect() {} });

async function fixture({ initiallyRunning = true, musicFails = 0, sfxFails = 0, decode = null, suspendGate = null,
  resumeGates = [], resumeChangesState = true } = {}) {
  const oldWindow = globalThis.window, oldFetch = globalThis.fetch;
  let clock = 100, musicCalls = 0, sfxCalls = 0;
  const contexts = [];
  class Context {
    constructor() { this.state = initiallyRunning ? 'running' : 'suspended'; this.currentTime = 0; this.sources = []; this.suspends = 0; this.resumes = 0; this.destination = node(); contexts.push(this); }
    createDynamicsCompressor() { return node(); }
    createGain() { return node(); }
    createBufferSource() {
      const source = { loop: false, playbackRate: param(), connect() { return this; }, start() { this.started = true; }, stop() { this.stopped = true; } };
      this.sources.push(source); return source;
    }
    decodeAudioData(bytes) { return decode ? decode(bytes) : Promise.resolve({ duration: 1, length: bytes.byteLength }); }
    suspend() { this.suspends++; return (suspendGate ? suspendGate.promise : Promise.resolve()).then(() => { this.state = 'suspended'; }); }
    resume() {
      this.resumes++;
      const gate = resumeGates.shift();
      return (gate ? gate.promise : Promise.resolve()).then(() => { if (resumeChangesState) this.state = 'running'; });
    }
  }
  globalThis.window = { AudioContext: Context };
  globalThis.fetch = async url => {
    const music = url.includes('music-pack');
    if (music) musicCalls++; else sfxCalls++;
    const fail = music ? musicCalls <= musicFails : sfxCalls <= sfxFails;
    return { ok: !fail, arrayBuffer: async () => ({ slice: (off, end) => ({ byteLength: end - off, offset: off }) }) };
  };
  const audio = createAudio({ now: () => clock, wait: async () => {}, retryCooldownMs: 100 });
  return { audio, contexts, advance: ms => { clock += ms; }, calls: () => ({ musicCalls, sfxCalls }),
    restore: () => { globalThis.window = oldWindow; globalThis.fetch = oldFetch; } };
}

{
  let failMusic = true, failSfx = true;
  const f = await fixture({ decode: bytes => {
    if (bytes.byteLength === MUSIC.boss[1] && failMusic) { failMusic = false; return Promise.reject(new Error('decode music')); }
    if (bytes.byteLength !== MUSIC.boss[1] && failSfx) { failSfx = false; return Promise.reject(new Error('decode sfx')); }
    return Promise.resolve({ duration: 1 });
  } });
  try {
    f.audio.music('boss'); await flush(); await flush();
    assert.equal(f.audio.stats.track, null);
    assert.equal(f.audio.stats.sfxLoaded, f.audio.stats.sfxTotal - 1);
    for (let i = 0; i < 50; i++) f.audio.music('boss');
    await flush();
    assert.equal(f.audio.stats.track, null);
    f.advance(100); f.audio.music('boss');
    await flush();
    assert.equal(f.audio.stats.track, 'boss');
    assert.equal(f.audio.stats.sfxLoaded, f.audio.stats.sfxTotal);
    assert.equal(f.calls().musicCalls, 1, 'decode retry reuses the successful pack');
    assert.equal(f.calls().sfxCalls, 1);
  } finally { f.restore(); }
}

{
  const f = await fixture({ musicFails: 6, sfxFails: 6 });
  try {
    const { audio } = f;
    audio.music('sewer');
    await flush(); await flush();
    assert.equal(f.calls().musicCalls, 6);
    assert.equal(f.calls().sfxCalls, 6);
    assert.equal(audio.stats.track, null);
    for (let i = 0; i < 200; i++) { audio.music('sewer'); audio.play('tick'); }
    await flush();
    assert.deepEqual(f.calls(), { musicCalls: 6, sfxCalls: 6 }, 'frames cannot hot-loop exhausted packs');
    f.advance(100);
    audio.music('sewer');
    await flush(); await flush();
    assert.equal(audio.stats.track, 'sewer');
    assert.equal(audio.stats.sfxLoaded, audio.stats.sfxTotal);
    assert.equal(f.contexts[0].sources.filter(s => s.loop && s.started).length, 1);
    for (let i = 0; i < 100; i++) audio.music('sewer');
    await flush();
    assert.equal(f.contexts[0].sources.filter(s => s.loop && s.started).length, 1);
    assert.equal(f.calls().musicCalls, 7);
  } finally { f.restore(); }
}

{
  const late = deferred();
  const f = await fixture({ decode: bytes => bytes.byteLength === MUSIC.sewer[1] ? late.promise : Promise.resolve({ duration: 1 }) });
  try {
    f.audio.music('sewer');
    await flush();
    f.audio.music('street');
    await flush();
    assert.equal(f.audio.stats.track, 'street');
    late.resolve({ duration: 1 });
    await flush();
    assert.equal(f.audio.stats.track, 'street');
    assert.equal(f.contexts[0].sources.filter(s => s.loop && s.started).length, 1);
  } finally { f.restore(); }
}

{
  const replacement = deferred();
  const f = await fixture({ decode: bytes => bytes.byteLength === MUSIC.street[1] ? replacement.promise : Promise.resolve({ duration: 1 }) });
  try {
    f.audio.music('sewer'); await flush();
    const old = f.contexts[0].sources.find(s => s.loop);
    f.audio.music('street'); await flush();
    assert.equal(old.stopped, undefined, 'old loop survives pending replacement');
    assert.equal(f.audio.stats.track, 'sewer');
    assert.equal(f.audio.stats.pendingTrack, 'street');
    replacement.resolve({ duration: 1 }); await flush();
    assert.equal(old.stopped, true);
    assert.equal(f.audio.stats.track, 'street');
    assert.equal(f.audio.stats.pendingTrack, null);
  } finally { f.restore(); }
}

{
  const f = await fixture();
  try {
    const a = f.audio;
    a.music('boss'); await flush();
    a.setVolume(0.6); a.setMusicVolume(0.4); a.toggle();
    const c = f.contexts[0];
    assert.equal(a.suspend(), true);
    assert.equal(a.suspend(), false);
    assert.equal(a.resume(), true); // resume while suspend is still settling
    await flush();
    assert.equal(c.suspends, 1);
    assert.equal(c.resumes, 1);
    assert.equal(a.state, 'running');
    assert.equal(a.musicName, 'boss');
    assert.equal(a.stats.track, 'boss');
    assert.equal(a.muted, true);
    assert.equal(a.volume, 0.6);
    assert.equal(a.musicVolume, 0.4);
    assert.equal(c.sources.filter(s => s.loop && s.started).length, 1);
  } finally { f.restore(); }
}

{
  const gate = deferred();
  const f = await fixture({ suspendGate: gate });
  try {
    f.audio.music('intro'); await flush();
    assert.equal(f.audio.suspend(), true);
    assert.equal(f.audio.resume(), true);
    assert.equal(f.contexts[0].resumes, 0, 'resume waits for pending suspend');
    gate.resolve(); await flush();
    assert.equal(f.contexts[0].suspends, 1);
    assert.equal(f.contexts[0].resumes, 1);
    assert.equal(f.audio.stats.track, 'intro');
  } finally { f.restore(); }
}

{
  const gate = deferred();
  const f = await fixture({ suspendGate: gate });
  try {
    const a = f.audio, c = f.contexts;
    a.music('boss'); await flush();
    a.toggle();
    assert.equal(a.suspend(), true);
    assert.equal(a.resume(), true);
    assert.equal(a.suspend(), true, 'latest suspend overrides pending resume');
    gate.resolve(); await flush();
    assert.equal(c[0].suspends, 1);
    assert.equal(c[0].resumes, 0, 'superseded resume is never issued');
    assert.equal(a.state, 'suspended');
    assert.equal(a.musicName, 'boss');
    assert.equal(a.muted, true);
    assert.equal(a.resume(), true);
    await flush();
    assert.equal(a.state, 'running');
    assert.equal(c[0].resumes, 1);
    assert.equal(a.stats.track, 'boss');
    assert.equal(a.muted, true);
  } finally { f.restore(); }
}

{
  const failed = deferred();
  const f = await fixture({ initiallyRunning: false, resumeGates: [failed] });
  try {
    const a = f.audio, c = f.contexts;
    a.music('sewer'); await flush();
    a.toggle();
    a.unlock();
    failed.reject(new Error('gesture blocked'));
    await flush();
    assert.equal(c[0].resumes, 1);
    assert.equal(a.state, 'suspended');
    assert.equal(a.stats.track, null);
    assert.equal(a.stats.errors, 1);
    await flush();
    assert.equal(c[0].resumes, 1, 'rejected resume must not retry itself');
    assert.equal(a.musicName, 'sewer');
    assert.equal(a.muted, true);
    a.unlock(); await flush();
    assert.equal(c[0].resumes, 2, 'new gesture retries rejected unlock');
    assert.equal(a.state, 'running');
    assert.equal(a.stats.track, 'sewer');
    assert.equal(a.muted, true);
  } finally { f.restore(); }
}

{
  const f = await fixture({ initiallyRunning: false, resumeChangesState: false });
  try {
    const a = f.audio;
    a.music('intro'); await flush();
    a.unlock(); await flush();
    assert.equal(f.contexts[0].resumes, 1, 'resolved resume without state progress must not spin');
    assert.equal(a.state, 'suspended');
    assert.equal(a.stats.track, null);
    assert.equal(a.musicName, 'intro');
    a.unlock(); await flush();
    assert.equal(f.contexts[0].resumes, 2, 'another gesture may retry an interrupted context');
  } finally { f.restore(); }
}

{
  const f = await fixture({ initiallyRunning: false });
  try {
    const a = f.audio;
    a.music('sewer'); await flush();
    assert.equal(a.suspend(), false);
    assert.equal(a.resume(), false);
    assert.equal(f.contexts[0].resumes, 0);
    a.play('tick');
    assert.equal(f.contexts[0].sources.length, 0, 'locked one-shots are dropped');
    a.unlock(); await flush();
    assert.equal(a.stats.track, 'sewer');
    assert.equal(f.contexts[0].resumes, 1);
    assert.equal(f.contexts[0].sources.filter(s => s.started).length, 1);
  } finally { f.restore(); }
}

console.log('check-audio-recovery: pack recovery, theme races, lifecycle and gesture checks passed');
