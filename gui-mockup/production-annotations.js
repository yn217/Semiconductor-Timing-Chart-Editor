(() => {
  'use strict';
  const controller = window.TimingChartProductionController;
  if (!controller) return;
  const model = controller.model;
  const clone = value => structuredClone(value);
  const points = new Set(['cycle-boundary', 'rising', 'falling', 'transition-start', 'transition-center', 'transition-end']);
  const types = new Set(['range', 'marker', 'text', 'callout', 'dependency', 'verticalLine', 'bracket', 'highlight']);
  const edgeForPoint = point => point === 'cycle-boundary' ? null : point;
  const anchorOf = anchor => {
    if (!anchor || !points.has(anchor.point)) return { error: 'unresolved-anchor' };
    const result = anchor.point === 'cycle-boundary'
      ? controller.getCycleBoundary?.({ signal: anchor.signal, cycle: Number(anchor.cycle), coordinateSpace: 'canvas' })
      : controller.getAnchor?.({ signal: anchor.signal, cycle: Number(anchor.cycle), edge: edgeForPoint(anchor.point), coordinateSpace: 'canvas' });
    if (!result) return { error: 'unresolved-anchor' };
    return { ...result, semantic: clone(anchor), x: result.canvasX + Number(anchor.offset?.x || 0), y: result.canvasY + Number(anchor.offset?.y || 0), source: 'wavedrom-svg', signal: anchor.signal, cycle: Number(anchor.cycle), anchorType: result.anchorType || anchor.point };
  };
  const anchorKeys = annotation => ['anchor', 'start', 'end', 'from', 'to'].filter(key => annotation[key]);
  const resolve = annotation => { const result = {}; const errors = []; for (const key of anchorKeys(annotation)) { const value = anchorOf(annotation[key]); result[key] = value; if (value.error) errors.push({ annotationId: annotation.id, code: value.error, field: key }); } return { result, errors }; };
  const offsetAnchor = (anchor, dx, dy) => ({ ...anchor, offset: { x: Number(anchor.offset?.x || 0) + dx, y: Number(anchor.offset?.y || 0) + dy } });
  const makeId = () => { const ids = new Set((model.document.annotations || []).map(annotation => annotation.id)); let index = 1; while (ids.has(`ann_${String(index).padStart(4, '0')}`)) index += 1; return `ann_${String(index).padStart(4, '0')}`; };
  const defaultAnchor = () => ({ signal: model.document.timeline.referenceClock, cycle: Number(model.timeSelection?.cycle || 0), point: 'cycle-boundary', offset: { x: 0, y: 0 } });
  const defaultAnnotation = (type = 'marker') => ({ id: makeId(), type, label: type === 'marker' ? 'Marker' : '', color: '#1473e6', position: 'canvas', comment: '', visible: true, anchor: defaultAnchor() });
  const withRange = annotation => { if (['range', 'bracket', 'highlight'].includes(annotation.type) && (!annotation.start || !annotation.end)) { annotation.start = annotation.anchor || defaultAnchor(); annotation.end = clone(annotation.start); annotation.end.cycle = Math.min(model.document.timeline.cycleCount, annotation.end.cycle + 1); delete annotation.anchor; } return annotation; };
  const renderSvg = (annotation, resolved, overlay, canvasRect) => {
    if (annotation.visible === false) return;
    const p = key => resolved[key] && !resolved[key].error ? resolved[key] : null;
    const start = p('start') || p('from') || p('anchor'); const end = p('end') || p('to');
    const line = (x1, y1, x2, y2, extra = {}) => { const el = document.createElementNS('http://www.w3.org/2000/svg', 'line'); Object.assign(el.dataset, extra); el.setAttribute('x1', x1); el.setAttribute('y1', y1); el.setAttribute('x2', x2); el.setAttribute('y2', y2); el.setAttribute('stroke', annotation.color || '#1473e6'); el.setAttribute('stroke-width', '1.5'); return el; };
    const xy = point => point && { x: point.x - canvasRect.left + document.querySelector('#cycleCanvas').scrollLeft, y: point.y - canvasRect.top + document.querySelector('#cycleCanvas').scrollTop };
    const label = (x, y, text, extra = {}) => { const el = document.createElementNS('http://www.w3.org/2000/svg', 'text'); el.textContent = text || ''; el.setAttribute('x', x); el.setAttribute('y', y); el.setAttribute('fill', annotation.color || '#1473e6'); el.setAttribute('font-size', '11'); Object.entries(extra).forEach(([key, value]) => el.setAttribute(key, value)); return el; };
    if (annotation.type === 'range' || annotation.type === 'dependency') {
      if (!start || !end) return;
      const a = xy(start); const b = xy(end); const lineType = annotation.lineType || 'orthogonal';
      if (annotation.type === 'dependency' && lineType === 'orthogonal') { overlay.appendChild(line(a.x, a.y, (a.x + b.x) / 2, a.y, { segment: 'horizontal' })); overlay.appendChild(line((a.x + b.x) / 2, a.y, (a.x + b.x) / 2, b.y, { segment: 'vertical' })); overlay.appendChild(line((a.x + b.x) / 2, b.y, b.x, b.y, { segment: 'horizontal' })); } else if (annotation.type === 'dependency' && lineType === 'curve') { const path = document.createElementNS('http://www.w3.org/2000/svg', 'path'); path.setAttribute('d', `M ${a.x} ${a.y} C ${(a.x + b.x) / 2} ${a.y}, ${(a.x + b.x) / 2} ${b.y}, ${b.x} ${b.y}`); path.setAttribute('fill', 'none'); path.setAttribute('stroke', annotation.color || '#1473e6'); path.setAttribute('stroke-width', '1.5'); overlay.appendChild(path); } else overlay.appendChild(line(a.x, a.y, b.x, b.y));
      if (annotation.label) overlay.appendChild(label((a.x + b.x) / 2 + Number(annotation.labelOffset?.x || 0), (a.y + b.y) / 2 + Number(annotation.labelOffset?.y || -8), annotation.label, { 'text-anchor': 'middle' }));
      return;
    }
    if (annotation.type === 'verticalLine') { if (!start) return; const a = xy(start); overlay.appendChild(line(a.x, 0, a.x, canvasRect.height)); return; }
    if (annotation.type === 'highlight') { if (!start || !end) return; const a = xy(start); const b = xy(end); const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect'); rect.setAttribute('x', Math.min(a.x, b.x)); rect.setAttribute('y', 0); rect.setAttribute('width', Math.abs(b.x - a.x)); rect.setAttribute('height', canvasRect.height); rect.setAttribute('fill', annotation.color || '#1473e6'); rect.setAttribute('opacity', '0.12'); overlay.appendChild(rect); return; }
    if (annotation.type === 'bracket') { if (!start || !end) return; const a = xy(start); const b = xy(end); const y = Math.min(a.y, b.y) - 12; overlay.appendChild(line(a.x, y, b.x, y)); overlay.appendChild(line(a.x, y, a.x, y + 7)); overlay.appendChild(line(b.x, y, b.x, y + 7)); return; }
    if (!start) return;
    const a = xy(start); const marker = document.createElementNS('http://www.w3.org/2000/svg', annotation.type === 'callout' ? 'rect' : 'circle'); marker.dataset.annotationId = annotation.id; marker.setAttribute('fill', annotation.color || '#1473e6'); marker.setAttribute('stroke', '#fff'); marker.setAttribute('stroke-width', '1');
    if (annotation.type === 'callout') { marker.setAttribute('x', a.x + 20); marker.setAttribute('y', a.y - 34); marker.setAttribute('width', '140'); marker.setAttribute('height', '24'); marker.setAttribute('fill-opacity', '0.12'); overlay.appendChild(line(a.x, a.y, a.x + 20, a.y - 22)); } else { marker.setAttribute('cx', a.x); marker.setAttribute('cy', a.y); marker.setAttribute('r', annotation.type === 'text' ? '4' : '5'); }
    marker.addEventListener('click', event => { event.stopPropagation(); controller.actions.selectAnnotation(annotation.id); }); overlay.appendChild(marker);
    if (annotation.label) overlay.appendChild(label(annotation.type === 'callout' ? a.x + 26 : a.x + 8, annotation.type === 'callout' ? a.y - 18 : a.y - 8, annotation.label));
  };
  const render = currentModel => {
    let overlay = document.querySelector('#cycleCanvas svg[data-production-overlay="annotations"]');
    if (!overlay) { overlay = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); overlay.dataset.productionOverlay = 'annotations'; overlay.setAttribute('data-production-overlay', 'annotations'); overlay.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;overflow:visible;pointer-events:none;z-index:4'; document.querySelector('#cycleCanvas')?.appendChild(overlay); }
    overlay.innerHTML = ''; const canvas = document.querySelector('#cycleCanvas'); if (!canvas) return; const rect = canvas.getBoundingClientRect(); const errors = [];
    for (const annotation of currentModel.document.annotations || []) { const resolved = resolve(annotation); errors.push(...resolved.errors); renderSvg(annotation, resolved.result, overlay, rect); }
    currentModel.annotationValidation = errors;
  };
  const run = (label, mutation) => controller.documentHistory.run(label, mutation);
  controller.transformAnnotations = (documentValue, start, endOrCount, mode) => {
    const next = documentValue; const insert = mode === 'insert'; const end = insert ? null : endOrCount; const count = insert ? endOrCount : end - start;
    for (const annotation of next.annotations || []) for (const key of anchorKeys(annotation)) { const anchor = annotation[key]; const mapped = insert ? controller.timeAxis.mapPointForInsert(anchor.cycle, start, count) : controller.timeAxis.mapPointForDelete(anchor.cycle, start, end); anchor.cycle = mapped.mapped; if (mapped.status === 'deleted') annotation.runtimeUnresolved = true; }
    return next;
  };
  controller.annotationResolve = anchorOf;
  controller.actions.selectAnnotation = id => { if (!(model.document.annotations || []).some(annotation => annotation.id === id)) return false; model.selection = { kind: 'annotation', id }; if (model.view.followSelection && !model.view.pinned) model.view.tab = 'annotation'; controller.render(); return true; };
  controller.actions.addAnnotation = (type = 'marker', seed = {}) => run('Add annotation', () => { const annotation = withRange({ ...defaultAnnotation(type), ...clone(seed), id: seed.id || makeId(), type }); model.document.annotations.push(annotation); model.selection = { kind: 'annotation', id: annotation.id }; model.view.tab = 'annotation'; });
  controller.actions.duplicateAnnotation = id => run('Duplicate annotation', () => { const source = model.document.annotations.find(annotation => annotation.id === id); if (!source) return false; const copy = withRange(clone(source)); copy.id = makeId(); model.document.annotations.push(copy); model.selection = { kind: 'annotation', id: copy.id }; return true; });
  controller.actions.deleteAnnotation = id => run('Delete annotation', () => { const index = model.document.annotations.findIndex(annotation => annotation.id === id); if (index < 0) return false; model.document.annotations.splice(index, 1); const next = model.document.annotations[index] || model.document.annotations[index - 1]; model.selection = next ? { kind: 'annotation', id: next.id } : { kind: 'signal', id: model.document.timeline.referenceClock }; return true; });
  controller.actions.updateAnnotation = (id, field, value) => run(`Update annotation ${field}`, () => { const annotation = model.document.annotations.find(item => item.id === id); if (!annotation) return false; if (field.startsWith('offset.')) { const anchor = annotation.anchor || annotation.start || annotation.from; if (!anchor) return false; anchor.offset[field.endsWith('x') ? 'x' : 'y'] = Number(value); } else if (field === 'visible') annotation.visible = Boolean(value); else annotation[field] = String(value); return true; });
  controller.actions.updateAnnotationAnchor = (id, key, field, value) => run(`Update annotation ${field}`, () => { const annotation = model.document.annotations.find(item => item.id === id); const anchor = annotation?.[key]; if (!anchor) return false; if (field === 'cycle') anchor.cycle = Number(value); else if (field === 'offset.x' || field === 'offset.y') anchor.offset[field.endsWith('x') ? 'x' : 'y'] = Number(value); else anchor[field] = String(value); return true; });
  let drag = null;
  document.addEventListener('pointerdown', event => { const id = event.target?.dataset?.annotationId; if (!id) return; const annotation = model.document.annotations.find(item => item.id === id); if (!annotation || !['marker', 'text', 'callout'].includes(annotation.type)) return; drag = { id, x: event.clientX, y: event.clientY, anchor: clone(annotation.anchor) }; event.target.setPointerCapture?.(event.pointerId); });
  document.addEventListener('pointerup', event => { if (!drag) return; const current = drag; drag = null; const dx = event.clientX - current.x; const dy = event.clientY - current.y; if (dx || dy) run('Move annotation', () => { const annotation = model.document.annotations.find(item => item.id === current.id); if (!annotation) return false; annotation.anchor = offsetAnchor(current.anchor, dx, dy); return true; }); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') drag = null; });
  window.TimingChartProductionAnnotations = { render, resolve: anchorOf, types: [...types] };
  render(model);
})();
