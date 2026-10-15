#!/usr/bin/env node
// Offline evidence assembly. Never changes original captures or game assets.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
const root = resolve(import.meta.dirname, '../evidence/hero-animation-polish');
const combat = process.argv.includes('--combat');
const captured = mode => resolve(root, mode, combat ? 'combat' : '.');
const before = JSON.parse(await readFile(resolve(captured('before'), 'manifest.json')));
const after = JSON.parse(await readFile(resolve(captured('after'), 'manifest.json')));
const best = { teknium: 'bladeC', nous_girl: 'whipA', turbofit: 'axeHeavy' };
const entries = [];
for (const clip of after.clips) {
  const old = before.clips.find(c => c.hero === clip.hero && c.move === clip.move);
  if (!old) throw Error(`Missing baseline ${clip.hero}/${clip.move}`);
  const relative = `comparison/${combat ? 'combat/' : ''}${clip.hero}`;
  const out = resolve(root, relative);
  await mkdir(out, { recursive: true });
  const inputs = [resolve(captured('before'), old.file), resolve(captured('after'), clip.file)];
  // Crop each clip to right-facing actor: both sides retain actual 0.7 game scale.
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', inputs[0], '-i', inputs[1], '-filter_complex',
    "[0:v]crop=480:300:0:0,drawtext=text='BEFORE':x=12:y=275:fontsize=16:fontcolor=white[a];[1:v]crop=480:300:0:0,drawtext=text='AFTER':x=12:y=275:fontsize=16:fontcolor=white[b];[a][b]hstack=shortest=1[v]",
    '-map', '[v]', '-an', '-c:v', 'libx264', '-crf', '20', '-pix_fmt', 'yuv420p', resolve(out, clip.move + '.mp4')]);
  for (const [mode, data] of [['before', old], ['after', clip]]) {
    const activeTime = data.sequence.slice(0, Math.max(1, data.sequence.findIndex(s => s.phase === 'active'))).reduce((n, s) => n + s.time, 0) + .03;
    execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-ss', String(Math.min(combat ? .4 : activeTime, data.frames / 60 - .05)), '-i', resolve(captured(mode), data.file), '-frames:v', '1', resolve(captured(mode), clip.hero, clip.move + '.scale.png')]);
    let sample;
    if (combat) {
      const trace = JSON.parse(await readFile(resolve(captured(mode), clip.hero, clip.move + '.json'))).filter(f => f.side === 0);
      const wind = trace.filter(f => f.phase === 'wind'), active = trace.filter(f => f.phase === 'active'), rec = trace.filter(f => f.phase === 'rec');
      sample = [0, wind[0]?.frame, wind.at(-1)?.frame, active[0]?.frame, active.find(f => f.hitStop > 0)?.frame, active.at(-1)?.frame, rec[Math.floor(rec.length / 2)]?.frame, rec.at(-1)?.frame];
    } else {
      let f = 0; sample = [0];
      for (const s of data.sequence) { const end = f + Math.ceil(s.time * 60); if (s.phase) sample.push(f, end - 1); f = end; }
      sample.push(data.frames - 1);
      if (sample.length < 8) sample = Array.from({ length: 8 }, (_, i) => Math.floor(i * (data.frames - 1) / 7));
    }
    const indices = [...new Set(sample.filter(Number.isFinite).map(f => Math.max(0, Math.floor(f / 2))))].sort((a, b) => a - b);
    const select = indices.map(n => `eq(n\\,${n})`).join('+');
    execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', resolve(captured(mode), data.file), '-vf', `select=${select},tile=1x${indices.length}`, '-frames:v', '1', resolve(captured(mode), clip.hero, clip.move + '.phases.png')]);
  }
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', resolve(captured('before'), clip.hero, clip.move + '.png'), '-i', resolve(captured('after'), clip.hero, clip.move + '.png'), '-filter_complex', 'hstack=shortest=1', '-frames:v', '1', resolve(out, clip.move + '.png')]);
  if (best[clip.hero] === clip.move || (combat && clip.move === 'combo')) execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', resolve(out, clip.move + '.mp4'), '-filter_complex', '[0:v]fps=20,split[a][b];[a]palettegen[p];[b][p]paletteuse', resolve(out, clip.move + '.gif')]);
  entries.push(`| ${clip.hero} | ${clip.move} | [MP4](${relative}/${clip.move}.mp4) | [strip](${relative}/${clip.move}.png) |`);
}
await writeFile(resolve(root, combat ? 'COMBAT_CLIPS.md' : 'CLIPS.md'), '# Before / after motion review\n\nGame scale 0.7, right-facing side by side. Original before/after MP4s contain both facings.\n\n| Hero | Move / state | Clip | Strip |\n|---|---|---|---|\n' + entries.join('\n') + '\n');
console.log(`Compared ${entries.length} clips; produced three featured GIFs and game-scale active-frame captures.`);
