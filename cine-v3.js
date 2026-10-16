// cine-v3.js (story v3): speaker portraits over the character-free backdrops, and the live
// Discord screen on Donatello's CRT in the ORIGIN panel. Plain canvas, no assets beyond the
// portrait PNGs below; cinematics.js owns the timing and calls in here to draw.
export const PORTRAITS = {
  // manga busts keyed from the story-portrait sources (the title-screen cutouts in
  // assets/cine/title/ are left alone for the title and select screens)
  'DONATELLO': 'assets/cine/v3/portraits/donatello.png',
  'LEONARDO': 'assets/cine/v3/portraits/leonardo.png',
  'RAPHAEL': 'assets/cine/v3/portraits/raphael.png',
  'MICHELANGELO': 'assets/cine/v3/portraits/michelangelo.png',
  'TEKNIUM': 'assets/cine/v3/portraits/teknium.png',
  'NOUS GIRL': 'assets/cine/v3/portraits/nous_girl.png',
  'TURBOFIT': 'assets/cine/v3/portraits/turbofit.png',
  'DON PIEDRO': 'assets/cine/v3/portraits/don_piedro.png',
  'THE MACHINE': 'assets/allies/machine/portrait.png', // PR #4 ally card (framed, opaque)
  'SHREDCLAW': 'assets/bosses/splash/shredclaw.png'
};
// Every story portrait is now a bust (cropped at the chest), so they all fade out at the bottom.
const BUSTS = new Set(['TEKNIUM', 'NOUS GIRL', 'TURBOFIT', 'SHREDCLAW', 'DONATELLO', 'LEONARDO', 'RAPHAEL', 'MICHELANGELO', 'DON PIEDRO', 'THE MACHINE']);
// The Machine's PR #4 portrait is a framed opaque card, not a cut-out bust: draw it smaller so it reads as a comm screen.
const SCALE = { 'THE MACHINE': 0.72 };
// Which way each bust looks in its source art; a portrait is mirrored so it faces into the frame.
const FACES = { 'DONATELLO': 'left', 'LEONARDO': 'left', 'MICHELANGELO': 'left', 'RAPHAEL': 'right', 'TEKNIUM': 'right', 'NOUS GIRL': 'right', 'TURBOFIT': 'right', 'DON PIEDRO': 'right' };
export const VILLAINS = new Set(['SHREDCLAW']);
export const GROUP = ['LEONARDO', 'DONATELLO', 'RAPHAEL', 'MICHELANGELO'];
export const NAME_COLOR = {
  'DONATELLO': '#c58bff', 'LEONARDO': '#6fb6ff', 'RAPHAEL': '#ff6b6b', 'MICHELANGELO': '#ffab4a',
  'TEKNIUM': '#5fe08a', 'NOUS GIRL': '#e9eef5', 'TURBOFIT': '#ff9a52', 'DON PIEDRO': '#ffd23f',
  'SHREDCLAW': '#ff4a4a', 'TURTLES': '#9bd66a', 'THE MACHINE': '#3fe0e8'
};
// Hero select names (heroes.js) -> portrait speaker, for the '{HERO}' lines.
const HERO_NAME = {
  'PURPLE TURTLE': 'DONATELLO', 'BLUE TURTLE': 'LEONARDO', 'RED TURTLE': 'RAPHAEL', 'ORANGE TURTLE': 'MICHELANGELO',
  'NOUS GIRL': 'NOUS GIRL', 'TEKNIUM': 'TEKNIUM', 'TURBOFIT': 'TURBOFIT', 'DON PIEDRO': 'DON PIEDRO'
};
const pimg = {};
export function preloadPortraits() {
  if (typeof Image === 'undefined') return pimg;
  for (const [k, url] of Object.entries(PORTRAITS)) { if (pimg[k]) continue; const i = new Image(); i.onerror = () => {}; i.src = url; pimg[k] = i; }
  return pimg;
}
const ready = k => pimg[k] && pimg[k].complete && pimg[k].naturalWidth;
// 'SPEAKER: text' -> speaker key. Works on the RAW line (before {HERO} is filled in).
export function speakerOf(raw, heroName) {
  const s = String(raw || '');
  if (s.startsWith('{HERO}')) return HERO_NAME[String(heroName || '').toUpperCase()] || null;
  const m = /^([A-Z][A-Z .']{1,20}):\s/.exec(s);
  if (!m) return null;                                  // narration
  const n = m[1].trim();
  if (n === 'TURTLES') return 'TURTLES';
  return PORTRAITS[n] ? n : null;
}
// Cached canvas per portrait: trimmed, bust bottoms faded, plus a dimmed copy.
const cache = {};
function sprite(k, dim) {
  const id = k + (dim ? ':d' : '');
  if (cache[id]) return cache[id];
  if (!ready(k) || typeof document === 'undefined') return null;
  const im = pimg[k], c = document.createElement('canvas');
  c.width = im.naturalWidth; c.height = im.naturalHeight;
  const g = c.getContext('2d'); g.drawImage(im, 0, 0);
  if (BUSTS.has(k)) {
    g.globalCompositeOperation = 'destination-in';
    const gr = g.createLinearGradient(0, c.height * 0.80, 0, c.height);
    gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, c.width, c.height);
    g.globalCompositeOperation = 'source-over';
  }
  if (dim) { g.globalCompositeOperation = 'source-atop'; g.fillStyle = 'rgba(8,10,24,0.55)'; g.fillRect(0, 0, c.width, c.height); }
  cache[id] = c; return c;
}
// Per-panel portrait state lives on the panel copy (so a crossfading previous panel keeps its own).
// slots.left / slots.right = { key, t } (t = panel time it arrived); out = list of fading leavers.
export function stepPortraits(s, raw, heroName, t, opts) {
  const p = s._pt || (s._pt = { slots: { left: null, right: null }, out: [], active: null, cur: undefined, last: null, groupT: -1 });
  let key = raw == null ? undefined : speakerOf(raw, heroName);
  // opts.hero: a narration line in this panel keeps the chosen hero on stage (boss defeat, ending)
  if (key === null && opts.hero) key = speakerOf('{HERO}', heroName);
  if (key === p.cur) return p;
  p.cur = key;
  if (key === 'TURTLES') { p.active = null; p.groupT = t; return p; }
  p.groupT = -1;
  if (!key || (opts.skip && opts.skip.includes(key))) { p.active = null; return p; }   // narration: everyone dims
  let side = p.slots.left && p.slots.left.key === key ? 'left' : p.slots.right && p.slots.right.key === key ? 'right' : null;
  if (!side) {
    if (opts.side) side = opts.side;
    else if (VILLAINS.has(key)) side = 'right';
    else side = p.last === 'left' ? 'right' : 'left';    // conversation flips side to side
    const old = p.slots[side];
    if (old) p.out.push({ ...old, side, gone: t });
    p.slots[side] = { key, t };
  }
  p.active = side; p.last = side;
  return p;
}
const ease = v => 1 - Math.pow(1 - Math.max(0, Math.min(1, v)), 3);
// Portraits stand on the top edge of the caption area (bottom = floorY) so they never cover text.
export function drawPortraits(ctx, W, H, s, t, floorY, motion) {
  const p = s._pt; if (!p) return;
  const maxH = Math.max(120, Math.min(300, floorY - 40));
  const one = (k, side, alpha, slide, dim) => {
    const sp = sprite(k, dim); if (!sp) return;
    const bust = BUSTS.has(k);
    let h = (bust ? maxH * 0.92 : maxH) * (SCALE[k] || 1);
    let w = h * sp.width / sp.height;
    const maxW = W * (VILLAINS.has(k) ? 0.5 : (s.portraitMaxW || 0.42)); if (w > maxW) { h *= maxW / w; w = maxW; }
    const pad = 18, dir = side === 'left' ? -1 : 1;
    const x = (side === 'left' ? pad : W - pad - w) + dir * slide * 46 * motion;
    const y = floorY - h + (bust ? 6 : 0);
    ctx.save(); ctx.globalAlpha *= alpha;
    const flip = !VILLAINS.has(k) && FACES[k] && (FACES[k] === 'left') === (side === 'left');   // face inward
    if (flip) { ctx.translate(x + w, y); ctx.scale(-1, 1); ctx.drawImage(sp, 0, 0, w, h); }
    else ctx.drawImage(sp, x, y, w, h);
    ctx.restore();
  };
  for (const o of p.out) { const a = 1 - (t - o.gone) / 0.22; if (a > 0) one(o.key, o.side, a, (1 - a) * 0.6, true); }
  p.out = p.out.filter(o => t - o.gone < 0.22);
  for (const side of ['left', 'right']) {
    const sl = p.slots[side]; if (!sl) continue;
    const a = ease((t - sl.t) / 0.28), on = p.active === side;
    const back = p.groupT >= 0 ? 1 - 0.7 * ease((t - p.groupT) / 0.3) : 1;   // step back for the TURTLES row
    one(sl.key, side, a * (on ? 1 : 0.85) * back, 1 - a, !on);
  }
  if (p.groupT >= 0) {   // TURTLES: all four busts in an overlapping row, outer pair behind, facing the middle
    const a = ease((t - p.groupT) / 0.3), keys = GROUP.filter(ready); if (!keys.length) return;
    const sps = keys.map(k => sprite(k, false)), ar = Math.max(...sps.map(sp => sp.width / sp.height));
    const step = 0.6, w = Math.min(W * 0.92 / (1 + step * (keys.length - 1)), maxH * 0.8 * ar), h = w / ar;
    const x0 = W / 2 - (w + step * w * (keys.length - 1)) / 2;
    const order = keys.map((k, i) => i).sort((i, j) => Math.abs(j - (keys.length - 1) / 2) - Math.abs(i - (keys.length - 1) / 2));
    for (const i of order) {
      const k = keys[i], sp = sps[i]; const bw = h * sp.width / sp.height, x = x0 + i * step * w + (w - bw) / 2;
      const want = i < keys.length / 2 ? 'right' : 'left', flip = FACES[k] && FACES[k] !== want;
      ctx.save(); ctx.globalAlpha *= a; ctx.translate(0, floorY - h + 6 + (1 - a) * 20);
      if (flip) { ctx.translate(x + bw, 0); ctx.scale(-1, 1); ctx.drawImage(sp, 0, 0, bw, h); } else ctx.drawImage(sp, x, 0, bw, h);
      ctx.restore();
    }
  }
}

// ---- Live Discord on Donatello's CRT (ORIGIN panel) ----------------------------------------
// The CRT glass in bg_donnie_lair.jpg, in 1280x720 image px.
export const CRT = { x: 262, y: 186, w: 318, h: 236 };
// Messages appear in sync with the panel's line index (li: 0 = title, 1 = first line ...).
// Handles are fictional except teknium, who is a hero in the game.
const FEED = [
  { at: -1, who: 'sewer_dev', col: '#e0a24a', text: 'anyone else seeing claw marks in the logs?' },
  { at: -1, who: 'lobster_watch', col: '#7aa7ff', text: 'callbacks we never wrote. 3am. again.' },
  { at: 2, who: 'teknium', col: '#5fe08a', hi: true, text: 'Hermes gang is under attack. A rogue claw agent escaped its sandbox and is hijacking tool calls. We need help. Anyone near the city sewers?' },
  { at: 4, who: 'claw_watch', col: '#ff7a7a', text: 'it just rewrote its own SOUL.md' },
  { at: 7, who: 'donnie_tech', col: '#c58bff', text: 'on my way. bringing three brothers.' }
];
const TYPING = [{ from: 1, to: 2, who: 'teknium' }, { from: 3, to: 4, who: 'claw_watch' }, { from: 6, to: 7, who: 'donnie_tech' }];
function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r); ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath(); }
function wrap(ctx, text, maxW) {
  const out = []; let cur = '';
  for (const w of String(text).split(' ')) { const n = cur ? cur + ' ' + w : w; if (ctx.measureText(n).width > maxW && cur) { out.push(cur); cur = w; } else cur = n; }
  if (cur) out.push(cur); return out;
}
// map: image px -> canvas px is (ox + x * k, oy + y * k). li = current line index, t = panel time.
export function drawDiscord(ctx, map, s, li, t) {
  const d = s._disc || (s._disc = { seen: {} });
  const { ox, oy, k } = map, R = CRT;
  ctx.save();
  ctx.translate(ox + R.x * k, oy + R.y * k); ctx.scale(k, k);   // local space: R.w x R.h image px
  const W = R.w, H = R.h;
  rr(ctx, 0, 0, W, H, 10); ctx.clip();
  const on = Math.min(1, t / 0.6);                              // CRT warm-up
  ctx.globalAlpha = on;
  ctx.fillStyle = '#313338'; ctx.fillRect(0, 0, W, H);
  // server rail
  ctx.fillStyle = '#1e1f22'; ctx.fillRect(0, 0, 30, H);
  const icons = ['#5865f2', '#3ba55d', '#c58bff', '#ed4245', '#faa61a'];
  icons.forEach((c, i) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(15, 18 + i * 28, 10, 0, Math.PI * 2); ctx.fill(); });
  ctx.fillStyle = '#fff'; ctx.font = 'bold 8px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('NR', 15, 21); ctx.textAlign = 'left';
  ctx.fillStyle = '#f2f3f5'; ctx.fillRect(0, 9, 3, 18);         // selected-server pill
  // channel list
  ctx.fillStyle = '#2b2d31'; ctx.fillRect(30, 0, 78, H);
  ctx.fillStyle = '#f2f3f5'; ctx.font = 'bold 10px sans-serif'; ctx.fillText('Nous Research', 36, 15);
  ctx.fillStyle = '#1f2023'; ctx.fillRect(30, 22, 78, 1);
  ctx.font = '9px sans-serif';
  ['general', 'hermes-agent', 'help', 'research', 'off-topic'].forEach((c, i) => {
    const y = 38 + i * 15, sel = c === 'hermes-agent';
    if (sel) { ctx.fillStyle = '#404249'; rr(ctx, 33, y - 10, 72, 14, 3); ctx.fill(); }
    ctx.fillStyle = sel ? '#f2f3f5' : '#949ba4'; ctx.fillText('# ' + c, 37, y);
  });
  // header
  ctx.fillStyle = '#313338'; ctx.fillRect(108, 0, W - 108, 22);
  ctx.fillStyle = '#f2f3f5'; ctx.font = 'bold 10px sans-serif'; ctx.fillText('# hermes-agent', 115, 15);
  ctx.fillStyle = '#26272b'; ctx.fillRect(108, 22, W - 108, 1);
  // messages, newest at the bottom
  const mx = 112, mw = W - mx - 8, lh = 10.5;
  const visible = FEED.filter(m => li >= m.at);
  for (const m of visible) if (d.seen[m.who + m.at] == null) d.seen[m.who + m.at] = m.at < 0 ? -9 : t;
  ctx.font = '9px sans-serif';
  const blocks = visible.map(m => ({ m, lines: wrap(ctx, m.text, mw - 26) }));
  const typing = TYPING.find(q => li >= q.from && li < q.to);
  let y = H - 30 - (typing ? 12 : 0);
  for (let i = blocks.length - 1; i >= 0 && y > 26; i--) {
    const { m, lines } = blocks[i], bh = 14 + lines.length * lh;
    const top = y - bh, a = Math.min(1, (t - d.seen[m.who + m.at]) / 0.3);
    ctx.save(); ctx.globalAlpha *= a; ctx.translate(0, (1 - a) * 8);
    if (m.hi) { ctx.fillStyle = 'rgba(250,166,26,0.10)'; ctx.fillRect(mx - 3, top - 2, mw + 6, bh + 2); ctx.fillStyle = '#faa61a'; ctx.fillRect(mx - 3, top - 2, 2, bh + 2); }
    ctx.fillStyle = m.col; ctx.beginPath(); ctx.arc(mx + 9, top + 9, 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.font = 'bold 8px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(m.who[0].toUpperCase(), mx + 9, top + 12); ctx.textAlign = 'left';
    ctx.fillStyle = m.col; ctx.font = 'bold 9px sans-serif'; ctx.fillText(m.who, mx + 24, top + 8);
    const nw = ctx.measureText(m.who).width;
    ctx.fillStyle = '#80848e'; ctx.font = '7px sans-serif'; ctx.fillText('Today 3:07 AM', mx + 28 + nw, top + 8);
    ctx.fillStyle = '#dbdee1'; ctx.font = '9px sans-serif';
    lines.forEach((l, j) => ctx.fillText(l, mx + 24, top + 19 + j * lh));
    ctx.restore();
    y = top - 5;
  }
  if (typing) {
    ctx.fillStyle = '#b5bac1'; ctx.font = 'bold 8px sans-serif';
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(mx + 3 + i * 5, H - 37 + Math.sin(t * 8 - i) * 1.5, 1.6, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillText(typing.who + ' is typing...', mx + 18, H - 34);
  }
  // composer
  ctx.fillStyle = '#383a40'; rr(ctx, mx - 2, H - 24, mw + 4, 16, 4); ctx.fill();
  ctx.fillStyle = '#6d6f78'; ctx.font = '8px sans-serif'; ctx.fillText('Message #hermes-agent', mx + 6, H - 13);
  // CRT: scanlines, glow, vignette, a little flicker
  ctx.globalAlpha = 1;
  ctx.fillStyle = 'rgba(0,0,0,0.16)'; for (let sy = 0; sy < H; sy += 2) ctx.fillRect(0, sy, W, 1);
  const band = ((t * 40) % (H + 40)) - 20; ctx.fillStyle = 'rgba(255,255,255,0.035)'; ctx.fillRect(0, band, W, 14);
  const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, W * 0.62);
  vg.addColorStop(0, 'rgba(120,160,255,0.06)'); vg.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = `rgba(150,190,255,${0.03 + 0.02 * Math.sin(t * 23)})`; ctx.fillRect(0, 0, W, H);
  if (on < 1) { ctx.fillStyle = `rgba(0,0,0,${1 - on})`; ctx.fillRect(0, 0, W, H); }
  ctx.restore();
  // glow spilling onto the bezel
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.18 * on;
  ctx.shadowColor = '#7aa0ff'; ctx.shadowBlur = 24 * k; ctx.strokeStyle = 'rgba(120,150,255,0.5)'; ctx.lineWidth = 2 * k;
  rr(ctx, ox + R.x * k, oy + R.y * k, R.w * k, R.h * k, 10 * k); ctx.stroke();
  ctx.restore();
}
