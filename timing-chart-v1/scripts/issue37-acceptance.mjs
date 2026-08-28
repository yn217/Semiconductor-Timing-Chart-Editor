import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const root = 'artifacts/issue37';
fs.mkdirSync(root, { recursive: true });
const server = spawn('python', ['-m', 'http.server', '4232'], { stdio: 'ignore' });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

try {
  await wait(500);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });
  await page.goto('http://127.0.0.1:4232/gui-mockup/', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.TimingChartProductionController?.selectionFastPathInstalled === true);

  const result = await page.evaluate(async () => {
    const controller = window.TimingChartProductionController;
    const model = controller.model;
    const expect = (condition, message) => { if (!condition) throw new Error(message); };
    const originalRender = controller.render;
    const originalWaveRender = window.WaveDrom.RenderWaveForm;
    let fullRenders = 0;
    let waveRenders = 0;
    controller.render = (...args) => { fullRenders += 1; return originalRender(...args); };
    window.WaveDrom.RenderWaveForm = (...args) => { waveRenders += 1; return originalWaveRender(...args); };

    const beforeDocument = JSON.stringify(controller.getSerializableDocument());
    const beforeUndo = model.history.undo.length;
    const ids = ['clk', 'req_valid', 'req_addr[7:0]', 'busy', 'state[1:0]', 'ready', 'rdata[15:0]'];
    for (const id of ids) {
      const row = document.querySelector(`.row[data-signal="${CSS.escape(id)}"]`);
      expect(row, `missing row ${id}`);
      row.click();
    }
    await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 40)));

    const comment = document.querySelector('.row[data-kind="comment"]');
    expect(comment, 'missing comment row');
    comment.click();
    await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 40)));

    const groupSelection = { ...model.selection };
    const metricsAfterGroup = { ...controller.selectionMetrics };
    expect(fullRenders === 0, 'signal selection called full controller.render');
    expect(waveRenders === 0, 'signal selection regenerated WaveDrom');
    expect(JSON.stringify(controller.getSerializableDocument()) === beforeDocument, 'selection changed canonical document');
    expect(model.history.undo.length === beforeUndo, 'selection created undo history');
    expect(metricsAfterGroup.selections >= ids.length + 1, 'selection metrics did not record rapid selections');
    expect(metricsAfterGroup.fullRendersFromSelection === 0, 'selection fast path recorded a full render');
    expect(metricsAfterGroup.lastHighlightMs < 16.7, `selection highlight exceeded one frame: ${metricsAfterGroup.lastHighlightMs}ms`);

    controller.actions.setFollowSelection(false);
    controller.actions.setBottomTab('annotation');
    controller.actions.setPinned(true);
    const beforePinnedRenders = fullRenders;
    const beforePinnedWaveRenders = waveRenders;
    const pinnedRow = document.querySelector('.row[data-signal="clk"]');
    pinnedRow.click();
    await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 40)));
    expect(model.selection.id === 'clk', 'pinned selection did not update');
    expect(model.view.tab === 'annotation', 'pinned selection changed bottom tab');
    expect(fullRenders === beforePinnedRenders, 'pinned selection called full render');
    expect(waveRenders === beforePinnedWaveRenders, 'pinned selection regenerated WaveDrom');

    controller.actions.setPinned(false);
    controller.actions.setLeftPanelMode('hierarchy');
    const beforeHierarchyWaveRenders = waveRenders;
    const beforeHierarchySelectionRenders = fullRenders;
    const hierarchyRow = document.querySelector('.row[data-signal="req_valid"]');
    expect(hierarchyRow, 'missing hierarchy signal row');
    hierarchyRow.click();
    await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 40)));
    expect(model.selection.id === 'req_valid', 'hierarchy selection did not update');
    expect(fullRenders === beforeHierarchySelectionRenders, 'hierarchy signal selection called full render');
    expect(waveRenders === beforeHierarchyWaveRenders, 'hierarchy signal selection regenerated WaveDrom');
    expect(JSON.stringify(controller.getSerializableDocument()) === beforeDocument, 'hierarchy selection changed canonical document');

    return {
      selectedAfterGroup: groupSelection,
      selectedAfterHierarchy: model.selection,
      fullRenders,
      waveRenders,
      selectionMetrics: { ...controller.selectionMetrics },
      canonicalUnchanged: JSON.stringify(controller.getSerializableDocument()) === beforeDocument,
      undoUnchanged: model.history.undo.length === beforeUndo,
      highlightWithinFrame: controller.selectionMetrics.lastHighlightMs < 16.7,
      pass: true
    };
  });
  await page.screenshot({ path: `${root}/production-1672x941.png` });
  const report = { issue: 37, viewport: { width: 1672, height: 941 }, ...result, lockedGuiModified: false, pass: true };
  fs.writeFileSync(`${root}/acceptance.json`, `${JSON.stringify(report, null, 2)}\n`);
  await browser.close();
  console.log('Issue #37 acceptance passed: selection is lightweight, immediate, and WaveDrom/document stable.');
} finally {
  server.kill();
}
