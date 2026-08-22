import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const server = spawn('python', ['-m', 'http.server', '4262'], { stdio: 'ignore' });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
  await wait(400);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:4262/gui-mockup/', { waitUntil: 'networkidle' });
  const result = await page.evaluate(async () => {
    const c = window.TimingChartProductionController;
    const expect = (condition, message) => { if (!condition) throw new Error(message); };
    const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
    const insertTab = [...document.querySelectorAll('.ribbon-tabs .rtab')].find(tab => tab.textContent.trim() === '挿入');
    const cycle = value => document.querySelector(`#cycleCanvas .ruler .tick[data-cycle="${value}"]`);
    const before = c.getSerializableDocument();
    cycle(3).click(); await pause(10);
    expect(c.model.timeSelection.cycle === 3, 'real ruler selection did not set cycle 3');
    expect(c.actions.getCurrentCycle() === 3, 'shared current-cycle action did not expose cycle 3');
    insertTab.click(); await pause(10);
    document.querySelector('#ribbonInsert [data-insert-command="insert-cycle"]').click(); await pause(60);
    const afterOne = c.getSerializableDocument();
    expect(afterOne.timeline.cycleCount === before.timeline.cycleCount + 1, 'Cycle追加 did not insert one cycle');
    expect(afterOne.signals.find(signal => signal.id === 'req_valid').values.some(value => Number(value.start) === 4), 'Cycle追加 did not insert at selected cycle 3');
    c.actions.undo(); await pause(40);
    expect(JSON.stringify(c.getSerializableDocument()) === JSON.stringify(before), 'Undo did not restore the pre-insert document');

    cycle(7).click(); await pause(10); insertTab.click(); await pause(10);
    document.querySelector('#ribbonInsert [data-insert-command="insert-n-cycles"]').click(); await pause(5);
    const dialog = document.querySelector('#insertNCyclesDialog'); expect(dialog, 'N Cycle dialog did not open');
    dialog.querySelector('[data-insert-count]').value = '2'; dialog.querySelector('[data-insert-apply]').click(); await pause(60);
    const afterMany = c.getSerializableDocument();
    expect(afterMany.timeline.cycleCount === before.timeline.cycleCount + 2, 'N Cycle追加 did not insert two cycles');
    expect(afterMany.signals.find(signal => signal.id === 'req_valid').values.some(value => Number(value.start) === 9), 'N Cycle追加 did not insert at selected cycle 7');
    expect(c.model.history.undo.length === 1, 'N Cycle追加 was not one atomic history operation');
    return { cycle3: true, cycle7: true, oneCycle: afterOne.timeline.cycleCount - before.timeline.cycleCount, nCycles: afterMany.timeline.cycleCount - before.timeline.cycleCount, currentCycle: c.actions.getCurrentCycle() };
  });
  assert.equal(errors.length, 0, errors.join('\n'));
  assert.deepEqual(result, { cycle3: true, cycle7: true, oneCycle: 1, nCycles: 2, currentCycle: 7 });
  await browser.close();
  console.log('Issue #62 acceptance passed: Insert Ribbon uses the shared semantic current-cycle selection for Cycle and N Cycle insertion.');
} finally { server.kill(); }
