import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync('gui-mockup/geometry.js', 'utf8');
const context = { window: {} };
vm.runInNewContext(source, context);
const { resolveAnchor } = context.window.TimingGeometry;
const signals = [{ id: 'req', values: [{ start: 0, value: 0 }, { start: 4, value: 1 }, { start: 8, value: 0 }] }];
assert.deepEqual(resolveAnchor({ signal: 'req', cycle: 2, anchor: 'transition-start' }, signals, 10).cycle, 4);
assert.deepEqual(resolveAnchor({ signal: 'req', cycle: 5, anchor: 'transition-start' }, signals, 10).cycle, 8);
assert.deepEqual(resolveAnchor({ signal: 'missing', cycle: 2, anchor: 'rising-edge' }, signals, 10).snap, 'unresolved');
assert.deepEqual(resolveAnchor({ signal: 'req', cycle: 12, anchor: 'cycle-start' }, signals, 10).cycle, 10);
console.log('Validated semantic anchor resolution and transition snapping.');
