import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import vm from 'node:vm';

const adapterSource = fs.readFileSync('gui-mockup/wavedrom-adapter.js', 'utf8');
const context = { window: {} };
vm.runInNewContext(adapterSource, context);
const input = JSON.parse(fs.readFileSync('../timing-chart-v2/samples/golden-protocol/timing_chart_sample_pack/samples/01_apb_register_access.tcd.json', 'utf8'));
const waveJson = context.window.TimingWaveDromAdapter.toWaveJson(input);
const temp = path.join(os.tmpdir(), `timing-chart-${process.pid}.json5`);
fs.writeFileSync(temp, JSON.stringify(waveJson));
try {
  const cli = path.resolve('node_modules/wavedrom/bin/cli.js');
  const svg = execFileSync(process.execPath, [cli, '--input', temp], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  assert.match(svg, /^<svg/);
  assert.match(svg, /WaveDrom/);
  console.log(`WaveDrom rendered ${waveJson.signal.length} signals from Golden Sample 01 (sha256 ${crypto.createHash('sha256').update(svg).digest('hex')}).`);
} finally {
  fs.rmSync(temp, { force: true });
}
