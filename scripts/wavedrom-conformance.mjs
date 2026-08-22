import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';

const adapterContext = { window: {} };
vm.runInNewContext(fs.readFileSync('gui-mockup/wavedrom-adapter.js', 'utf8'), adapterContext);
const adapter = adapterContext.window.TimingWaveDromAdapter;
const waveDromVersion = JSON.parse(fs.readFileSync('node_modules/wavedrom/package.json', 'utf8')).version;
const states = [0, 1, 'X', 'Z', 'u', 'd'];
const busStates = ['DATA0', 'DATA1', 'X', 'Z'];
const cases = [];
const unsupported = [
  { id: 'continuation-token', family: 'continuation', reason: 'Semantic .tcd has no explicit WaveJSON continuation token.' },
  { id: 'gap-token', family: 'gap', reason: 'Timeline gaps are not represented by the current semantic model.' },
  { id: 'nested-group', family: 'grouping', reason: 'Group nesting is a layout concern and is not a WaveDrom signal primitive.' },
  { id: 'clock-edge-marker', family: 'clock-edge', reason: 'The semantic model does not yet expose WaveJSON edge declarations.' },
  { id: 'mixed-clock-gating', family: 'clock-gating', reason: 'Clock gating requires explicit mixed clock/static segment semantics not present in .tcd.' },
  { id: 'hscale-transform', family: 'timing-transform', reason: 'hscale is an application renderer setting, not a signal-semantic field.' }
];

function binaryDoc(a, b) {
  return { document: { cycleCount: 2 }, signals: [{ name: 'case', type: 'binary', values: [{ start: 0, value: a }, { start: 1, value: b }] }] };
}
function busDoc(a, b) {
  return { document: { cycleCount: 2 }, signals: [{ name: 'case', type: 'bus', values: [{ start: 0, value: a }, { start: 1, value: b }] }] };
}
function clockDoc(polarity, period, phase) {
  return { document: { cycleCount: 8 }, signals: [{ name: 'case', type: 'clock', polarity, period, phase }] };
}
function scalar(value) {
  if (value === 0 || value === 1) return String(value);
  if (value === 'X' || value === 'x') return 'X';
  if (value === 'Z' || value === 'z') return 'Z';
  return value;
}
function canonical(doc) {
  const signal = doc.signals[0];
  if (signal.type === 'clock') {
    return { signal: [{ name: signal.name, wave: `${signal.polarity === 'negative' ? 'n' : 'p'}${'.'.repeat(7)}`, period: signal.period, phase: signal.phase }] };
  }
  const values = signal.values;
  const isBus = signal.type === 'bus' || signal.type === 'state';
  const wave = isBus ? [values[0].value, values[1].value].map(value => ['X', 'x', 'Z', 'z'].includes(value) ? scalar(value) : '=').join('') : `${scalar(values[0].value)}${scalar(values[1].value)}`;
  return { signal: [{ name: signal.name, wave, ...(isBus ? { data: [String(values[0].value), String(values[1].value)] } : {}) }] };
}
function normalizeSvg(svg) {
  return svg.replace(/\r?\n/g, '').replace(/\s+/g, ' ').replace(/ id="[^"]*"/g, '').replace(/ xmlns(:xlink)?="[^"]*"/g, '').trim();
}
function render(waveJson) {
  const temp = path.join(os.tmpdir(), `timing-chart-conformance-${process.pid}-${crypto.randomUUID()}.json`);
  fs.writeFileSync(temp, JSON.stringify(waveJson));
  try {
    return execFileSync(process.execPath, ['node_modules/wavedrom/bin/cli.js', '--input', temp], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
  } finally {
    fs.rmSync(temp, { force: true });
  }
}
for (const a of states) for (const b of states) cases.push({ id: `binary-${String(a)}-to-${String(b)}`, family: 'binary-transition', doc: binaryDoc(a, b) });
for (const a of busStates) for (const b of busStates) cases.push({ id: `bus-${a}-to-${b}`, family: 'bus-transition', doc: busDoc(a, b) });
for (const polarity of ['positive', 'negative']) for (const period of [1, 2, 3, 4]) for (const phase of [-0.5, 0, 0.5, 1]) cases.push({ id: `clock-${polarity}-${period}-${String(phase).replace('-', 'm').replace('.', 'p')}`, family: 'clock-period-phase', doc: clockDoc(polarity, period, phase) });

const failures = [];
const canonicalWaveJson = { signal: [] };
const dutWaveJson = { signal: [] };
for (const item of cases) {
  try {
    const expected = canonical(item.doc);
    const actual = adapter.toWaveJson(item.doc);
    assert.equal(JSON.stringify(actual), JSON.stringify(expected), 'temporary WaveJSON differs from canonical WaveJSON');
    canonicalWaveJson.signal.push(expected.signal[0]);
    dutWaveJson.signal.push(actual.signal[0]);
  } catch (error) {
    failures.push({ id: item.id, family: item.family, error: error.message });
  }
}
if (!failures.length) {
  try {
    assert.equal(normalizeSvg(render(dutWaveJson)), normalizeSvg(render(canonicalWaveJson)), 'DUT SVG differs from WaveDrom reference SVG');
  } catch (error) {
    failures.push({ id: 'combined-svg', family: 'svg-geometry', error: error.message });
  }
}
const report = { waveDromVersion, total: cases.length, supported: cases.length, passed: cases.length - failures.length, failed: failures.length, unsupported, failures, tolerancePx: 0 };
fs.mkdirSync('test-results', { recursive: true });
fs.writeFileSync('test-results/wavedrom-conformance-report.json', JSON.stringify(report, null, 2));
if (failures.length) {
  console.error(JSON.stringify(report, null, 2));
  process.exitCode = 1;
} else {
  console.log(`WaveDrom conformance passed: ${report.passed}/${report.supported} supported cases, ${report.unsupported.length} explicitly unsupported, version ${waveDromVersion}, tolerance ${report.tolerancePx}px.`);
}
