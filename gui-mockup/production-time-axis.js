(() => {
  'use strict';
  const controller = window.TimingChartProductionController;
  if (!controller) return;
  const model = controller.model;
  const clone = value => structuredClone(value);
  const eventSignals = documentValue => documentValue.signals.filter(signal => signal.type !== 'clock' && signal.type !== 'commentRow');
  const valueAt = (values, time) => [...values].sort((a, b) => a.start - b.start).filter(value => Number(value.start) <= time).at(-1);
  const mapPointForInsert = (time, start, count) => time < start ? { status: 'unchanged', mapped: time } : { status: 'mapped', mapped: time + count };
  const mapPointForDelete = (time, start, end) => time < start ? { status: 'unchanged', mapped: time } : time >= end ? { status: 'mapped', mapped: time - (end - start) } : { status: 'deleted', mapped: start };
  const insertCycles = (documentValue, start, count) => {
    const next = clone(documentValue);
    for (const signal of eventSignals(next)) for (const value of signal.values || []) if (Number(value.start) >= start && Number(value.start) !== 0) value.start += count;
    controller.transformAnnotations?.(next, start, count, 'insert');
    next.timeline.cycleCount += count;
    next.timeline.end = next.timeline.cycleCount;
    return next;
  };
  const deleteRange = (documentValue, start, end) => {
    const next = clone(documentValue);
    const count = end - start;
    for (const signal of eventSignals(next)) {
      const values = [...(signal.values || [])].sort((a, b) => a.start - b.start);
      const before = values.filter(value => Number(value.start) < start);
      const atEnd = values.find(value => Number(value.start) === end);
      const activeAtEnd = atEnd || valueAt(values, end);
      const shifted = values.filter(value => Number(value.start) >= end).map(value => ({ ...value, start: Number(value.start) - count }));
      const merged = [...before, ...shifted].sort((a, b) => a.start - b.start);
      if (!merged.some(value => Number(value.start) === start) && activeAtEnd) {
        const previous = valueAt(before, start - 1);
        if (!previous || JSON.stringify(previous.value) !== JSON.stringify(activeAtEnd.value)) merged.push({ start, value: activeAtEnd.value });
      }
      const seen = new Set();
      signal.values = merged.filter(value => { const key = Number(value.start); if (seen.has(key)) return false; seen.add(key); return true; }).sort((a, b) => a.start - b.start);
    }
    controller.transformAnnotations?.(next, start, end, 'delete');
    next.timeline.cycleCount -= count;
    next.timeline.end = next.timeline.cycleCount;
    return next;
  };
  const deleteCycles = (documentValue, start, count) => deleteRange(documentValue, start, start + count);
  const validInteger = value => Number.isInteger(Number(value)) && Number(value) >= 0;
  const run = (label, mutation) => {
    if (model.document.timeline.timeBase !== 'cycle') { model.validation = [{ code: 'time-axis-cycle-only', message: 'Cycle操作はcycle modeでのみ有効です' }]; controller.render(); return false; }
    return controller.documentHistory.run(label, mutation);
  };
  const insert = (start, count = 1) => {
    const timeline = model.document.timeline;
    if (!validInteger(start) || !Number.isInteger(Number(count)) || Number(count) < 1 || Number(start) > timeline.cycleCount) { model.validation = [{ code: 'invalid-cycle-insert' }]; controller.render(); return false; }
    return run(`Insert ${count} cycle${count === 1 ? '' : 's'}`, () => { model.document = insertCycles(model.document, Number(start), Number(count)); });
  };
  const removeRange = (start, end) => {
    const timeline = model.document.timeline;
    if (!validInteger(start) || !validInteger(end) || Number(start) >= Number(end) || Number(end) > timeline.cycleCount || Number(end) - Number(start) >= timeline.cycleCount) { model.validation = [{ code: 'invalid-cycle-range' }]; controller.render(); return false; }
    return run(`Delete cycles ${start}-${end}`, () => { model.document = deleteRange(model.document, Number(start), Number(end)); });
  };
  controller.timeAxis = { insertCycles, deleteCycles, deleteRange, mapPointForInsert, mapPointForDelete };
  controller.actions.insertCycles = insert;
  controller.actions.deleteCycles = (start, count = 1) => removeRange(Number(start), Number(start) + Number(count));
  controller.actions.deleteRange = removeRange;
  model.timeSelection = { cycle: 0, rangeStart: null, rangeEnd: null };

  const renderEdgeCounters = currentModel => {
    const canvas = document.querySelector('#cycleCanvas'); if (!canvas) return;
    canvas.querySelectorAll('[data-edge-counter]').forEach(node => node.remove());
    const canvasRect = canvas.getBoundingClientRect();
    for (const signal of currentModel.document.signals.filter(item => item.type === 'clock' && item.edgeCounter?.show)) {
      const counter = signal.edgeCounter; const mode = counter.mode || 'rising';
      const rising = currentModel.waveGeometry?.signals?.[signal.id]?.risingEdge || [];
      const falling = currentModel.waveGeometry?.signals?.[signal.id]?.fallingEdge || [];
      const edges = (mode === 'both' ? [...rising.map(edge => ({ ...edge, edge: 'rising' })), ...falling.map(edge => ({ ...edge, edge: 'falling' }))] : mode === 'falling' ? falling.map(edge => ({ ...edge, edge: 'falling' })) : rising.map(edge => ({ ...edge, edge: 'rising' }))).sort((a, b) => a.canvasX - b.canvasX);
      const startNumber = Number(counter.startNumber ?? 1); const every = Math.max(1, Number(counter.labelEvery ?? 1));
      edges.forEach((edge, index) => { if (index % every) return; const label = document.createElement('span'); label.dataset.edgeCounter = signal.id; label.textContent = String(startNumber + index); label.style.cssText = `position:absolute;left:${edge.canvasX - canvasRect.left + Number(counter.offset?.x || 0)}px;top:${edge.canvasY - canvasRect.top + Number(counter.offset?.y || (counter.position === 'below' ? 8 : -8))}px;z-index:5;color:#52647a;font:11px sans-serif;pointer-events:none;`; label.title = `${signal.id} ${edge.edge} edge ${startNumber + index}`; canvas.appendChild(label); });
    }
  };

  const renderTransient = currentModel => {
    const timeline = currentModel.document.timeline;
    const ruler = document.querySelector('#cycleCanvas .ruler');
    if (ruler) {
      const title = ruler.querySelector('.cycle-title');
      ruler.innerHTML = '';
      if (title) ruler.appendChild(title); else { const cycleTitle = document.createElement('span'); cycleTitle.className = 'cycle-title'; cycleTitle.textContent = timeline.timeBase; ruler.appendChild(cycleTitle); }
      const count = timeline.cycleCount;
      ruler.style.gridTemplateColumns = `175px repeat(${count + 1}, 1fr)`;
      ruler.appendChild(document.createElement('span'));
      for (let cycle = 0; cycle < count; cycle += 1) { const tick = document.createElement('span'); tick.className = 'tick'; tick.textContent = cycle; tick.dataset.cycle = cycle; tick.addEventListener('click', event => { if (event.shiftKey && currentModel.timeSelection.rangeStart !== null) currentModel.timeSelection.rangeEnd = cycle; else currentModel.timeSelection.rangeStart = cycle; currentModel.timeSelection.cycle = cycle; renderTransient(currentModel); }); ruler.appendChild(tick); }
      const referenceClock = controller.selectors.getReferenceClock();
      const boundaries = Array.from({ length: count }, (_, cycle) => controller.getCycleBoundary?.({ signal: referenceClock?.id, cycle, coordinateSpace: 'canvas' })).filter(Boolean);
      if (boundaries.length === count) {
        const rulerRect = ruler.getBoundingClientRect();
        ruler.style.position = 'relative';
        ruler.querySelectorAll('.tick').forEach(tick => {
          const cycle = Number(tick.dataset.cycle);
          const x = boundaries[cycle].canvasX - rulerRect.left;
          tick.style.position = 'absolute'; tick.style.left = `${x}px`; tick.style.top = '0px'; tick.style.transform = 'translateX(-50%)';
        });
      }
    }
    const playhead = document.querySelector('#cycleCanvas .playhead');
    const referenceClock = controller.selectors.getReferenceClock();
    const boundary = controller.getCycleBoundary?.({ signal: referenceClock?.id, cycle: currentModel.timeSelection?.cycle || 0, coordinateSpace: 'canvas' });
    const canvas = document.querySelector('#cycleCanvas');
    if (playhead && boundary && canvas) { const rect = canvas.getBoundingClientRect(); playhead.style.left = `${boundary.canvasX - rect.left + canvas.scrollLeft}px`; }
    renderEdgeCounters(currentModel);
  };
  controller.renderTransient = renderTransient;
  window.TimingChartProductionTimeAxis = { renderTransient, insertCycles, deleteCycles, deleteRange, mapPointForInsert, mapPointForDelete };
  window.addEventListener('resize', () => renderTransient(model));
  const cycleCanvas = document.querySelector('#cycleCanvas');
  cycleCanvas?.addEventListener('scroll', () => renderTransient(model));
  if (cycleCanvas && window.ResizeObserver) new ResizeObserver(() => renderTransient(model)).observe(cycleCanvas);

  const tool = text => [...document.querySelectorAll('.tool')].find(button => button.querySelector('.tool-label')?.textContent?.replace(/\s/g, '').includes(text));
  const promptCycle = (message, fallback) => Number(window.prompt(message, String(fallback)));
  tool('Cycle挿入')?.addEventListener('click', () => insert(model.timeSelection.cycle, 1));
  tool('Cycle削除')?.addEventListener('click', () => removeRange(model.timeSelection.cycle, model.timeSelection.cycle + 1));
  tool('NCycle挿入')?.addEventListener('click', () => { const count = promptCycle('挿入するCycle数', 2); insert(model.timeSelection.cycle, count); });
  tool('範囲削除')?.addEventListener('click', () => { const end = promptCycle('削除終了Cycle（exclusive）', model.timeSelection.cycle + 1); removeRange(model.timeSelection.cycle, end); });
  renderTransient(model);
})();
