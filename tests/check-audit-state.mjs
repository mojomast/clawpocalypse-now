import assert from 'node:assert/strict';

await import('./check-audit-state-save.mjs');
await import('./check-audit-state-screens.mjs');

console.log('check-audit-state: OK');
export { assert };