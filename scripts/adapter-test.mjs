import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync('gui-mockup/wavedrom-adapter.js', 'utf8');
const context = { window: {} };
vm.runInNewContext(source, context);
const adapter = context.window.TimingWaveDromAdapter;
const result = adapter.toWaveJson({ document: { cycleCount: 4 }, signals: [
  { name: 'valid', type: 'binary', values: [{ start: 0, value: 0 }, { start: 2, value: 1 }] },
  { name: 'addr', type: 'bus', values: [{ start: 0, value: 'IDLE' }, { start: 1, value: '0x10' }] }
] });
assert.equal(result.signal[0].wave, '0011');
assert.equal(result.signal[1].wave, '====');
assert.deepEqual(Array.from(result.signal[1].data), ['IDLE', '0x10', '0x10', '0x10']);
console.log('Validated semantic document to temporary WaveJSON adapter.');
