import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';

const adapterSource = fs.readFileSync('gui-mockup/wavedrom-adapter.js', 'utf8');
const context = { window: {} };
vm.runInNewContext(adapterSource, context);
const input = JSON.parse(fs.readFileSync('samples/golden-protocol/timing_chart_sample_pack/samples/01_apb_register_access.tcd.json', 'utf8'));
const waveJson = context.window.TimingWaveDromAdapter.toWaveJson(input);
const temp = path.join(os.tmpdir(), `timing-chart-vr-${process.pid}.json5`);
fs.writeFileSync(temp, JSON.stringify(waveJson));
try {
  const svg = execFileSync(process.execPath, [path.resolve('node_modules/wavedrom/bin/cli.js'), '--input', temp], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  const hash = crypto.createHash('sha256').update(svg).digest('hex');
  assert.equal(hash, '610c00f040d748828e256b91fd941138e6dd52878c715e9e4728c6588fa9527c', 'WaveDrom SVG geometry changed; review the visual baseline');
  console.log('Visual regression baseline passed for Golden Sample 01.');
} finally { fs.rmSync(temp, { force: true }); }
