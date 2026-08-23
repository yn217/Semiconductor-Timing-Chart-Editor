(() => {
  'use strict';
  const controller = window.TimingChartProductionController;
  if (!controller) return;
  const model = controller.model;
  const metrics = controller.timeAxisMetrics = controller.timeAxisMetrics || { scrollEvents: 0, rulerRebuilds: 0, edgeCounterRebuilds: 0, annotationFullRenders: 0, transientFrames: 0, waveDromRenders: 0 };
  const clone = value => structuredClone(value);
  const eventSignals = documentValue => documentValue.signals.filter(signal => signal.type !== 'clock' && signal.type !== 'commentRow');
  const valueAt = (values, time) => [...values].sort((a, b) => a.start - b.start).filter(value => Number(value.start) <= time).at(-1);
  const mapPointForInsert = (time, start, count) => time < start ? { status: 'unchanged', mapped: time } : { status: 'mapped', mapped: time + count };
  const mapPointForDelete = (time, start, end) => time < start ? { status: 'unchanged', mapped: time } : time >= end ? { status: 'mapped', mapped: time - (end - start) } : { status: 'deleted', mapped: start };
  const insertCycles = (documentValue, start, count) => {
    const next = clone(documentValue);
    for (const signal of eventSignals(next)) for (const value of signal.values || []) if (Number(value.start) >= start && Number(value.start) !== 0) value.start += count;
    for (const transaction of next.transactions || []) { if (Number(transaction.start) >= start) transaction.start += count; if (Number(transaction.end) >= start) transaction.end += count; for (const phase of transaction.phases || []) { if (Number(phase.start) >= start) phase.start += count; if (Number(phase.end) >= start) phase.end += count; } }
    for (const bookmark of next.bookmarks || []) if (Number(bookmark.start) >= start) bookmark.start += count;
    for (const group of next.timeGroups || []) { if (Number(group.start) >= start) group.start += count; if (Number(group.end) >= start) group.end += count; }
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
    for (const transaction of next.transactions || []) {
      const map = point => mapPointForDelete(Number(point), start, end);
      transaction.start = map(transaction.start).mapped; transaction.end = Math.max(transaction.start, map(transaction.end).mapped);
      for (const phase of transaction.phases || []) { phase.start = map(phase.start).mapped; phase.end = Math.max(phase.start, map(phase.end).mapped); }
    }
    for (const bookmark of next.bookmarks || []) bookmark.start = mapPointForDelete(Number(bookmark.start), start, end).mapped;
    for (const group of next.timeGroups || []) { group.start = mapPointForDelete(Number(group.start), start, end).mapped; group.end = mapPointForDelete(Number(group.end), start, end).mapped; }
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
    const deletesTimeGroup = (model.document.timeGroups || []).find(group => Number(group.start) >= Number(start) && Number(group.end) <= Number(end));
    if (deletesTimeGroup) { model.validation = [{ code: 'time-group-delete-requires-explicit-removal', id: deletesTimeGroup.id, message: '削除範囲がTime Group全体を含むため、先にTime Groupを削除してください' }]; controller.render(); return false; }
    const result = run(`Delete cycles ${start}-${end}`, () => { model.document = deleteRange(model.document, Number(start), Number(end)); });
    if (result) { model.timeSelection = { ...model.timeSelection, cycle: Math.min(Number(start), model.document.timeline.cycleCount), rangeStart: null, rangeEnd: null, source: 'range-delete' }; renderTransient(model); }
    return result;
  };
  controller.timeAxis = { insertCycles, deleteCycles, deleteRange, mapPointForInsert, mapPointForDelete };
  controller.actions.insertCycles = insert;
  controller.actions.deleteCycles = (start, count = 1) => removeRange(Number(start), Number(start) + Number(count));
  controller.actions.deleteRange = removeRange;
  controller.actions.insertGap = (start, count = 1) => insert(start, count);
  controller.actions.duplicateRange = (start, end) => {
    const from = Number(start); const to = Number(end); const count = to - from;
    if (!validInteger(from) || !validInteger(to) || count < 1 || to > model.document.timeline.cycleCount) return false;
    return run(`Duplicate cycles ${from}-${to}`, () => {
      const source = clone(model.document); const sourceSignals = eventSignals(source).map(signal => ({ id: signal.id, values: (signal.values || []).filter(value => Number(value.start) >= from && Number(value.start) < to).map(value => ({ ...value })) }));
      const next = insertCycles(model.document, to, count);
      for (const copied of sourceSignals) { const target = eventSignals(next).find(signal => signal.id === copied.id); for (const value of copied.values) target?.values.push({ ...value, start: Number(value.start) + count }); target?.values.sort((a, b) => a.start - b.start); }
      model.document = next;
    });
  };
  controller.actions.moveRange = (start, end, target) => {
    const from = Number(start); const to = Number(end); const destination = Number(target); const count = to - from;
    if (!validInteger(from) || !validInteger(to) || !validInteger(destination) || count < 1 || to > model.document.timeline.cycleCount || destination > model.document.timeline.cycleCount) return false;
    return run(`Move cycles ${from}-${to} to ${destination}`, () => {
      const source = clone(model.document); const selected = eventSignals(source).map(signal => ({ id: signal.id, values: (signal.values || []).filter(value => Number(value.start) >= from && Number(value.start) < to).map(value => ({ ...value })) }));
      let next = deleteRange(model.document, from, to); const adjusted = destination > to ? destination - count : destination; next = insertCycles(next, adjusted, count);
      for (const copied of selected) { const targetSignal = eventSignals(next).find(signal => signal.id === copied.id); for (const value of copied.values) targetSignal?.values.push({ ...value, start: adjusted + Number(value.start) - from }); targetSignal?.values.sort((a, b) => a.start - b.start); }
      model.document = next;
    });
  };
  model.timeSelection = { cycle: 0, rangeStart: null, rangeEnd: null, source: 'initial' };
  controller.actions.getCurrentCycle = () => Math.max(0, Math.min(Number(model.timeSelection?.cycle ?? 0), Number(model.document.timeline?.cycleCount ?? 0)));
  const selectCycle = (cycle, { range = false, source = 'ruler' } = {}) => {
    const next = Math.max(0, Math.min(Number(cycle), Number(model.document.timeline?.cycleCount ?? 0)));
    if (!Number.isInteger(next)) return false;
    if (range && model.timeSelection.rangeStart !== null) model.timeSelection.rangeEnd = next;
    else { model.timeSelection.rangeStart = next; model.timeSelection.rangeEnd = null; }
    model.timeSelection.cycle = next;
    model.timeSelection.source = source;
    renderTransient(model);
    return true;
  };
  controller.actions.setCurrentCycle = cycle => selectCycle(cycle, { source: 'action' });
  const screenCycleBoundaries = () => {
    const referenceClock = controller.selectors.getReferenceClock();
    const count = Number(model.document.timeline?.cycleCount ?? 0);
    if (!referenceClock || !controller.getCycleBoundary) return [];
    return Array.from({ length: count + 1 }, (_, cycle) => controller.getDisplayCycleBoundary?.(cycle) || controller.getCycleBoundary({ signal: referenceClock.id, cycle, coordinateSpace: 'canvas' })).filter(Boolean);
  };
  const foldTokenWidth = 32;
  const buildDisplayMapping = currentModel => {
    const referenceClock = controller.selectors.getReferenceClock();
    const count = Number(currentModel.document.timeline?.cycleCount ?? 0);
    const actual = referenceClock ? Array.from({ length: count + 1 }, (_, cycle) => controller.getCycleBoundary?.({ signal: referenceClock.id, cycle, coordinateSpace: 'canvas' })).filter(Boolean) : [];
    const sourceX = cycle => actual[cycle]?.canvasX;
    const groups = (currentModel.document.timeGroups || []).filter(group => group.presentation?.collapsed && ['compact', 'axis-break'].includes(group.presentation?.foldStyle || 'axis-break') && Number.isInteger(Number(group.start)) && Number.isInteger(Number(group.end)) && Number(group.start) >= 0 && Number(group.end) <= count && Number(group.start) < Number(group.end)).sort((a, b) => Number(a.start) - Number(b.start));
    const folds = []; let reduction = 0;
    for (const group of groups) {
      const startX = sourceX(Number(group.start)); const endX = sourceX(Number(group.end));
      if (!Number.isFinite(startX) || !Number.isFinite(endX) || endX <= startX) continue;
      const width = endX - startX; const token = Math.min(foldTokenWidth, Math.max(12, width)); const displayStartX = startX - reduction; const displayEndX = displayStartX + token;
      folds.push({ groupId: group.id, sourceStart: Number(group.start), sourceEnd: Number(group.end), sourceStartX: startX, sourceEndX: endX, displayStartX, displayEndX, tokenWidth: token, omittedWidth: width, reductionBefore: reduction });
      reduction += width - token;
    }
    const mapSourceX = value => {
      const x = Number(value); let shifted = x;
      for (const fold of folds) {
        if (x < fold.sourceStartX) break;
        if (x <= fold.sourceEndX) return fold.displayStartX + ((x - fold.sourceStartX) / Math.max(0.0001, fold.omittedWidth)) * fold.tokenWidth;
        shifted -= fold.omittedWidth - fold.tokenWidth;
      }
      return shifted;
    };
    const mapSourceTime = cycle => { const boundary = actual[Number(cycle)]; return boundary ? mapSourceX(boundary.canvasX) : null; };
    const labelForSource = source => {
      let label = Number(source);
      for (const fold of folds) if (Number(source) >= fold.sourceEnd) { const group = currentModel.document.timeGroups.find(item => item.id === fold.groupId); const resume = group?.presentation?.displayAfter; if (resume?.mode === 'rebase' && Number.isFinite(Number(resume.value))) label = Number(resume.value) + Number(source) - fold.sourceEnd; }
      return label;
    };
    return { source: actual, folds, totalReduction: reduction, mapSourceX, mapSourceTime, labelForSource, mapBoundary: cycle => { const item = actual[Number(cycle)]; if (!item) return null; return { ...item, canvasX: mapSourceX(item.canvasX), x: mapSourceX(item.canvasX), source: 'wavedrom-svg-folded-mapping', displayLabel: labelForSource(cycle) }; } };
  };
  const renderAxisBreaks = (currentModel, mapping) => {
    const scrollHost = window.TimingChartTimingViewport?.getScrollHost?.() || document.querySelector('#cycleCanvas'); if (!scrollHost) return;
    scrollHost.querySelectorAll('[data-axis-break]').forEach(node => node.remove());
    if (!mapping.folds.length) return;
    const hostRect = scrollHost.getBoundingClientRect(); const rulerRect = document.querySelector('#cycleCanvas .ruler')?.getBoundingClientRect(); const top = Math.max(0, (rulerRect?.bottom || hostRect.top + 30) - hostRect.top + scrollHost.scrollTop); const height = Math.max(32, scrollHost.scrollHeight - top);
    for (const fold of mapping.folds) {
      const group = currentModel.document.timeGroups.find(item => item.id === fold.groupId); const overlay = document.createElement('div'); overlay.dataset.axisBreak = fold.groupId; overlay.dataset.sourceRange = `${fold.sourceStart}-${fold.sourceEnd}`; overlay.style.cssText = `position:absolute;left:${fold.displayStartX - hostRect.left + scrollHost.scrollLeft}px;top:${top}px;width:${Math.max(12, fold.tokenWidth)}px;height:${height}px;z-index:7;pointer-events:none;`;
      const label = document.createElement('span'); label.textContent = group?.presentation?.foldLabel || `${group?.name || 'omitted'} / ${fold.sourceEnd - fold.sourceStart} ${currentModel.document.timeline.timeBase || 'cycles'} omitted`; label.style.cssText = 'position:absolute;left:50%;top:4px;transform:translateX(-50%);padding:2px 4px;background:#fff;border:1px solid #7c8798;border-radius:3px;color:#4a5668;font:10px sans-serif;white-space:nowrap;';
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('aria-label', 'Axis break'); svg.setAttribute('width', String(Math.max(12, fold.tokenWidth))); svg.setAttribute('height', String(height)); svg.setAttribute('viewBox', `0 0 ${Math.max(12, fold.tokenWidth)} ${height}`); svg.style.cssText = 'position:absolute;inset:0;overflow:visible;'; const path = document.createElementNS('http://www.w3.org/2000/svg', 'path'); const w = Math.max(12, fold.tokenWidth); const wave = x => `M${x} 0 C ${x + 4} 8, ${x - 4} 16, ${x} 24 S ${x + 4} 40, ${x} 48 S ${x - 4} 64, ${x} 72 S ${x + 4} 88, ${x} 96`; path.setAttribute('d', `${wave(3)} ${wave(w - 3)}`); path.setAttribute('stroke', '#64748b'); path.setAttribute('stroke-width', '1.4'); path.setAttribute('fill', 'none'); path.setAttribute('vector-effect', 'non-scaling-stroke'); svg.appendChild(path); overlay.append(label, svg); scrollHost.appendChild(overlay);
    }
  };
  controller.buildDisplayMapping = buildDisplayMapping;
  controller.getDisplayCycleBoundary = cycle => controller.displayMapping?.mapBoundary?.(cycle) || null;
  controller.actions.resolveSnapAtCanvasX = clientX => {
    const boundaries = screenCycleBoundaries();
    if (!boundaries.length || !Number.isFinite(Number(clientX))) return null;
    const x = Number(clientX); let lower = boundaries[0]; let upper = boundaries.at(-1);
    for (let index = 0; index < boundaries.length - 1; index += 1) if (x >= boundaries[index].canvasX && x <= boundaries[index + 1].canvasX) { lower = boundaries[index]; upper = boundaries[index + 1]; break; }
    const width = Math.max(0.0001, upper.canvasX - lower.canvasX); const phase = Math.max(0, Math.min(1, (x - lower.canvasX) / width));
    const nearest = Math.abs(x - lower.canvasX) <= Math.abs(upper.canvasX - x) ? lower : upper;
    return { cycle: model.view.guides?.snap === false ? lower.cycle : nearest.cycle, phase, snapped: model.view.guides?.snap !== false, source: 'waveform-geometry', boundaryX: nearest.canvasX };
  };
  controller.actions.selectTimeAtCanvasX = (clientX, { shiftKey = false } = {}) => {
    const resolved = controller.actions.resolveSnapAtCanvasX(clientX);
    if (!resolved) return false;
    const result = selectCycle(resolved.cycle, { range: shiftKey, source: resolved.source });
    if (result) { model.timeSelection.phase = resolved.phase; model.timeSelection.snapped = resolved.snapped; }
    return result;
  };
  controller.actions.selectTimeRange = (start, end, { source = 'canvas-drag' } = {}) => {
    const count = Number(model.document.timeline?.cycleCount ?? 0);
    const first = Math.max(0, Math.min(count, Number(start)));
    const last = Math.max(0, Math.min(count, Number(end)));
    if (!Number.isInteger(first) || !Number.isInteger(last)) return false;
    model.timeSelection.rangeStart = Math.min(first, last);
    model.timeSelection.rangeEnd = Math.max(first, last);
    model.timeSelection.cycle = last;
    model.timeSelection.source = source;
    renderTransient(model);
    return true;
  };

  const renderEdgeCounters = currentModel => {
    metrics.edgeCounterRebuilds += 1;
    const canvas = document.querySelector('#cycleCanvas'); if (!canvas) return;
    const scrollHost = window.TimingChartTimingViewport?.getScrollHost?.() || canvas;
    scrollHost.querySelectorAll('[data-edge-counter]').forEach(node => node.remove());
    const canvasRect = scrollHost.getBoundingClientRect();
    for (const signal of currentModel.document.signals.filter(item => item.type === 'clock' && item.edgeCounter?.show)) {
      const counter = signal.edgeCounter; const mode = counter.mode || 'rising';
      const rising = currentModel.waveGeometry?.signals?.[signal.id]?.risingEdge || [];
      const falling = currentModel.waveGeometry?.signals?.[signal.id]?.fallingEdge || [];
      const edges = (mode === 'both' ? [...rising.map(edge => ({ ...edge, edge: 'rising' })), ...falling.map(edge => ({ ...edge, edge: 'falling' }))] : mode === 'falling' ? falling.map(edge => ({ ...edge, edge: 'falling' })) : rising.map(edge => ({ ...edge, edge: 'rising' }))).sort((a, b) => a.canvasX - b.canvasX);
      const startNumber = Number(counter.startNumber ?? 1); const every = Math.max(1, Number(counter.labelEvery ?? 1));
      edges.forEach((edge, index) => { if (index % every) return; const label = document.createElement('span'); label.dataset.edgeCounter = signal.id; const mappedX = currentModel.displayMapping?.mapSourceX?.(edge.canvasX) ?? edge.canvasX; label.textContent = String(startNumber + index); label.style.cssText = `position:absolute;left:${mappedX - canvasRect.left + Number(counter.offset?.x || 0) + scrollHost.scrollLeft}px;top:${edge.canvasY - canvasRect.top + Number(counter.offset?.y || (counter.position === 'below' ? 8 : -8))}px;z-index:5;color:#52647a;font:11px sans-serif;pointer-events:none;`; label.title = `${signal.id} ${edge.edge} edge ${startNumber + index}`; scrollHost.appendChild(label); });
    }
  };
  const alignCommentRowsToCycleZero = currentModel => {
    const canvas = document.querySelector('#cycleCanvas');
    const referenceClock = controller.selectors.getReferenceClock();
    const boundary = controller.getCycleBoundary?.({ signal: referenceClock?.id, cycle: 0, coordinateSpace: 'canvas' });
    if (!canvas || !boundary || boundary.source !== 'wavedrom-svg') return;
    canvas.querySelectorAll('.wave-row').forEach(row => {
      if (row.querySelector('.trace')) return;
      const band = row.querySelector('.comment-body, .latency');
      if (!band) return;
      const delta = boundary.canvasX - band.getBoundingClientRect().left;
      band.style.transform = `translateX(${delta}px)`;
      band.dataset.cycle0Aligned = 'wavedrom-svg';
      band.dataset.cycle0ErrorPx = String(Math.abs(delta));
    });
  };

  const renderRangeSelection = currentModel => {
    const scrollHost = window.TimingChartTimingViewport?.getScrollHost?.() || document.querySelector('#cycleCanvas');
    if (!scrollHost) return;
    scrollHost.querySelectorAll('[data-time-range-selection]').forEach(node => node.remove());
    const start = Number(currentModel.timeSelection?.rangeStart);
    const end = Number(currentModel.timeSelection?.rangeEnd);
    if (!Number.isInteger(start) || !Number.isInteger(end) || end <= start) return;
    const referenceClock = controller.selectors.getReferenceClock();
    const first = controller.getDisplayCycleBoundary?.(start) || controller.getCycleBoundary?.({ signal: referenceClock?.id, cycle: start, coordinateSpace: 'canvas' });
    const last = controller.getDisplayCycleBoundary?.(end) || controller.getCycleBoundary?.({ signal: referenceClock?.id, cycle: end, coordinateSpace: 'canvas' });
    if (!first || !last) return;
    const hostRect = scrollHost.getBoundingClientRect();
    const rulerRect = document.querySelector('#cycleCanvas .ruler')?.getBoundingClientRect();
    const left = Math.min(first.canvasX, last.canvasX) - hostRect.left + scrollHost.scrollLeft;
    const right = Math.max(first.canvasX, last.canvasX) - hostRect.left + scrollHost.scrollLeft;
    const top = Math.max(34, (rulerRect?.bottom || hostRect.top + 34) - hostRect.top + scrollHost.scrollTop);
    const band = document.createElement('div');
    band.dataset.timeRangeSelection = 'true';
    band.setAttribute('aria-label', `Selected cycles ${start} to ${end}`);
    band.style.cssText = `position:absolute;left:${left}px;top:${top}px;width:${Math.max(1, right-left)}px;height:${Math.max(1, scrollHost.scrollHeight-top)}px;background:rgba(45,131,239,.12);border-left:1px solid #2d83ef;border-right:1px solid #2d83ef;pointer-events:none;z-index:2;`;
    const label = document.createElement('span');
    label.textContent = `${start}–${end} / ${end-start} cycles`;
    label.style.cssText = 'position:absolute;top:4px;left:4px;padding:2px 5px;background:#fff;border:1px solid #9fc5f3;border-radius:3px;color:#2169b6;font:11px sans-serif;white-space:nowrap;';
    band.appendChild(label); scrollHost.appendChild(band);
    const status = document.querySelector('.status');
    if (status) status.dataset.timeRange = `${start}-${end}`;
  };

  const renderTransient = currentModel => {
    metrics.transientFrames += 1;
    metrics.rulerRebuilds += 1;
    currentModel.displayMapping = buildDisplayMapping(currentModel);
    controller.displayMapping = currentModel.displayMapping;
    const scrollHost = window.TimingChartTimingViewport?.getScrollHost?.() || document.querySelector('#cycleCanvas');
    const timeline = currentModel.document.timeline;
    const ruler = document.querySelector('#cycleCanvas .ruler');
    if (ruler) {
      const title = ruler.querySelector('.cycle-title');
      ruler.innerHTML = '';
      if (title) ruler.appendChild(title); else { const cycleTitle = document.createElement('span'); cycleTitle.className = 'cycle-title'; cycleTitle.textContent = timeline.timeBase; ruler.appendChild(cycleTitle); }
      const count = timeline.cycleCount;
      const labelWidth = Number(currentModel.view.previewSignalNameWidth ?? timeline.signalNameWidth ?? currentModel.document.layout?.signalNameWidth ?? 168) + 7;
      ruler.style.gridTemplateColumns = `${labelWidth}px repeat(${count + 1}, 1fr)`;
      ruler.appendChild(document.createElement('span'));
      for (let cycle = 0; cycle < count; cycle += 1) { const tick = document.createElement('span'); tick.className = 'tick'; tick.textContent = currentModel.displayMapping.labelForSource(cycle); tick.dataset.cycle = cycle; tick.dataset.sourceCycle = cycle; tick.addEventListener('click', event => { selectCycle(cycle, { range: event.shiftKey, source: 'ruler' }); }); ruler.appendChild(tick); }
      if (Number(currentModel.timeSelection?.cycle) === count) { const finalTick = document.createElement('span'); finalTick.className = 'tick'; finalTick.textContent = currentModel.displayMapping.labelForSource(count); finalTick.dataset.cycle = count; finalTick.dataset.sourceCycle = count; finalTick.addEventListener('click', event => { selectCycle(count, { range: event.shiftKey, source: 'ruler' }); }); ruler.appendChild(finalTick); }
      const referenceClock = controller.selectors.getReferenceClock();
      const boundaries = Array.from({ length: count + 1 }, (_, cycle) => controller.getDisplayCycleBoundary?.(cycle) || controller.getCycleBoundary?.({ signal: referenceClock?.id, cycle, coordinateSpace: 'canvas' })).filter(Boolean);
      if (boundaries.length >= count) {
        const rulerRect = ruler.getBoundingClientRect();
        ruler.style.position = 'relative';
        ruler.querySelectorAll('.tick').forEach(tick => {
          const cycle = Number(tick.dataset.cycle);
          const boundary = boundaries[cycle]; if (!boundary) return;
          const x = boundary.canvasX - rulerRect.left;
          tick.style.position = 'absolute'; tick.style.left = `${x}px`; tick.style.top = '0px'; tick.style.transform = 'translateX(-50%)';
        });
      }
      ruler.querySelectorAll('[data-bookmark-flag]').forEach(flag => flag.remove());
      for (const bookmark of currentModel.document.bookmarks || []) {
        const boundary = boundaries[Number(bookmark.start)];
        if (!boundary) continue;
        const flag = document.createElement('button');
        flag.type = 'button'; flag.dataset.bookmarkFlag = bookmark.id; flag.title = `${bookmark.name} (source ${bookmark.start}, display ${currentModel.displayMapping.labelForSource(bookmark.start)})`; flag.textContent = '⚑';
        flag.style.cssText = `position:absolute;left:${boundary.canvasX - ruler.getBoundingClientRect().left}px;top:-14px;border:0;background:transparent;color:#c47a00;padding:0;line-height:12px;cursor:pointer;transform:translateX(-50%);`;
        flag.addEventListener('click', event => { event.stopPropagation(); controller.actions.revealBookmark(bookmark.id); });
        ruler.appendChild(flag);
      }
    }
    const playhead = document.querySelector('#cycleCanvas .playhead');
    const referenceClock = controller.selectors.getReferenceClock();
    const boundary = controller.getDisplayCycleBoundary?.(currentModel.timeSelection?.cycle || 0) || controller.getCycleBoundary?.({ signal: referenceClock?.id, cycle: currentModel.timeSelection?.cycle || 0, coordinateSpace: 'canvas' });
    const canvas = document.querySelector('#cycleCanvas');
    if (playhead && boundary && canvas) { const rect = scrollHost.getBoundingClientRect(); playhead.style.left = `${boundary.canvasX - rect.left + scrollHost.scrollLeft}px`; playhead.style.pointerEvents = 'none'; playhead.dataset.currentCycle = String(currentModel.timeSelection?.cycle ?? 0); playhead.title = `挿入位置: Cycle ${currentModel.timeSelection?.cycle ?? 0} の直前`; }
    if (ruler) { ruler.dataset.currentCycle = String(currentModel.timeSelection?.cycle ?? 0); ruler.querySelectorAll('.tick').forEach(tick => { const selected = Number(tick.dataset.cycle) === Number(currentModel.timeSelection?.cycle); tick.dataset.selected = selected ? 'true' : 'false'; tick.style.fontWeight = selected ? '700' : ''; tick.style.color = selected ? '#1473e6' : ''; }); }
    if (canvas) { canvas.dataset.currentCycle = String(currentModel.timeSelection?.cycle ?? 0); canvas.title = `挿入位置: Cycle ${currentModel.timeSelection?.cycle ?? 0} の直前`; }
    renderAxisBreaks(currentModel, currentModel.displayMapping);
    renderRangeSelection(currentModel);
    const rangeTool = [...document.querySelectorAll('.tool')].find(button => button.querySelector('.tool-label')?.textContent?.replace(/\s/g, '').includes('範囲削除'));
    const rangeStart = Number(currentModel.timeSelection?.rangeStart); const rangeEnd = Number(currentModel.timeSelection?.rangeEnd);
    const validRange = Number.isInteger(rangeStart) && Number.isInteger(rangeEnd) && rangeEnd > rangeStart;
    if (rangeTool) { rangeTool.disabled = !validRange; rangeTool.dataset.rangeDelete = validRange ? 'enabled' : 'disabled'; rangeTool.title = validRange ? `Cycle ${rangeStart}–${rangeEnd} を削除` : 'タイミング領域をドラッグして範囲を選択してください'; }
    alignCommentRowsToCycleZero(currentModel);
    if (window.requestAnimationFrame) window.requestAnimationFrame(() => alignCommentRowsToCycleZero(currentModel));
    renderEdgeCounters(currentModel);
  };
  controller.renderTransient = renderTransient;
  let transientFrame = 0;
  let pendingTransientModel = model;
  const scheduleTransientLayout = currentModel => {
    pendingTransientModel = currentModel || model;
    if (transientFrame) return;
    transientFrame = requestAnimationFrame(() => { transientFrame = 0; renderTransient(pendingTransientModel); });
  };
  controller.scheduleTransientLayout = scheduleTransientLayout;
  const renderScrollTransient = currentModel => {
    metrics.scrollEvents += 1;
    const scrollHost = window.TimingChartTimingViewport?.getScrollHost?.() || document.querySelector('#cycleCanvas');
    const playhead = document.querySelector('#cycleCanvas .playhead');
    const referenceClock = controller.selectors.getReferenceClock();
    const boundary = controller.getDisplayCycleBoundary?.(currentModel.timeSelection?.cycle || 0) || controller.getCycleBoundary?.({ signal: referenceClock?.id, cycle: currentModel.timeSelection?.cycle || 0, coordinateSpace: 'canvas' });
    if (playhead && boundary && scrollHost) {
      const rect = scrollHost.getBoundingClientRect();
      playhead.style.left = `${boundary.canvasX - rect.left + scrollHost.scrollLeft}px`;
    }
  };
  controller.renderScrollTransient = renderScrollTransient;
  window.TimingChartProductionTimeAxis = { renderTransient: scheduleTransientLayout, renderNow: renderTransient, renderScrollTransient, insertCycles, deleteCycles, deleteRange, mapPointForInsert, mapPointForDelete };
  window.addEventListener('resize', () => scheduleTransientLayout(model));
  const cycleCanvas = document.querySelector('#cycleCanvas');
  document.querySelector('#cycleCanvas .ruler')?.addEventListener('contextmenu', event => {
    event.preventDefault();
    const resolved = controller.actions.resolveSnapAtCanvasX?.(event.clientX);
    if (!resolved) return;
    const name = window.prompt?.('Bookmark名', `Bookmark ${((model.document.bookmarks || []).length || 0) + 1}`);
    if (name !== null && String(name).trim()) controller.actions.addBookmark(resolved.cycle, { name: String(name).trim() });
  });
  let suppressNextCanvasClick = false;
  cycleCanvas?.addEventListener('click', event => {
    if (suppressNextCanvasClick) {
      suppressNextCanvasClick = false;
      event.preventDefault();
      return;
    }
    if (event.button !== 0 || event.defaultPrevented) return;
    const target = event.target;
    if (target.closest('.ruler, .canvas-meta, .signal-label, .canvas-icon, .playhead, [data-production-overlay], button, input, select, textarea')) return;
    if (!target.closest('.wave, .wave-row, .trace')) return;
    controller.actions.selectTimeAtCanvasX(event.clientX, { shiftKey: event.shiftKey });
  });
  let rangeGesture = null;
  const isRangeTarget = target => target && !target.closest('.ruler, .canvas-meta, .signal-label, .canvas-icon, .playhead, [data-production-overlay], button, input, select, textarea') && target.closest('.wave, .wave-row, .trace');
  cycleCanvas?.addEventListener('pointerdown', event => {
    if (event.button !== 0 || !isRangeTarget(event.target)) return;
    const resolved = controller.actions.resolveSnapAtCanvasX?.(event.clientX);
    if (!resolved) return;
    rangeGesture = { start: resolved.cycle, pointerId: event.pointerId, clientX: event.clientX, moved: false };
    try { cycleCanvas.setPointerCapture?.(event.pointerId); } catch { /* synthetic/browser pointer streams may not own capture */ }
    model.timeSelection = { ...model.timeSelection, cycle: resolved.cycle, rangeStart: resolved.cycle, rangeEnd: null, source: 'canvas-drag' };
    renderTransient(model);
  });
  cycleCanvas?.addEventListener('pointermove', event => {
    if (!rangeGesture) return;
    const resolved = controller.actions.resolveSnapAtCanvasX?.(event.clientX);
    if (!resolved) return;
    if (resolved.cycle !== rangeGesture.start) rangeGesture.moved = true;
    controller.actions.selectTimeRange(rangeGesture.start, resolved.cycle, { source: 'canvas-drag' });
  });
  const finishRangeGesture = event => {
    if (!rangeGesture) return;
    const current = rangeGesture; rangeGesture = null; try { cycleCanvas.releasePointerCapture?.(current.pointerId); } catch { /* capture may already be released */ }
    if (!current.moved) {
      model.timeSelection.rangeStart = null;
      model.timeSelection.rangeEnd = null;
      renderTransient(model);
      suppressNextCanvasClick = true;
      controller.actions.selectTimeAtCanvasX(current.clientX, { shiftKey: event.shiftKey });
    } else {
      suppressNextCanvasClick = true;
    }
  };
  cycleCanvas?.addEventListener('pointerup', finishRangeGesture);
  cycleCanvas?.addEventListener('pointercancel', finishRangeGesture);
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || (!model.timeSelection?.rangeStart && model.timeSelection?.rangeStart !== 0)) return;
    model.timeSelection.rangeStart = null; model.timeSelection.rangeEnd = null; renderTransient(model);
  });
  (window.TimingChartTimingViewport?.getScrollHost?.() || cycleCanvas)?.addEventListener('scroll', () => renderScrollTransient(model), { passive: true });
  if (cycleCanvas && window.ResizeObserver) new ResizeObserver(() => scheduleTransientLayout(model)).observe(cycleCanvas);

  const tool = text => [...document.querySelectorAll('.tool')].find(button => button.querySelector('.tool-label')?.textContent?.replace(/\s/g, '').includes(text));
  tool('Cycle挿入')?.addEventListener('click', () => insert(model.timeSelection.cycle, 1));
  tool('Cycle削除')?.addEventListener('click', () => removeRange(model.timeSelection.cycle, model.timeSelection.cycle + 1));
  tool('NCycle挿入')?.addEventListener('click', event => {
    if (typeof window.issue92ShowFieldPopover !== 'function') return;
    window.issue92ShowFieldPopover({
      anchor: event.currentTarget, title: 'N Cycle 挿入',
      fields: [{ key: 'count', label: '挿入するCycle数', type: 'number', min: 1, max: 1000, step: 1, value: 2, validate: value => {
        if (!Number.isFinite(value) || !Number.isInteger(value)) return '整数を入力してください';
        if (value < 1) return '1以上の値を入力してください';
        return null;
      } }],
      onApply: values => insert(model.timeSelection.cycle, values.count)
    });
  });
  tool('範囲削除')?.addEventListener('click', () => { const start = Number(model.timeSelection?.rangeStart); const end = Number(model.timeSelection?.rangeEnd); if (Number.isInteger(start) && Number.isInteger(end) && end > start) controller.actions.deleteRange(start, end); });
  renderTransient(model);
})();
