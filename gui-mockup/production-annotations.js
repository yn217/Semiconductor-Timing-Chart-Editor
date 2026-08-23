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
  const semanticPoint = anchorType => anchorType === 'rising-edge' || anchorType === 'rising-transition-center' ? 'rising' : anchorType === 'falling-edge' || anchorType === 'falling-transition-center' ? 'falling' : ['cycle-boundary', 'transition-start', 'transition-center', 'transition-end'].includes(anchorType) ? anchorType : 'transition-center';
  const snapMetrics = controller.annotationSnapMetrics ||= { indexBuilds: 0, queries: 0, candidateScans: 0, yCandidates: 0, sortCount: 0, screenMatrixCalls: 0 };
  let snapIndex = null;
  const geometryCandidates = () => Object.values(model.waveGeometry?.signals || {}).flatMap(entry => ['cycleBoundary', 'risingEdge', 'fallingEdge', 'transitionStart', 'transitionCenter', 'transitionEnd'].flatMap(key => (entry[key] || []).map(item => ({ ...item, point: semanticPoint(item.anchorType) }))));
  const lowerBound = (items, value) => { let low = 0; let high = items.length; while (low < high) { const middle = (low + high) >> 1; if (items[middle].y < value) low = middle + 1; else high = middle; } return low; };
  const ensureSnapIndex = () => {
    const geometry = model.waveGeometry;
    if (!geometry) return null;
    if (snapIndex?.geometry === geometry) return snapIndex;
    const candidates = geometryCandidates().map((item, order) => ({ item, x: Number(item.canvasX), y: Number(item.canvasY), order }))
      .filter(candidate => Number.isFinite(candidate.x) && Number.isFinite(candidate.y));
    // Sort once per WaveDrom geometry revision. Pointer queries never sort or
    // transform individual candidates; canvasX/canvasY are authoritative.
    const byY = [...candidates].sort((a, b) => a.y - b.y || a.order - b.order);
    snapMetrics.indexBuilds += 1;
    snapMetrics.sortCount += 1;
    snapIndex = { geometry, candidates, byY };
    return snapIndex;
  };
  const resolveAnnotationAnchorPointer = ({ x, y, annotationId = null, anchorKey = null } = {}) => {
    const index = ensureSnapIndex();
    if (!index) return null;
    const pointerX = Number(x); const pointerY = Number(y); const radius = 28;
    const start = lowerBound(index.byY, pointerY - radius);
    let nearest = null; let bestD2 = Infinity; let bestOrder = Infinity;
    snapMetrics.queries += 1;
    for (let position = start; position < index.byY.length && index.byY[position].y <= pointerY + radius; position += 1) {
      const candidate = index.byY[position];
      snapMetrics.yCandidates += 1;
      const dx = candidate.x - pointerX; const dy = candidate.y - pointerY; const d2 = dx * dx + dy * dy;
      snapMetrics.candidateScans += 1;
      if (d2 < bestD2 || (d2 === bestD2 && candidate.order < bestOrder)) { nearest = { item: candidate.item, x: candidate.x, y: candidate.y, distance: Math.sqrt(d2) }; bestD2 = d2; bestOrder = candidate.order; }
    }
    if (!nearest || nearest.distance > 28) return null;
    return { signal: nearest.item.signal, cycle: Number(nearest.item.cycle), point: nearest.item.point, offset: { x: 0, y: 0 }, source: 'wavedrom-svg', anchorType: nearest.item.anchorType, annotationId, anchorKey, screenX: nearest.x, screenY: nearest.y, distance: nearest.distance };
  };
  const resolveNearestAnnotationAnchor = ({ anchor, annotationId = null, anchorKey = null } = {}) => {
    const resolved = anchorOf(anchor);
    return resolved.error ? null : resolveAnnotationAnchorPointer({ x: resolved.x, y: resolved.y, annotationId, anchorKey });
  };
  const anchorKeys = annotation => ['anchor', 'start', 'end', 'from', 'to'].filter(key => annotation[key]);
  const resolve = annotation => { const result = {}; const errors = []; for (const key of anchorKeys(annotation)) { const value = anchorOf(annotation[key]); result[key] = value; if (value.error) errors.push({ annotationId: annotation.id, code: value.error, field: key }); } return { result, errors }; };
  const offsetAnchor = (anchor, dx, dy) => ({ ...anchor, offset: { x: Number(anchor.offset?.x || 0) + dx, y: Number(anchor.offset?.y || 0) + dy } });
  const makeId = () => { const ids = new Set((model.document.annotations || []).map(annotation => annotation.id)); let index = 1; while (ids.has(`ann_${String(index).padStart(4, '0')}`)) index += 1; return `ann_${String(index).padStart(4, '0')}`; };
  const defaultAnchor = () => ({ signal: model.document.timeline.referenceClock, cycle: Number(model.timeSelection?.cycle || 0), point: 'cycle-boundary', offset: { x: 0, y: 0 } });
  const defaultAnnotation = (type = 'marker') => ({ id: makeId(), type, label: type === 'marker' ? 'Marker' : '', color: '#1473e6', position: 'canvas', comment: '', visible: true, anchor: defaultAnchor() });
  const withRange = annotation => { if (['range', 'bracket', 'highlight'].includes(annotation.type) && (!annotation.start || !annotation.end)) { annotation.start = annotation.anchor || defaultAnchor(); annotation.end = clone(annotation.start); annotation.end.cycle = Math.min(model.document.timeline.cycleCount, annotation.end.cycle + 1); delete annotation.anchor; } return annotation; };
  const migrateAnnotationType = (annotation, nextType) => {
    if (!types.has(nextType)) return false;
    if (annotation.type === nextType) return true;
    const anchors = anchorKeys(annotation).map(key => clone(annotation[key]));
    const first = anchors[0] || defaultAnchor();
    const second = anchors[1] || { ...clone(first), cycle: Math.min(Number(model.document.timeline.cycleCount), Number(first.cycle) + 1) };
    for (const key of ['anchor', 'start', 'end', 'from', 'to']) delete annotation[key];
    if (nextType === 'dependency') { annotation.from = first; annotation.to = second; annotation.lineType ||= 'straight'; annotation.arrowhead ||= 'end'; }
    else if (['range', 'bracket', 'highlight'].includes(nextType)) { annotation.start = first; annotation.end = second; }
    else annotation.anchor = first;
    annotation.type = nextType;
    return true;
  };
  const renderSvg = (annotation, resolved, overlay, canvasRect) => {
    if (annotation.visible === false) return;
    const p = key => resolved[key] && !resolved[key].error ? resolved[key] : null;
    const start = p('start') || p('from') || p('anchor'); const end = p('end') || p('to');
    const line = (x1, y1, x2, y2, extra = {}) => { const el = document.createElementNS('http://www.w3.org/2000/svg', 'line'); Object.assign(el.dataset, extra); el.setAttribute('x1', x1); el.setAttribute('y1', y1); el.setAttribute('x2', x2); el.setAttribute('y2', y2); el.setAttribute('stroke', annotation.color || '#1473e6'); el.setAttribute('stroke-width', '1.5'); return el; };
    const scrollHost = window.TimingChartTimingViewport?.getScrollHost?.() || document.querySelector('#cycleCanvas');
    const xy = point => point && { x: point.x - canvasRect.left + (scrollHost?.scrollLeft || 0), y: point.y - canvasRect.top + (scrollHost?.scrollTop || 0) };
    const label = (x, y, text, extra = {}) => { const el = document.createElementNS('http://www.w3.org/2000/svg', 'text'); const style = annotation.labelStyle || {}; const align = style.align || extra['text-anchor'] === 'middle' ? (style.align || 'center') : (style.align || 'left'); const anchor = align === 'right' ? 'end' : align === 'center' ? 'middle' : 'start'; const rawLines = String(text || '').split('\n'); const lines = style.wrap && style.maxWidth ? rawLines.flatMap(line => { const maxChars = Math.max(1, Math.floor(Number(style.maxWidth) / 7)); const chunks = []; for (let i = 0; i < line.length; i += maxChars) chunks.push(line.slice(i, i + maxChars)); return chunks.length ? chunks : ['']; }) : rawLines; el.setAttribute('x', x); el.setAttribute('y', y); el.setAttribute('fill', annotation.color || '#1473e6'); el.setAttribute('font-size', '11'); el.setAttribute('text-anchor', anchor); const lineHeight = Number(style.lineHeight || 1.2) * 11; lines.forEach((lineText, index) => { const span = document.createElementNS('http://www.w3.org/2000/svg', 'tspan'); span.textContent = lineText; span.setAttribute('x', x); span.setAttribute('dy', index === 0 ? 0 : lineHeight); el.appendChild(span); }); Object.entries(extra).filter(([key]) => key !== 'text-anchor').forEach(([key, value]) => el.setAttribute(key, value)); return el; };
    const markerId = `annotation-arrow-${String(annotation.id).replace(/[^a-zA-Z0-9_-]/g, '_')}`;
    const ensureArrowMarker = () => { if (overlay.querySelector(`#${markerId}`)) return; const defs = overlay.querySelector('defs') || overlay.insertBefore(document.createElementNS('http://www.w3.org/2000/svg', 'defs'), overlay.firstChild); const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker'); marker.id = markerId; marker.setAttribute('viewBox', '0 0 10 10'); marker.setAttribute('refX', '8'); marker.setAttribute('refY', '5'); marker.setAttribute('markerWidth', '6'); marker.setAttribute('markerHeight', '6'); marker.setAttribute('orient', 'auto-start-reverse'); const head = document.createElementNS('http://www.w3.org/2000/svg', 'path'); head.setAttribute('d', 'M 0 0 L 10 5 L 0 10 z'); head.setAttribute('fill', annotation.color || '#1473e6'); marker.appendChild(head); defs.appendChild(marker); };
    const selectable = (el, part = 'geometry', arrows = {}) => { el.dataset.annotationId = annotation.id; el.dataset.annotationPart = part; el.addEventListener('click', event => { event.stopPropagation(); controller.actions.selectAnnotation(annotation.id); }); if (['dependency', 'range'].includes(annotation.type) && (arrows.start || arrows.end)) { ensureArrowMarker(); if (arrows.start) el.setAttribute('marker-start', `url(#${markerId})`); if (arrows.end) el.setAttribute('marker-end', `url(#${markerId})`); } return el; };
    if (annotation.type === 'range' || annotation.type === 'dependency') {
      if (!start || !end) return;
      const a = xy(start); const b = xy(end); const lineType = annotation.lineType || 'orthogonal';
      const arrowhead = annotation.arrowhead || 'end'; const arrows = { start: arrowhead === 'start' || arrowhead === 'both', end: arrowhead === 'end' || arrowhead === 'both' };
      if (annotation.type === 'dependency' && lineType === 'orthogonal') { overlay.appendChild(selectable(line(a.x, a.y, (a.x + b.x) / 2, a.y, { segment: 'horizontal' }), 'geometry', { start: arrows.start })); overlay.appendChild(selectable(line((a.x + b.x) / 2, a.y, (a.x + b.x) / 2, b.y, { segment: 'vertical' }))); overlay.appendChild(selectable(line((a.x + b.x) / 2, b.y, b.x, b.y, { segment: 'horizontal' }), 'geometry', { end: arrows.end })); } else if (annotation.type === 'dependency' && lineType === 'curve') { const path = document.createElementNS('http://www.w3.org/2000/svg', 'path'); path.setAttribute('d', `M ${a.x} ${a.y} C ${(a.x + b.x) / 2} ${a.y}, ${(a.x + b.x) / 2} ${b.y}, ${b.x} ${b.y}`); path.setAttribute('fill', 'none'); path.setAttribute('stroke', annotation.color || '#1473e6'); path.setAttribute('stroke-width', '1.5'); overlay.appendChild(selectable(path, 'geometry', arrows)); } else overlay.appendChild(selectable(line(a.x, a.y, b.x, b.y), 'geometry', arrows));
      if (annotation.label) { const labelElement = label((a.x + b.x) / 2 + Number(annotation.labelOffset?.x || 0), (a.y + b.y) / 2 + Number(annotation.labelOffset?.y || -8), annotation.label, { 'text-anchor': 'middle' }); selectable(labelElement, 'label'); overlay.appendChild(labelElement); }
      return;
    }
    if (annotation.type === 'verticalLine') { if (!start) return; const a = xy(start); overlay.appendChild(selectable(line(a.x, 0, a.x, canvasRect.height))); return; }
    if (annotation.type === 'highlight') { if (!start || !end) return; const a = xy(start); const b = xy(end); const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect'); rect.setAttribute('x', Math.min(a.x, b.x)); rect.setAttribute('y', 0); rect.setAttribute('width', Math.abs(b.x - a.x)); rect.setAttribute('height', canvasRect.height); rect.setAttribute('fill', annotation.color || '#1473e6'); rect.setAttribute('opacity', '0.12'); overlay.appendChild(rect); if (annotation.label) { const labelElement = label((a.x + b.x) / 2 + Number(annotation.labelOffset?.x || 0), 16 + Number(annotation.labelOffset?.y || 0), annotation.label, { 'text-anchor': 'middle' }); overlay.appendChild(selectable(labelElement, 'label')); } return; }
    if (annotation.type === 'bracket') { if (!start || !end) return; const a = xy(start); const b = xy(end); const y = Math.min(a.y, b.y) - 12; overlay.appendChild(selectable(line(a.x, y, b.x, y))); overlay.appendChild(selectable(line(a.x, y, a.x, y + 7))); overlay.appendChild(selectable(line(b.x, y, b.x, y + 7))); if (annotation.label) { const labelElement = label((a.x + b.x) / 2 + Number(annotation.labelOffset?.x || 0), y + Number(annotation.labelOffset?.y || -4), annotation.label, { 'text-anchor': 'middle' }); overlay.appendChild(selectable(labelElement, 'label')); } return; }
    if (!start) return;
    const a = xy(start); const marker = document.createElementNS('http://www.w3.org/2000/svg', annotation.type === 'callout' ? 'rect' : 'circle'); marker.dataset.annotationId = annotation.id; marker.setAttribute('fill', annotation.color || '#1473e6'); marker.setAttribute('stroke', '#fff'); marker.setAttribute('stroke-width', '1');
    if (annotation.type === 'callout') { marker.setAttribute('x', a.x + 20); marker.setAttribute('y', a.y - 34); marker.setAttribute('width', '140'); marker.setAttribute('height', '24'); marker.setAttribute('fill-opacity', '0.12'); overlay.appendChild(line(a.x, a.y, a.x + 20, a.y - 22)); } else { marker.setAttribute('cx', a.x); marker.setAttribute('cy', a.y); marker.setAttribute('r', annotation.type === 'text' ? '4' : '5'); }
    marker.dataset.annotationPart = 'geometry'; marker.addEventListener('click', event => { event.stopPropagation(); controller.actions.selectAnnotation(annotation.id); }); overlay.appendChild(marker);
    if (annotation.label) { const labelElement = label((annotation.type === 'callout' ? a.x + 26 : a.x + 8) + Number(annotation.labelOffset?.x || 0), (annotation.type === 'callout' ? a.y - 18 : a.y - 8) + Number(annotation.labelOffset?.y || 0), annotation.label); selectable(labelElement, 'label'); overlay.appendChild(labelElement); }
  };
  const render = currentModel => {
    if (controller.timeAxisMetrics) controller.timeAxisMetrics.annotationFullRenders += 1;
    let overlay = document.querySelector('#cycleCanvas svg[data-production-overlay="annotations"]');
    const canvas = document.querySelector('#cycleCanvas'); if (!canvas) return;
    const overlayHost = window.TimingChartTimingViewport?.getScrollHost?.() || canvas;
    if (!overlay) {
      overlay = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      overlay.dataset.productionOverlay = 'annotations';
      overlay.setAttribute('data-production-overlay', 'annotations');
      overlay.style.cssText = 'position:absolute;left:0;top:0;overflow:visible;contain:layout;pointer-events:none;z-index:4';
      const initialRect = overlayHost.getBoundingClientRect();
      overlay.style.width = `${initialRect.width}px`;
      overlay.style.height = `${initialRect.height}px`;
      overlayHost.appendChild(overlay);
    }
    overlay.innerHTML = ''; const rect = overlayHost.getBoundingClientRect(); const errors = [];
    // Percentage height on an absolutely positioned SVG can participate in the
    // center grid's min-content calculation when annotation selection changes.
    // Pin the overlay to the measured canvas box so overlays cannot resize the
    // locked waveform/bottom split.
    overlay.style.width = `${rect.width}px`;
    overlay.style.height = `${rect.height}px`;
    for (const annotation of currentModel.document.annotations || []) { const resolved = resolve(annotation); errors.push(...resolved.errors); renderSvg(annotation, resolved.result, overlay, rect); }
    currentModel.annotationValidation = errors;
    // Center region sizing is owned by production-controller.renderMode().
    // Annotation overlays must never assume a two-row Cycle layout.
  };
  const run = (label, mutation) => controller.documentHistory.run(label, mutation);
  controller.transformAnnotations = (documentValue, start, endOrCount, mode) => {
    const next = documentValue; const insert = mode === 'insert'; const end = insert ? null : endOrCount; const count = insert ? endOrCount : end - start;
    for (const annotation of next.annotations || []) for (const key of anchorKeys(annotation)) { const anchor = annotation[key]; const mapped = insert ? controller.timeAxis.mapPointForInsert(anchor.cycle, start, count) : controller.timeAxis.mapPointForDelete(anchor.cycle, start, end); anchor.cycle = mapped.mapped; if (mapped.status === 'deleted') annotation.runtimeUnresolved = true; }
    return next;
  };
  controller.annotationResolve = anchorOf;
  controller.resolveAnnotationAnchorPointer = resolveAnnotationAnchorPointer;
  controller.resolveNearestAnnotationAnchor = resolveNearestAnnotationAnchor;
  controller.actions.selectAnnotation = id => { if (!(model.document.annotations || []).some(annotation => annotation.id === id)) return false; model.selection = { kind: 'annotation', id }; if (model.view.followSelection && !model.view.pinned) model.view.tab = 'annotation'; controller.render(); return true; };
  controller.actions.addAnnotation = (type = 'marker', seed = {}) => run('Add annotation', () => { const annotation = withRange({ ...defaultAnnotation(type), ...clone(seed), id: seed.id || makeId(), type }); model.document.annotations.push(annotation); model.selection = { kind: 'annotation', id: annotation.id }; model.view.tab = 'annotation'; });
  controller.actions.addDependency = (from, to, options = {}) => run('Add dependency arrow', () => { const annotation = { id: options.id || makeId(), type: 'dependency', from: clone(from), to: clone(to), label: options.label || '', labelOffset: clone(options.labelOffset || { x: 0, y: -8 }), lineType: options.lineType || 'straight', arrowhead: options.arrowhead || 'end', color: options.color || '#1473e6', position: 'canvas', comment: options.comment || '', visible: true }; model.document.annotations.push(annotation); model.selection = { kind: 'annotation', id: annotation.id }; model.view.tab = 'annotation'; });
  controller.actions.duplicateAnnotation = id => run('Duplicate annotation', () => { const source = model.document.annotations.find(annotation => annotation.id === id); if (!source) return false; const copy = withRange(clone(source)); copy.id = makeId(); model.document.annotations.push(copy); model.selection = { kind: 'annotation', id: copy.id }; return true; });
  controller.actions.deleteAnnotation = id => run('Delete annotation', () => { const index = model.document.annotations.findIndex(annotation => annotation.id === id); if (index < 0) return false; model.document.annotations.splice(index, 1); const next = model.document.annotations[index] || model.document.annotations[index - 1]; model.selection = next ? { kind: 'annotation', id: next.id } : { kind: 'signal', id: model.document.timeline.referenceClock }; return true; });
  controller.actions.updateAnnotation = (id, field, value) => run(`Update annotation ${field}`, () => { const annotation = model.document.annotations.find(item => item.id === id); if (!annotation) return false; if (field === 'lineType' && annotation.type !== 'dependency') return false; if (field === 'lineType' && !['straight', 'orthogonal', 'curve'].includes(String(value))) return false; if (field === 'arrowhead' && !['dependency', 'range'].includes(annotation.type)) return false; if (field === 'arrowhead' && !['none', 'start', 'end', 'both'].includes(String(value))) return false; if (field === 'type') return migrateAnnotationType(annotation, String(value)); if (field.startsWith('offset.')) { const anchor = annotation.anchor || annotation.start || annotation.from; if (!anchor) return false; anchor.offset[field.endsWith('x') ? 'x' : 'y'] = Number(value); } else if (field.startsWith('labelOffset.')) { annotation.labelOffset ??= { x: 0, y: 0 }; annotation.labelOffset[field.endsWith('x') ? 'x' : 'y'] = Number(value); } else if (field.startsWith('labelStyle.')) { annotation.labelStyle ??= { wrap: false, maxWidth: 240, lineHeight: 1.2, align: 'center' }; const styleField = field.slice('labelStyle.'.length); annotation.labelStyle[styleField] = styleField === 'wrap' ? Boolean(value) : styleField === 'align' ? String(value) : Number(value); } else if (field === 'visible') annotation.visible = Boolean(value); else annotation[field] = String(value); return true; });
  controller.actions.updateAnnotationAnchor = (id, key, field, value) => run(`Update annotation ${field}`, () => { const annotation = model.document.annotations.find(item => item.id === id); const anchor = annotation?.[key]; if (!anchor) return false; if (field === 'cycle') anchor.cycle = Number(value); else if (field === 'offset.x' || field === 'offset.y') anchor.offset[field.endsWith('x') ? 'x' : 'y'] = Number(value); else anchor[field] = String(value); return true; });
  controller.actions.setAnnotationAnchor = (id, key, anchor) => run(`Set annotation ${key} anchor`, () => { const annotation = model.document.annotations.find(item => item.id === id); if (!annotation || !annotation[key] || !anchor || !points.has(anchor.point)) return false; annotation[key] = { signal: anchor.signal, cycle: Number(anchor.cycle), point: anchor.point, offset: { x: Number(anchor.offset?.x || 0), y: Number(anchor.offset?.y || 0) } }; return true; });
  controller.actions.snapAnnotationAnchor = (id, key) => { if (model.view.guides?.snap === false) return false; const annotation = model.document.annotations.find(item => item.id === id); const anchor = annotation?.[key]; const snapped = anchor ? resolveNearestAnnotationAnchor({ anchor, annotationId: id, anchorKey: key }) : null; return snapped ? controller.actions.setAnnotationAnchor(id, key, snapped) : false; };
  controller.actions.snapAnnotation = id => { if (model.view.guides?.snap === false) return false; return run('Snap annotation to WaveDrom geometry', () => { const annotation = model.document.annotations.find(item => item.id === id); if (!annotation) return false; let changed = false; for (const key of anchorKeys(annotation)) { const snapped = resolveNearestAnnotationAnchor({ anchor: annotation[key], annotationId: id, anchorKey: key }); if (!snapped) continue; const before = JSON.stringify(annotation[key]); annotation[key] = { signal: snapped.signal, cycle: snapped.cycle, point: snapped.point, offset: { x: 0, y: 0 } }; changed ||= before !== JSON.stringify(annotation[key]); } return changed; }); };
  controller.actions.resetAnnotationOffsets = id => run('Reset annotation offsets', () => { const annotation = model.document.annotations.find(item => item.id === id); if (!annotation) return false; for (const key of anchorKeys(annotation)) if (annotation[key]) annotation[key].offset = { x: 0, y: 0 }; annotation.labelOffset = { x: 0, y: 0 }; return true; });
  controller.actions.beginAnnotationAnchorSelection = key => {
    const annotation = model.document.annotations.find(item => item.id === model.selection?.id);
    if (!annotation) return false;
    const actualKey = key === 'start' && !annotation.start && annotation.anchor ? 'anchor' : key === 'end' && !annotation.end && annotation.anchor ? null : key === 'start' && annotation.type === 'dependency' ? 'from' : key === 'end' && annotation.type === 'dependency' ? 'to' : key;
    if (!actualKey || !annotation[actualKey]) return false;
    model.view.annotationAnchorSelection = { annotationId: annotation.id, anchorKey: actualKey };
    document.querySelector('#cycleCanvas')?.setAttribute('data-annotation-anchor-pick', actualKey);
    return true;
  };
  controller.actions.cancelAnnotationAnchorSelection = () => { delete model.view.annotationAnchorSelection; document.querySelector('#cycleCanvas')?.removeAttribute('data-annotation-anchor-pick'); };
  document.addEventListener('click', event => {
    const pick = model.view.annotationAnchorSelection;
    const hit = event.target.closest?.('#cycleCanvas .trace[data-renderer="wavedrom"]') || document.elementFromPoint(event.clientX, event.clientY)?.closest?.('#cycleCanvas .trace[data-renderer="wavedrom"]');
    if (!pick || !hit) return;
    const candidate = resolveAnnotationAnchorPointer({ x: event.clientX, y: event.clientY, annotationId: pick.annotationId, anchorKey: pick.anchorKey });
    if (!candidate) return;
    event.preventDefault(); event.stopPropagation();
    controller.actions.cancelAnnotationAnchorSelection();
    controller.actions.setAnnotationAnchor(pick.annotationId, pick.anchorKey, candidate);
  }, { capture: true });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && model.view.annotationAnchorSelection) { event.preventDefault(); controller.actions.cancelAnnotationAnchorSelection(); } });
  let drag = null;
  document.addEventListener('pointerdown', event => { const id = event.target?.dataset?.annotationId; if (!id) return; const annotation = model.document.annotations.find(item => item.id === id); if (!annotation) return; const part = event.target.dataset.annotationPart || 'geometry'; if (part === 'label') drag = { id, part, x: event.clientX, y: event.clientY, labelOffset: clone(annotation.labelOffset || { x: 0, y: 0 }) }; else if (['marker', 'text', 'callout'].includes(annotation.type)) drag = { id, part, x: event.clientX, y: event.clientY, anchor: clone(annotation.anchor) }; else return; event.target.setPointerCapture?.(event.pointerId); });
  document.addEventListener('pointerup', event => { if (!drag) return; const current = drag; drag = null; const dx = event.clientX - current.x; const dy = event.clientY - current.y; if (dx || dy) run(current.part === 'label' ? 'Move annotation label' : 'Move annotation', () => { const annotation = model.document.annotations.find(item => item.id === current.id); if (!annotation) return false; if (current.part === 'label') annotation.labelOffset = { x: current.labelOffset.x + dx, y: current.labelOffset.y + dy }; else annotation.anchor = offsetAnchor(current.anchor, dx, dy); return true; }); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') { drag = null; return; } if (event.target.matches?.('input,textarea,select,[contenteditable="true"]')) return; const selected = model.selection?.kind === 'annotation' ? model.document.annotations.find(annotation => annotation.id === model.selection.id) : null; if (!selected || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return; const step = event.shiftKey ? 10 : 1; const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0; const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0; controller.documentHistory.run('Move annotation label', () => { selected.labelOffset = { x: Number(selected.labelOffset?.x || 0) + dx, y: Number(selected.labelOffset?.y || 0) + dy }; }); event.preventDefault(); });
  window.TimingChartProductionAnnotations = { render, resolve: anchorOf, types: [...types] };
  render(model);
})();
