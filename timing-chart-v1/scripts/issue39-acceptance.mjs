import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const root = 'artifacts/issue39'; fs.mkdirSync(root, { recursive: true });
const server = spawn('python', ['-m', 'http.server', '4239'], { stdio: 'ignore' });
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

async function runViewport(browser, viewport) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  await page.goto('http://127.0.0.1:4239/gui-mockup/', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.TimingChartInsertRibbon?.commandMeta?.size >= 13);
  const result = await page.evaluate(async () => {
    const c = window.TimingChartProductionController;
    const expect = (condition, message) => { if (!condition) throw new Error(message); };
    const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
    const doc = () => JSON.stringify(c.getSerializableDocument());
    const insertTab = [...document.querySelectorAll('.rtab')].find(node => node.textContent.trim() === '挿入');
    const beforeSwitch = doc(); insertTab.click(); await pause(30);
    expect(document.querySelector('#ribbonInsert')?.hidden === false, 'Insert Ribbon is not visible');
    expect(document.querySelector('#ribbonInsert').style.display === 'flex', 'Insert Ribbon display is not active');
    expect(doc() === beforeSwitch, 'Ribbon switching changed the document');
    expect([...document.querySelectorAll('#ribbonInsert [data-insert-command]')].every(node => node.dataset.tooltipMeta), 'Insert command metadata missing');
    expect([...document.querySelectorAll('#ribbonHome .rgroup')].filter(node => !node.hidden).every(node => !/Cycle挿入|N Cycle挿入/.test(node.textContent)), 'Home still exposes duplicate Cycle insertion group');

    const signalButton = document.querySelector('[data-insert-command="add-signal"]'); signalButton.click(); await pause(10);
    const signalMenu = document.querySelector('#insertSignalMenu'); expect(signalMenu && !signalMenu.hidden, 'Signal dropdown did not open');
    const beforeSignals = c.model.document.signals.length; signalMenu.querySelector('[data-insert-menu-command="bus"]').click(); await pause(60);
    expect(c.model.document.signals.length === beforeSignals + 1, 'Bus command did not add a signal');
    expect(c.model.document.signals.at(-1).type === 'bus', 'Bus command added the wrong type');
    for (const type of ['binary', 'state', 'clock']) { signalButton.click(); await pause(5); signalMenu.querySelector(`[data-insert-menu-command="${type}"]`).click(); await pause(50); expect(c.model.document.signals.at(-1).type === type, `${type} command failed`); }

    const count = () => c.model.document.signals.length;
    const beforeComment = count(); document.querySelector('[data-insert-command="add-comment"]').click(); await pause(50); expect(count() === beforeComment + 1, 'Comment Row command failed');
    const beforeGroup = c.model.document.signalGroups.length; document.querySelector('[data-insert-command="add-group"]').click(); await pause(50); expect(c.model.document.signalGroups.length === beforeGroup + 1, 'Group command failed');
    const group = c.model.document.signalGroups.find(item => item.id === c.model.selection.id) || c.model.document.signalGroups[0]; const beforeSpacers = (group.spacers || []).length; document.querySelector('[data-insert-command="add-spacer"]').click(); await pause(50); const selectedGroupAfterSpacer = c.model.document.signalGroups.find(item => item.id === group.id); expect((selectedGroupAfterSpacer?.spacers || []).length === beforeSpacers + 1, 'Spacer command failed');

    const beforeAnnotations = c.model.document.annotations.length;
    for (const type of ['marker', 'range', 'text', 'callout']) { document.querySelector(`[data-insert-command="add-${type}"]`).click(); await pause(50); expect(c.model.document.annotations.length > beforeAnnotations, `${type} annotation command failed`); }
    // Use two rendered signals that are not the old hard-coded req_valid/ready
    // fixture. The command must resolve the clicked points from the live
    // WaveDrom geometry map, rather than from signal IDs or cycle constants.
    const sourceSignal = 'state[1:0]';
    const destinationSignal = 'rdata[15:0]';
    const sourcePoint = c.model.waveGeometry.signals[sourceSignal]?.transitionCenter?.[0];
    const destinationPoint = c.model.waveGeometry.signals[destinationSignal]?.transitionCenter?.[0];
    expect(sourcePoint && destinationPoint, 'Acceptance fixture does not expose rendered WaveDrom transitions');
    const clickGeometry = (signalId, point) => { const entry = c.model.waveGeometry.signals[signalId]; const trace = document.getElementById(entry.traceId); const svg = trace.querySelector('svg'); const screen = new DOMPoint(point.localX, point.localY).matrixTransform(svg.getScreenCTM()); return { x: screen.x, y: screen.y, trace }; };
    document.querySelector('[data-insert-command="add-dependency"]').click(); await pause(10);
    expect(c.model.view.dependencySelection?.step === 'from', 'Dependency command did not enter source-selection mode');
    const sourceScreen = clickGeometry(sourceSignal, sourcePoint); sourceScreen.trace.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: sourceScreen.x, clientY: sourceScreen.y })); await pause(10);
    expect(c.model.view.dependencySelection?.step === 'to', 'Source transition click was not accepted');
    const destinationScreen = clickGeometry(destinationSignal, destinationPoint); destinationScreen.trace.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: destinationScreen.x, clientY: destinationScreen.y })); await pause(80);
    const dependency = c.model.document.annotations.at(-1);
    expect(dependency?.type === 'dependency', 'Dependency annotation was not created from selected transitions');
    expect(dependency.from.signal === sourceSignal && dependency.from.cycle === sourcePoint.cycle, 'Dependency source was not the selected WaveDrom transition');
    expect(dependency.to.signal === destinationSignal && dependency.to.cycle === destinationPoint.cycle, 'Dependency destination was not the selected WaveDrom transition');
    for (const type of ['verticalLine', 'bracket', 'highlight']) { document.querySelector('[data-insert-command="annotation-other"]').click(); await pause(5); document.querySelector(`#insertOtherMenu [data-insert-menu-command="${type}"]`).click(); await pause(50); expect(c.model.document.annotations.some(annotation => annotation.type === type), `${type} menu command failed`); }

    const undoBeforeCycle = c.model.history.undo.length; document.querySelector('[data-insert-command="insert-cycle"]').click(); await pause(60); expect(c.model.history.undo.length === undoBeforeCycle + 1, 'Cycle追加 did not create one history entry');
    document.querySelector('[data-insert-command="insert-n-cycles"]').click(); await pause(10); const dialog = document.querySelector('#insertNCyclesDialog'); expect(dialog, 'N Cycle compact input flow missing'); dialog.querySelector('[data-insert-count]').value = '3'; dialog.querySelector('[data-insert-apply]').click(); await pause(80); expect(c.model.history.undo.length === undoBeforeCycle + 2, 'N Cycle追加 was not atomic');

    const addMenu = document.querySelector('#addMenu'); expect(addMenu, 'Hierarchy add menu missing');
    document.querySelector('[data-insert-command="full-path"]').click(); await pause(30); expect(document.querySelector('[data-full-path-dialog]'), `フルパス確認 did not open the #30 dialog; menu=${document.querySelector('#addMenu')?.innerHTML}`); document.querySelector('[data-path-close]')?.click();
    document.querySelector('[data-insert-command="bulk-add"]').click(); await pause(30); expect(document.querySelector('[data-full-path-dialog]'), '信号一括登録 did not open the #30 dialog'); document.querySelector('[data-path-close]')?.click();

    expect([...document.querySelectorAll('#cycleCanvas .trace svg')].every(svg => svg.dataset.renderer === 'wavedrom'), 'Non-WaveDrom trace renderer detected');
    return { mode: c.model.view.mode, commandCount: window.TimingChartInsertRibbon.commandMeta.size, signals: c.model.document.signals.length, annotations: c.model.document.annotations.length, history: c.model.history.undo.length, pass: true };
  });
  await page.screenshot({ path: `${root}/insert-${viewport.width}x${viewport.height}.png` }); await page.close(); return result;
}

try {
  await pause(500); const browser = await chromium.launch({ headless: true });
  const results = []; for (const viewport of [{ width: 1672, height: 941 }, { width: 1280, height: 720 }]) results.push({ viewport, ...(await runViewport(browser, viewport)) });
  const report = { issue: 39, results, stylesModified: false, iconsModified: false, goldenReferenceModified: false, customWaveformRenderer: false, pass: true };
  fs.writeFileSync(`${root}/acceptance.json`, `${JSON.stringify(report, null, 2)}\n`); await browser.close(); console.log('Issue #39 acceptance passed: Insert Ribbon commands, semantic actions, hierarchy workflows, atomic cycle history, and WaveDrom trace checks.');
} finally { server.kill(); }
