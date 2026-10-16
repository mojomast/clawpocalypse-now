// Compact screen-edge indicators so enemies that slip past the camera edge are
// still readable without leaving the play area. It only reads game state, so it
// cannot perturb physics, combat or the shared suite harnesses.
//
// Two QoL additions, both screen-space only:
//   - colour-safe layout: when OPTIONS.colourSafe is on, indicators on the same
//     side are fitted into fixed 44px slots inside the vertical bounds so they can
//     never overlap (including at the top/bottom edge), and when there are more
//     enemies than slots the overflow is folded into a single "+N" group badge.
//     Each enemy CATEGORY also gets a distinct drawn glyph (boss/rider 'B' in a
//     spiked badge, ext 'X', base a triangle outline) so colour is never the only
//     differentiator.
//   - with colourSafe OFF (the default) the output is exactly as before: one
//     indicator per enemy at its clamped y, no fitting, no glyphs.
import { OPTIONS } from './options-live.js';

const BAND = 44;         // vertical pitch between indicator slots
const LO = 56;           // keep badges inside [LO, H-LO]

function colourSafe() {
  try { return !!(OPTIONS && OPTIONS.colourSafe); } catch { return false; }
}
function categoryOf(n) {
  return (n.kind === 'boss' || n.rider) ? 'boss' : n.ext ? 'ext' : 'base';
}

// Fit sorted desired y values into [lo, hi] with at least BAND spacing. The
// result is non-decreasing and, whenever desired.length <= slots(lo,hi), every
// value stays inside [lo, hi] (this is what fixes bottom/top-edge crowding: a
// forward pass plus a whole-block shift, never a per-item clamp that collapses
// the stack onto one row).
function fitRows(desired, lo, hi) {
  const n = desired.length;
  if (!n) return [];
  const ys = desired.map(v => Math.max(lo, Math.min(hi, v)));
  for (let i = 1; i < n; i++) ys[i] = Math.max(ys[i], ys[i - 1] + BAND);
  if (ys[n - 1] > hi) { const d = ys[n - 1] - hi; for (let i = 0; i < n; i++) ys[i] -= d; }
  if (ys[0] < lo) { ys[0] = lo; for (let i = 1; i < n; i++) ys[i] = Math.max(ys[i], ys[i - 1] + BAND); }
  return ys;
}
function slotCount(lo, hi) { return Math.max(1, Math.floor((hi - lo) / BAND) + 1); }

// Distinct non-colour glyph per category, offset above the badge so it never
// hides the arrow or the name.
function drawCategoryGlyph(ctx, kind, x, y) {
  ctx.save();
  ctx.fillStyle = '#f7fff7';
  ctx.strokeStyle = '#f7fff7';
  ctx.lineWidth = 1.5;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (kind === 'boss') { // 'B' inside a spiked badge
    const r = 8;
    ctx.beginPath();
    for (let i = 0; i < 12; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 6, rad = i % 2 ? r * 0.62 : r;
      const px = x + Math.cos(a) * rad, py = y + Math.sin(a) * rad;
      if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
    }
    ctx.closePath(); ctx.stroke();
    ctx.font = 'bold 8px monospace';
    ctx.fillText('B', x, y);
  } else if (kind === 'ext') { // an unmistakable X
    ctx.font = 'bold 10px monospace';
    ctx.fillText('X', x, y);
  } else { // base: a triangle outline, distinct from the filled arrow
    ctx.beginPath();
    ctx.moveTo(x, y - 6); ctx.lineTo(x + 6, y + 5); ctx.lineTo(x - 6, y + 5);
    ctx.closePath(); ctx.stroke();
  }
  ctx.restore();
}

export function drawOffscreenIndicators(ctx, state, W, H, camX) {
  if (!state || !Array.isArray(state.ninjas)) return;
  const L = camX || 0, R = L + W;
  const lo = LO, hi = Math.max(lo + BAND, H - LO);
  const picks = [];
  for (const n of state.ninjas) {
    if (n.dead || !Number.isFinite(n.x)) continue;
    if (n.x >= L + 42 && n.x <= R - 42) continue; // already in view
    picks.push({ n, left: n.x < L + 42, y: Math.max(lo, Math.min(hi, n.y || H / 2)) });
  }

  const cs = colourSafe();
  let items;
  if (!cs) {
    // Default path: byte-identical to the pre-QoL build.
    items = picks.map(p => ({ n: p.n, left: p.left, y: p.y, count: 0 }));
  } else {
    items = [];
    for (const side of [true, false]) {
      const arr = picks.filter(p => p.left === side).sort((a, b) => a.y - b.y);
      if (!arr.length) continue;
      const slots = slotCount(lo, hi);
      if (arr.length <= slots) {
        const ys = fitRows(arr.map(p => p.y), lo, hi);
        arr.forEach((p, i) => items.push({ n: p.n, left: side, y: ys[i], count: 0 }));
      } else {
        // More enemies than slots: the first (slots-1) get their own slot and the
        // rest fold into one "+N" group badge at the last slot. Bounded, never
        // overlapping, always inside the canvas.
        const head = arr.slice(0, Math.max(0, slots - 1));
        const tail = arr.slice(Math.max(0, slots - 1));
        const ys = fitRows(head.map(p => p.y), lo, Math.max(lo, hi - BAND));
        head.forEach((p, i) => items.push({ n: p.n, left: side, y: ys[i], count: 0 }));
        items.push({ n: tail[0].n, left: side, y: hi, count: tail.length });
      }
    }
  }

  const shown = [];
  ctx.save();
  for (const it of items) {
    const n = it.n, y = it.y, left = it.left;
    shown.push(n);
    const x = left ? 28 : W - 28;
    if (it.count > 1) {
      // Overflow group: a compact count badge (no arrow, no name).
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.beginPath(); ctx.ellipse(x, y, 18, 16, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#f7fff7';
      ctx.font = 'bold 11px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('+' + it.count, x, y);
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      continue;
    }
    const color = n.kind === 'boss' || n.rider ? '#ff4bd4' : n.ext ? '#ffc24a' : '#68e8ff';
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.beginPath(); ctx.ellipse(x, y, 18, 16, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    if (left) { ctx.moveTo(x - 6, y); ctx.lineTo(x + 5, y - 8); ctx.lineTo(x + 5, y + 8); }
    else { ctx.moveTo(x + 6, y); ctx.lineTo(x - 5, y - 8); ctx.lineTo(x - 5, y + 8); }
    ctx.closePath(); ctx.fill();
    if (cs) drawCategoryGlyph(ctx, categoryOf(n), x, y);
    ctx.globalAlpha = .9;
    ctx.fillStyle = '#f7fff7';
    ctx.font = 'bold 8px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    // colour-safe keeps the name clear of the category glyph so both stay legible.
    // The label is y+30, which is < H because y <= H-LO.
    ctx.fillText((n.name || n.kind || 'E').slice(0, 4), x, cs ? y + 30 : y);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.globalAlpha = 1;
  }
  ctx.restore();
  return shown.length;
}
