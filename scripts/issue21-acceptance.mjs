import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';

const context = { window: {} }; vm.runInNewContext(fs.readFileSync('gui-mockup/wavedrom-adapter.js', 'utf8'), context); const adapter = context.window.TimingWaveDromAdapter;
const expected = [
  [{ start: 0, value: 0 }, { start: 1, value: 1 }, { start: 3, value: 0 }],
  [{ start: 0, value: 0 }, { start: 2, value: 1 }, { start: 6, value: 0 }],
  [{ start: 0, value: 'X' }, { start: 4, value: 1 }, { start: 8, value: 'Z' }],
  [{ start: 0, value: 'IDLE' }, { start: 2, value: '0x1000' }, { start: 6, value: 'IDLE' }]
];
const expectedWave = ['01.0......', '0.1...0...', 'X...1...Z.', '=.=...=...'];
const expectedData = [undefined, undefined, undefined, ['IDLE', '0x1000', 'IDLE']]; const cases = [];
for (let index = 0; index < expected.length; index += 1) { const type = index === 2 ? 'binary' : index === 3 ? 'bus' : 'binary'; const result = adapter.waveFor({ type, values: expected[index] }, 10); assert.equal(result.wave, expectedWave[index]); assert.equal(JSON.stringify(result.data), JSON.stringify(expectedData[index])); cases.push({ id: index, wave: result.wave, data: result.data }); }
const render = waveJson => { const temp = path.join(os.tmpdir(), `issue21-${crypto.randomUUID()}.json`); fs.writeFileSync(temp, JSON.stringify(waveJson)); try { return execFileSync(process.execPath, ['node_modules/wavedrom/bin/cli.js', '--input', temp], { encoding: 'utf8' }); } finally { fs.rmSync(temp, { force: true }); } };
const canonical = { signal: [{ name: 'persist', wave: '0..1...0..' }, { name: 'bus', wave: '=..=...=..', data: ['IDLE', '0x1000', 'IDLE'] }] }; const dut = { signal: [{ name: 'persist', wave: adapter.waveFor({ type: 'binary', values: [{ start: 0, value: 0 }, { start: 3, value: 1 }, { start: 7, value: 0 }] }, 10).wave }, { name: 'bus', ...adapter.waveFor({ type: 'bus', values: [{ start: 0, value: 'IDLE' }, { start: 3, value: '0x1000' }, { start: 7, value: 'IDLE' }] }, 10) }] }; assert.equal(render(canonical), render(dut));
fs.mkdirSync('artifacts/issue21', { recursive: true }); fs.writeFileSync('artifacts/issue21/acceptance.json', `${JSON.stringify({ continuationCases: cases, independentExpected: true, canonicalBinary: '0..1...0..', canonicalBus: { wave: '=..=...=..', data: ['IDLE', '0x1000', 'IDLE'] }, svgEqual: true, unsupportedContinuation: false, tolerancePx: 0, pass: true }, null, 2)}\n`); console.log('Issue #21 acceptance passed: independent continuation persistence and 0px WaveDrom SVG equivalence.');
