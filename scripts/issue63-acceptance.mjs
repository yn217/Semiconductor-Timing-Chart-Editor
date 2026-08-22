import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const server = spawn('python', ['-m', 'http.server', '4263'], { stdio: 'ignore' });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
  await wait(400);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:4263/gui-mockup/', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean(window.TimingChartProductionController?.viewRibbon));
  const result = await page.evaluate(async () => {
    const c = window.TimingChartProductionController;
    const expect = (condition, message) => { if (!condition) throw new Error(message); };
    const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
    const pathModes = window.TimingChartPathDisplayModes;
    const signal = c.model.document.signals.find(item => item.id === 'req_valid');
    signal.source = { instancePath: ['top', 'u_soc', 'u_dma'], signalName: 'req_valid' };
    c.actions.setLeftPanelMode('group');
    const semanticBefore = JSON.stringify(c.model.document.signals.map(item => ({ id: item.id, values: item.values, generator: item.generator, role: item.role, source: item.source })));
    const tab = [...document.querySelectorAll('.ribbon-tabs .rtab')].find(item => item.textContent.trim() === '表示');
    tab.click(); await pause(10);
    const button = id => document.querySelector(`#ribbonView [data-view-command="${id}"]`);
    const labels = {}; let fullVisibleLabel = '';
    for (const [id, mode] of [['signal-only', pathModes.SIGNAL_ONLY], ['relative', pathModes.RELATIVE], ['full-path', pathModes.FULL], ['split-columns', pathModes.SPLIT_COLUMNS]]) {
      button(id).click(); await pause(20);
      expect(c.model.document.layout.pathDisplayMode === mode, `${id} did not set canonical mode`);
      expect(button(id).getAttribute('aria-pressed') === 'true', `${id} active state is missing`);
      labels[id] = c.hierarchy.getDisplayLabel(signal, mode);
      if (id === 'full-path') fullVisibleLabel = document.querySelector('#groups .row[data-signal="req_valid"] .row-name')?.textContent || '';
    }
    expect(labels['signal-only'] === 'req_valid', 'Signal only label mismatch');
    expect(labels.relative === 'top.u_soc.u_dma.req_valid', 'Relative label mismatch');
    expect(labels['full-path'] === 'top.u_soc.u_dma.req_valid', 'Full Path label mismatch');
    expect(labels['split-columns'] === 'req_valid', 'Split Columns label mismatch');
    expect(fullVisibleLabel.includes('top.u_soc.u_dma.req_valid'), 'Full Path was not reflected in the visible Signal Tree');
    const semanticAfter = JSON.stringify(c.model.document.signals.map(item => ({ id: item.id, values: item.values, generator: item.generator, role: item.role, source: item.source })));
    expect(semanticAfter === semanticBefore, 'Path display switching changed waveform semantic data');
    return { labels, modes: pathModes, visibleLabel: fullVisibleLabel, historyEntries: c.model.history.undo.length };
  });
  assert.equal(errors.length, 0, errors.join('\n'));
  assert.equal(result.labels['full-path'], 'top.u_soc.u_dma.req_valid');
  await browser.close();
  console.log('Issue #63 acceptance passed: all path display modes, actual Full Path button, active state, and semantic isolation verified.');
} finally { server.kill(); }
