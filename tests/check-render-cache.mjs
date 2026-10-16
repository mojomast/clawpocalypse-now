#!/usr/bin/env node
// Node-feasible bounded-cache unit test for tint-cache.js (roadmap item 10).
// No real canvas is needed: an injected createCanvas returns a stub whose 2d
// context only records the filter/drawImage call. Run: node tests/check-render-cache.mjs
import assert from 'node:assert/strict';
import { createTintCache } from '../tint-cache.js';

let checks = 0;
const ok = (label, cond) => { assert.ok(cond, label); checks++; };

// A stub image: width/height only (naturalWidth undefined exercises the fallback).
const image = (w, h) => ({ width: w, height: h });
// A stub canvas: real width/height (the cache may set them) + a 2d context.
function stubCanvas() {
  const canvas = { width: 0, height: 0 };
  const ctx = { filter: 'none', draws: 0, drawImage() { this.draws += 1; } };
  canvas.getContext = () => ctx;
  canvas.__ctx = ctx;
  return canvas;
}

// --- 1. bake once, then hit ------------------------------------------------
{
  const made = [];
  const cache = createTintCache({ createCanvas: () => { const c = stubCanvas(); made.push(c); return c; }, maxEntries: 8, maxPixels: 1_000_000 });
  const a = image(8, 8);
  const first = cache.get(a, 'brightness(0.6)');
  ok('bake returns a canvas', first && first.width === 8 && first.height === 8);
  ok('bake recorded exactly one factory call', made.length === 1);
  ok('bake applied the filter before drawing', first.__ctx.filter === 'brightness(0.6)' && first.__ctx.draws === 1);
  ok('size is one entry', cache.size === 1);
  ok('pixels counted', cache.stats.pixels === 64 && cache.pixels === 64);
  ok('one bake', cache.stats.bakes === 1 && cache.stats.misses === 1 && cache.stats.hits === 0);
  const second = cache.get(a, 'brightness(0.6)');
  ok('repeat get is a hit and returns the same canvas', second === first);
  ok('no second bake', made.length === 1 && cache.stats.bakes === 1);
  ok('hit counted', cache.stats.hits === 1);
  ok('has() true for the cached pair', cache.has(a, 'brightness(0.6)') === true);
  ok('has() false for a different filter', cache.has(a, 'brightness(0.9)') === false);
  ok('has() false for a different image', cache.has(image(8, 8), 'brightness(0.6)') === false);
}

// --- 2. falsy / none filters never bake ------------------------------------
{
  const cache = createTintCache({ createCanvas: stubCanvas });
  const a = image(8, 8);
  ok('none -> null', cache.get(a, 'none') === null);
  ok('NONE (case) -> null', cache.get(a, 'NONE') === null);
  ok('empty -> null', cache.get(a, '') === null);
  ok('undefined -> null', cache.get(a, undefined) === null);
  ok('whitespace -> null', cache.get(a, '   ') === null);
  ok('no bake/no miss for none', cache.stats.bakes === 0 && cache.stats.misses === 0);
  ok('size still zero', cache.size === 0);
}

// --- 3. LRU eviction by entry count ----------------------------------------
{
  const cache = createTintCache({ createCanvas: stubCanvas, maxEntries: 3, maxPixels: 1_000_000 });
  const imgs = [image(8, 8), image(8, 8), image(8, 8), image(8, 8)];
  const c0 = cache.get(imgs[0], 'f0');
  cache.get(imgs[1], 'f1');
  cache.get(imgs[2], 'f2');
  ok('three entries fit', cache.size === 3 && cache.stats.evictions === 0);
  cache.get(imgs[0], 'f0'); // touch entry 0 -> most-recently-used
  const c3 = cache.get(imgs[3], 'f3'); // must evict entry 1 (LRU), not entry 0
  ok('size stays at maxEntries', cache.size === 3);
  ok('exactly one eviction', cache.stats.evictions === 1);
  ok('touched entry survived', cache.has(imgs[0], 'f0') === true);
  ok('least-recently-used entry evicted', cache.has(imgs[1], 'f1') === false);
  ok('new entry present', c3 && cache.has(imgs[3], 'f3') === true);
}

// --- 4. eviction by pixel budget -------------------------------------------
{
  const cache = createTintCache({ createCanvas: stubCanvas, maxEntries: 100, maxPixels: 100 });
  const a0 = image(8, 8), a1 = image(8, 8);
  cache.get(a0, 'f0'); // 64px
  cache.get(a1, 'f1'); // 64px -> would be 128 > 100, evict f0
  ok('pixel budget evicts', cache.stats.evictions === 1 && cache.size === 1);
  ok('pixels stay within budget', cache.pixels === 64 && cache.stats.pixels <= 100);
  ok('oldest evicted from budget', cache.has(a0, 'f0') === false && cache.has(a1, 'f1') === true);
  const huge = image(5000, 5000); // 25,000,000 px > budget
  const r = cache.get(huge, 'big');
  ok('oversized single entry falls back to null', r === null && cache.stats.fallbacks === 1);
  ok('oversized entry did not evict the cache', cache.size === 1 && cache.pixels === 64);
}

// --- 5. missing dimensions fall back ---------------------------------------
{
  const cache = createTintCache({ createCanvas: stubCanvas });
  ok('zero-size image -> null', cache.get(image(0, 0), 'f') === null);
  ok('missing image -> null', cache.get(null, 'f') === null);
  ok('fallbacks counted for the uncacheable image', cache.stats.fallbacks === 1);
}

// --- 6. disabled cache returns null ----------------------------------------
{
  const cache = createTintCache({ createCanvas: stubCanvas });
  const a = image(8, 8);
  cache.get(a, 'f');
  ok('entry before disabling', cache.size === 1);
  cache.setEnabled(false);
  ok('disabled get -> null', cache.get(a, 'f') === null);
  ok('disabling clears entries', cache.size === 0 && cache.pixels === 0);
  ok('disabled cache still reports enabled=false', cache.enabled === false);
  cache.setEnabled(true);
  ok('re-enabled cache bakes again', cache.get(a, 'f') !== null && cache.size === 1);
}

// --- 7. clear() empties the bounded state ----------------------------------
{
  const cache = createTintCache({ createCanvas: stubCanvas });
  cache.get(image(8, 8), 'f');
  cache.get(image(4, 4), 'g');
  cache.clear();
  ok('clear empties entries', cache.size === 0 && cache.stats.entries === 0);
  ok('clear zeroes pixels', cache.pixels === 0 && cache.stats.pixels === 0);
  ok('clear keeps cumulative counters', cache.stats.bakes === 2);
}

// --- 8. distinct-filter bound (maxFilters) ---------------------------------
{
  const cache = createTintCache({ createCanvas: stubCanvas, maxEntries: 100, maxPixels: 1_000_000, maxFilters: 2 });
  const a0 = image(8, 8), a1 = image(8, 8);
  ok('stats.filters starts at 0', cache.stats.filters === 0 && cache.filters === 0);
  cache.get(a0, 'f0');
  cache.get(a1, 'f1');
  ok('two distinct filters tracked', cache.stats.filters === 2 && cache.filters === 2);
  const over = cache.get(image(8, 8), 'f2');
  ok('new filter beyond maxFilters falls back to null', over === null);
  ok('fallback counted and no bake of the new filter', cache.stats.fallbacks === 1 && cache.stats.bakes === 2);
  ok('filter count stays bounded', cache.stats.filters === 2 && cache.filters === 2);
  // An EXISTING filter may still add entries under the entry/pixel budget.
  const more = cache.get(image(8, 8), 'f0');
  ok('existing filter can still be reused', more !== null && cache.stats.bakes === 3);
  ok('reuse does not grow the filter count', cache.filters === 2);
}

// --- 9. eviction frees a filter slot ---------------------------------------
{
  const cache = createTintCache({ createCanvas: stubCanvas, maxEntries: 2, maxPixels: 1_000_000, maxFilters: 2 });
  const a0 = image(8, 8), a1 = image(8, 8), a2 = image(8, 8), a3 = image(8, 8), a4 = image(8, 8);
  cache.get(a0, 'f0');
  cache.get(a1, 'f1');
  ok('two filters live at the cap', cache.filters === 2 && cache.size === 2);
  cache.get(a2, 'f1'); // evicts a0|f0, the last entry of f0
  ok('evicting the only f0 entry frees the filter slot', cache.filters === 1 && cache.size === 2);
  ok('a new filter fits after the slot was freed', cache.get(a3, 'f2') !== null && cache.filters === 2);
  ok('the cap is enforced again once refilled', cache.get(a4, 'f3') === null && cache.filters === 2);
}

console.log(`tint-cache: ${checks} assertions passed (bake/hit, none-fallback, LRU count, pixel budget, oversized fallback, disabled, clear, distinct-filter bound).`);
