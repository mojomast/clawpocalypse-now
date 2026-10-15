// Ground depth never changes when a fighter jumps, falls, or spins. Draw
// callbacks are lazy so animation advances exactly once when the queue flushes.
export const actorDepth = actor => actor.y + (actor.r || 0);

export function drawDepthEntries(entries, draw = entry => entry.draw()) {
  // Array#sort is stable: equal feet keep authored insertion order.
  for (const entry of entries.slice().sort((a, b) => a.y - b.y)) draw(entry);
}
