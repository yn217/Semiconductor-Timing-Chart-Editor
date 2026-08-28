import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifactDir = path.join(root, 'artifacts', 'issue9');
await fs.mkdir(artifactDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.goto(`file://${path.join(root, 'gui-mockup', 'index.html').replaceAll('\\', '/')}`);
await page.waitForTimeout(500);

const result = await page.evaluate(async () => {
  const c = window.TimingChartProductionController;
  const model = c.model;
  const signalBefore = JSON.stringify(c.getSerializableDocument().signals);
  const range = { id: 'issue9_multiline', type: 'range', start: { signal: 'req_valid', cycle: 3, point: 'rising', offset: { x: 2, y: -20 } }, end: { signal: 'ready', cycle: 8, point: 'rising', offset: { x: 4, y: -20 } }, label: 'Request accepted\nResponse after 6 cycles\nStable', labelOffset: { x: 11, y: -7 }, labelStyle: { wrap: false, maxWidth: 240, lineHeight: 1.4, align: 'center' }, color: '#1473e6', position: 'canvas', visible: true };
  const added = c.actions.addAnnotation('range', range);
  const annotation = () => model.document.annotations.find(item => item.id === 'issue9_multiline');
  const endpointsBefore = JSON.stringify({ start: annotation().start, end: annotation().end });
  const offsetBefore = structuredClone(annotation().labelOffset);
  const tspans = document.querySelectorAll('[data-production-overlay="annotations"] [data-annotation-id="issue9_multiline"][data-annotation-part="label"] tspan').length;
  const alignBefore = document.querySelector('[data-production-overlay="annotations"] [data-annotation-id="issue9_multiline"][data-annotation-part="label"]')?.getAttribute('text-anchor');
  c.actions.updateAnnotation('issue9_multiline', 'labelStyle.align', 'right');
  const alignAfter = document.querySelector('[data-production-overlay="annotations"] [data-annotation-id="issue9_multiline"][data-annotation-part="label"]')?.getAttribute('text-anchor');
  c.actions.updateAnnotation('issue9_multiline', 'labelOffset.x', 22);
  c.actions.updateAnnotation('issue9_multiline', 'labelOffset.y', -14);
  const offsetAfterInspector = structuredClone(annotation().labelOffset);
  c.actions.selectAnnotation('issue9_multiline');
  await new Promise(resolve => requestAnimationFrame(resolve));
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', shiftKey: true, bubbles: true }));
  const offsetAfterKeys = structuredClone(annotation().labelOffset);
  const endpointsAfter = JSON.stringify({ start: annotation().start, end: annotation().end });
  const resolvedBefore = c.annotationResolve(annotation().start);
  c.actions.setZoom(125);
  c.actions.setSignalNameWidth(220);
  const resolvedAfter = c.annotationResolve(annotation().start);
  const saved = JSON.stringify(c.getSerializableDocument());
  const savedLabel = JSON.parse(saved).annotations.find(item => item.id === 'issue9_multiline');
  const reopened = await c.actions.openText(saved, { fileName: 'issue9.tcd', unsavedDecision: 'discard' });
  const reopenedLabel = model.document.annotations.find(item => item.id === 'issue9_multiline');
  const waveformAfter = JSON.stringify(c.getSerializableDocument().signals);
  return {
    checks: {
      added,
      multilineTspans: tspans === 3,
      centerAlignment: alignBefore === 'middle',
      rightAlignment: alignAfter === 'end',
      inspectorOffset: offsetAfterInspector.x === 22 && offsetAfterInspector.y === -14,
      keyboardOffset: offsetAfterKeys.x === 23 && offsetAfterKeys.y === -4,
      endpointsUnchanged: endpointsBefore === endpointsAfter,
      offsetPreservedAfterGeometry: resolvedBefore.semantic.offset.x === 2 && resolvedAfter.semantic.offset.x === 2 && resolvedAfter.source === 'wavedrom-svg',
      saveOpenLabelText: reopened && savedLabel.label === 'Request accepted\nResponse after 6 cycles\nStable' && reopenedLabel.labelStyle.lineHeight === 1.4 && reopenedLabel.labelOffset.x === 23 && reopenedLabel.labelOffset.y === -4,
      signalWaveformUnchanged: signalBefore === waveformAfter
    },
    offsets: { before: offsetBefore, afterInspector: offsetAfterInspector, afterKeys: offsetAfterKeys },
    endpoints: { before: endpointsBefore, after: endpointsAfter }
  };
});

await page.screenshot({ path: path.join(artifactDir, 'issue9-extended-1672x941.png'), fullPage: false });
await browser.close();
const failures = Object.entries(result.checks).filter(([, value]) => !value).map(([key]) => key);
const acceptance = { checks: result.checks, offsets: result.offsets, endpoints: result.endpoints, errors, pass: failures.length === 0 && errors.length === 0, artifacts: ['issue9-extended-1672x941.png'] };
await fs.writeFile(path.join(artifactDir, 'issue9-extended-acceptance.json'), `${JSON.stringify(acceptance, null, 2)}\n`);
if (!acceptance.pass) { console.error(JSON.stringify(acceptance, null, 2)); process.exit(1); }
console.log('Issue #9 extended acceptance passed: multiline labels, label offsets, alignment, keyboard adjustment, persistence, and geometry isolation.');
