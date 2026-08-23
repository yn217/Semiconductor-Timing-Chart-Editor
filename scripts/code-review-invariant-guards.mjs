import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFile(path.join(root, relative), 'utf8');

const [controller, timeAxis, appUi, waveform] = await Promise.all([
  read('gui-mockup/production-controller.js'),
  read('gui-mockup/production-time-axis.js'),
  read('gui-mockup/app-ui.js'),
  read('gui-mockup/production-waveform.js'),
]);

const violations = [];
const forbid = (issue, file, source, pattern, message) => {
  if (pattern.test(source)) violations.push({ issue, file, message, pattern: String(pattern) });
};

// #61: cancellation must never reuse the pointerup/commit handler.
forbid(61, 'gui-mockup/production-time-axis.js', timeAxis,
  /addEventListener\(\s*['"]pointercancel['"]\s*,\s*finishRangeGesture\s*\)/,
  'pointercancel is still wired to finishRangeGesture; cancel must not commit or suppress the next click');

// #44: Left Tree collapse is view-only and must not be a canonical document transaction.
forbid(44, 'gui-mockup/production-controller.js', controller,
  /actions\.setGroupCollapsed\s*=\s*\([^\n]*\)\s*=>\s*transactionRun\(/,
  'setGroupCollapsed still uses transactionRun; Tree collapse must not create Dirty/Undo/canonical mutation');

// #125: signal.display.visible is the sole visibility source. Mutable mirrors are forbidden.
forbid(125, 'gui-mockup/production-controller.js', controller,
  /model\.view\.hiddenSignals\s*=/,
  'model.view.hiddenSignals is still maintained as a mutable visibility mirror');
forbid(125, 'gui-mockup/production-waveform.js', waveform,
  /hiddenSignals\s*:\s*model\.view\?\.hiddenSignals/,
  'waveform cache/screen signature still reads the forbidden view.hiddenSignals mirror');

// #134: interactive Bottom tables must not render Unicode fake checkbox controls.
forbid(134, 'gui-mockup/app-ui.js', appUi,
  /<th>\s*□\s*<\/th>/,
  'Bottom table header still renders a fake checkbox glyph');
forbid(134, 'gui-mockup/app-ui.js', appUi,
  /['"]☑['"]\s*:\s*['"]□['"]/,
  'Bottom table row selection still uses Unicode fake checkbox glyphs');

// #138: a future real resize must not be swallowed merely because documentRevision matches.
forbid(138, 'gui-mockup/production-time-axis.js', timeAxis,
  /skipTimeAxisResizeRevision\s*===\s*controller\.model\.documentRevision/,
  'ResizeObserver suppression is still revision-only and can consume an unrelated later resize');

// #138: a localized render miss must not be ignored as a fire-and-forget statement.
forbid(138, 'gui-mockup/production-controller.js', controller,
  /^\s*window\.TimingChartProductionWaveform\?\.renderSignal\?\.\(model,\s*signalId\);\s*$/m,
  'updateSignalValue still ignores the renderSignal result instead of checking/recovering from a localized render miss');

const report = { suite: 'code-review-invariant-guards', violations, pass: violations.length === 0 };
if (!report.pass) {
  console.error(JSON.stringify(report, null, 2));
  assert.fail(`${violations.length} invariant regression guard(s) failed`);
}
console.log('Code-review invariant guards passed:', JSON.stringify(report));
