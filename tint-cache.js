// Bounded, opt-in pre-tinted sprite cache (roadmap item 10).
//
// The per-part `ctx.filter` path in rig.js is the single largest measured
// software-raster cost, but a pre-baked canvas is NOT guaranteed to be a
// byte-identical substitute for a filtered drawImage (filter-before-scale vs
// scale-before-filter rounding). This module therefore only ever *offers* a
// baked canvas; the caller (rig.js) keeps the exact old render path as the
// fallback, and rig.js defaults the cache OFF unless `?rigCache=1` is present.
//
// get(img, filter):
//   - returns a canvas with `filter` applied to `img` once, or
//   - returns null when the caller must fall back to the direct filtered draw:
//       * the cache is disabled
//       * `filter` is falsy / 'none' (no bake is ever made for "no filter")
//       * the image has no usable dimensions
//       * a single entry would exceed the pixel budget
//       * the injected canvas factory fails
// The cache is bounded by an entry count (LRU), a total-pixel budget AND a count
// of DISTINCT filter strings, so rare/transient filters fall back instead of
// growing or thrashing without limit.
//
// maxFilters: when an uncached filter string would become the (maxFilters+1)-th
// live filter, get() returns null (caller falls back) rather than baking it. A
// filter slot is freed automatically once its last entry is evicted.

const STAT_FIELDS = ['bakes', 'hits', 'misses', 'evictions', 'fallbacks', 'pixels', 'entries', 'filters'];

const defaultCreateCanvas = () => document.createElement('canvas');

const normaliseFilter = filter => {
  if (!filter) return '';
  const s = String(filter).trim();
  return !s || s.toLowerCase() === 'none' ? '' : s;
};

export function createTintCache(opts = {}) {
  const maxEntries = Number.isFinite(opts.maxEntries) ? Math.max(0, Math.floor(opts.maxEntries)) : 192;
  const maxPixels = Number.isFinite(opts.maxPixels) ? Math.max(0, Math.floor(opts.maxPixels)) : 4_000_000;
  const maxFilters = Number.isFinite(opts.maxFilters) ? Math.max(0, Math.floor(opts.maxFilters)) : 64;
  const createCanvas = typeof opts.createCanvas === 'function' ? opts.createCanvas : defaultCreateCanvas;
  const stats = opts.stats || {};
  for (const field of STAT_FIELDS) if (typeof stats[field] !== 'number') stats[field] = 0;

  // Source image identity -> stable integer id, so the key can be a Map string.
  const ids = new WeakMap();
  let nextId = 1;
  const idFor = img => {
    let id = ids.get(img);
    if (!id) { id = nextId++; ids.set(img, id); }
    return id;
  };

  // Map preserves insertion order; LRU = move-to-end on hit, evict from front.
  const entries = new Map(); // key -> { canvas, pixels, filter }
  const filterCounts = new Map(); // filter string -> live entry count (a "filter slot")
  let pixels = 0;
  let enabled = opts.enabled !== false;

  const sync = () => { stats.pixels = pixels; stats.entries = entries.size; stats.filters = filterCounts.size; };

  const evictOldest = () => {
    const oldest = entries.keys().next();
    if (oldest.done) return false;
    const entry = entries.get(oldest.value);
    pixels -= entry.pixels;
    entries.delete(oldest.value);
    const left = (filterCounts.get(entry.filter) || 0) - 1;
    if (left > 0) filterCounts.set(entry.filter, left); else filterCounts.delete(entry.filter);
    stats.evictions += 1;
    return true;
  };

  function get(img, filter) {
    if (!enabled || !img) return null;
    const f = normaliseFilter(filter);
    if (!f) return null; // "none"/empty: never bake; caller draws unfiltered
    const key = idFor(img) + '|' + f;
    const hit = entries.get(key);
    if (hit) {
      entries.delete(key);
      entries.set(key, hit); // LRU touch
      stats.hits += 1;
      return hit.canvas;
    }
    stats.misses += 1;
    const w = img.naturalWidth || img.width || 0;
    const h = img.naturalHeight || img.height || 0;
    if (!w || !h) { stats.fallbacks += 1; return null; }
    const need = w * h;
    if (need > maxPixels) { stats.fallbacks += 1; return null; } // a lone entry can never fit
    // A genuinely new filter string beyond maxFilters is refused outright; we do
    // not evict existing entries just to make room for a new filter slot (that
    // is what would let transient filters thrash the cache).
    if (!filterCounts.has(f) && filterCounts.size >= maxFilters) { stats.fallbacks += 1; return null; }
    while (entries.size >= maxEntries || pixels + need > maxPixels) {
      if (!evictOldest()) break;
    }
    if (entries.size >= maxEntries || pixels + need > maxPixels) { stats.fallbacks += 1; return null; }
    let canvas;
    try {
      canvas = createCanvas();
      canvas.width = w;
      canvas.height = h;
      const c = canvas.getContext('2d');
      if (!c) { stats.fallbacks += 1; return null; }
      c.filter = f;
      c.drawImage(img, 0, 0);
    } catch {
      stats.fallbacks += 1;
      return null;
    }
    entries.set(key, { canvas, pixels: need, filter: f });
    pixels += need;
    filterCounts.set(f, (filterCounts.get(f) || 0) + 1);
    stats.bakes += 1;
    sync();
    return canvas;
  }

  function has(img, filter) {
    if (!img) return false;
    const f = normaliseFilter(filter);
    if (!f) return false;
    return entries.has(idFor(img) + '|' + f);
  }

  function clear() {
    entries.clear();
    filterCounts.clear();
    pixels = 0;
    sync();
  }

  function setEnabled(value) {
    enabled = !!value;
    if (!enabled) clear(); // free memory while off; counters are kept
  }

  return {
    get,
    has,
    clear,
    setEnabled,
    get enabled() { return enabled; },
    get size() { return entries.size; },
    get pixels() { return pixels; },
    get filters() { return filterCounts.size; },
    stats,
    maxEntries,
    maxPixels,
    maxFilters,
  };
}
