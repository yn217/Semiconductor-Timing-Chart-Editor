import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.cwd(), '..', 'timing-chart-v2');
const dirs = ['samples/old/pre-reset-2026-10-02/golden-protocol', 'samples/old/pre-reset-2026-10-02/golden-feature-coverage'];
const files = dirs.flatMap(dir => {
  const base = path.join(root, dir);
  if (!fs.existsSync(base)) return [];
  const out = [];
  const walk = current => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.tcd.json')) out.push(full);
    }
  };
  walk(base);
  return out;
});

const errors = [];
for (const file of files) {
  let value;
  try { value = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { errors.push(`${file}: invalid JSON (${error.message})`); continue; }
  if (value.formatVersion !== 1) errors.push(`${file}: formatVersion must be 1`);
  const signals = value.signals ?? value.cycleView?.signals;
  if (!Array.isArray(signals)) errors.push(`${file}: signals must be an array`);
  const ids = new Set();
  for (const signal of signals ?? []) {
    if (!signal.id || !signal.name) errors.push(`${file}: signal id/name is required`);
    if (ids.has(signal.id)) errors.push(`${file}: duplicate signal ${signal.id}`);
    ids.add(signal.id);
    let last = -1;
    for (const change of signal.values ?? []) {
      if (typeof change.start !== 'number' || !Number.isFinite(change.start) || change.start < 0) errors.push(`${file}: ${signal.id} has invalid start`);
      if (change.start <= last) errors.push(`${file}: ${signal.id} values are not strictly sorted`);
      last = change.start;
      if ('end' in change) errors.push(`${file}: ${signal.id} stores forbidden end field`);
    }
  }
  for (const annotation of value.annotations ?? []) {
    if (!ids.has(annotation.start?.signal)) errors.push(`${file}: annotation ${annotation.id} has unknown start signal`);
  }
  for (const group of value.signalGroups ?? []) {
    for (const id of group.signalIds ?? group.signals ?? []) if (!ids.has(id)) errors.push(`${file}: group ${group.id} has unknown signal ${id}`);
  }
}

const matrix = path.join(root, 'samples/old/pre-reset-2026-10-02/golden-feature-coverage/timing_chart_feature_coverage_pack/coverage_matrix.csv');
if (fs.existsSync(matrix)) {
  const rows = fs.readFileSync(matrix, 'utf8').trim().split(/\r?\n/).filter(Boolean);
  if (rows.length < 2) errors.push('coverage_matrix.csv must contain a header and rows');
}

if (files.length !== 20) errors.push(`expected 20 Golden Sample fixtures, found ${files.length}`);
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log(`Validated ${files.length} Golden Sample fixtures.`);
