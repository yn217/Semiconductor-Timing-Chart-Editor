import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync('gui-mockup/wavedrom-adapter.js', 'utf8');
const context = { window: {} };
vm.runInNewContext(source, context);
const adapter = context.window.TimingWaveDromAdapter;
const result = adapter.toWaveJson({ document: { cycleCount: 10 }, signals: [
  { name: 'valid', type: 'binary', values: [{ start: 0, value: 0 }, { start: 3, value: 1 }, { start: 7, value: 0 }] },
  { name: 'addr', type: 'bus', values: [{ start: 0, value: 'IDLE' }, { start: 3, value: '0x10' }, { start: 7, value: 'IDLE' }] }
] });
assert.equal(result.signal[0].wave, '0..1...0..');
assert.equal(result.signal[1].wave, '=..=...=..');
assert.deepEqual(Array.from(result.signal[1].data), ['IDLE', '0x10', 'IDLE']);
console.log('Validated semantic document to temporary WaveJSON adapter.');
