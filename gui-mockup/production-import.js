(() => {
  'use strict';

  const controller = window.TimingChartProductionController;
  if (!controller?.model) throw new Error('Production controller must load before production import adapter');
  const model = controller.model;
  const clone = value => value === undefined ? undefined : structuredClone(value);
  const numberOr = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const firstDefined = (...values) => values.find(value => value !== undefined && value !== null);
  const canonicalPoints = new Set(['cycle-boundary', 'rising', 'falling', 'transition-start', 'transition-center', 'transition-end']);

  const normalizeExternalDocument = parsed => {
    const warnings = [];
    const warn = (path, reason) => warnings.push({ code: 'unsupported-import-field', path, reason, severity: 'warning' });
    if (Number(parsed?.formatVersion) > 2) {
      const error = new Error(`Unsupported future formatVersion ${parsed.formatVersion}`);
      error.code = 'future-format-version';
      error.parsed = clone(parsed);
      throw error;
    }
    const sourceIsCanonical = Number(parsed?.formatVersion) === 1 || Number(parsed?.formatVersion) === 2;
    const cycleView = parsed?.cycleView || {};
    const transactionView = parsed?.transactionView || {};
    const sourceSignals = Array.isArray(parsed?.signals) ? parsed.signals : (Array.isArray(cycleView.signals) ? cycleView.signals : []);
    const timebase = parsed?.timeline || parsed?.document?.timebase || {};
    const cycleCount = Math.max(1, numberOr(firstDefined(timebase.cycleCount, parsed?.document?.cycleCount), 10));
    const normalizeSignal = (source, index) => {
      const signal = clone(source) || {};
      signal.id ||= `signal_${index + 1}`;
      signal.name ||= signal.id;
      signal.role ||= 'internal';
      signal.type ||= 'binary';
      if (signal.type === 'clock') {
        signal.generator = { start: numberOr(signal.generator?.start, 0), period: Math.max(0.0001, numberOr(signal.generator?.period, 1)), duty: numberOr(signal.generator?.duty, 0.5), phase: numberOr(signal.generator?.phase, 0), initial: numberOr(signal.generator?.initial, 0), polarity: signal.generator?.polarity === 'negative' ? 'negative' : 'positive' };
        signal.edgeCounter ||= { show: false, mode: 'rising', startNumber: 1, countFrom: 'signal-start', labelEvery: 1, position: 'above', offset: { x: 0, y: -6 } };
      } else if (signal.type !== 'commentRow' && !Array.isArray(signal.values)) signal.values = [{ start: 0, value: signal.type === 'state' ? 'IDLE' : signal.type === 'bus' ? '00' : 0 }];
      return signal.type === 'commentRow' ? signal : (controller.ensureCanonicalSource?.(signal) || signal);
    };
    const signals = sourceSignals.map(normalizeSignal);
    const signalIds = new Set(signals.map(signal => signal.id));
    const referenceClock = firstDefined(timebase.referenceClock, signals.find(signal => signal.type === 'clock')?.id, signals[0]?.id, 'clk');
    const normalizeGroup = (group, index) => {
      const source = clone(group) || {};
      const sourceRows = source.rows || source.signals || [];
      const rows = [...sourceRows].filter(row => signalIds.has(row));
      for (const row of sourceRows) if (!signalIds.has(row)) warn(`$.signalGroups[${index}].${source.rows ? 'rows' : 'signals'}`, `Unknown row '${row}' was not imported`);
      const result = { id: source.id || `group_${index + 1}`, name: source.name || source.id || `Group ${index + 1}`, rows };
      for (const key of ['style', 'spacers', 'collapsed']) if (source[key] !== undefined) result[key] = clone(source[key]);
      for (const key of ['spacingBefore', 'spacingAfter']) if (source[key] !== undefined) result[key] = numberOr(source[key], 0);
      return result;
    };
    const groups = (Array.isArray(parsed?.signalGroups) ? parsed.signalGroups : []).map(normalizeGroup);
    const layout = { ...(clone(parsed?.layout) || {}) };
    layout.roleColumnWidth = numberOr(layout.roleColumnWidth, 32);
    layout.signalNameWidth = numberOr(layout.signalNameWidth, 168);
    layout.signalNameAlign = ['left', 'center', 'right'].includes(layout.signalNameAlign) ? layout.signalNameAlign : 'left';
    layout.busWidthAlign = ['left', 'center', 'right'].includes(layout.busWidthAlign) ? layout.busWidthAlign : 'left';
    layout.rowHeight = numberOr(layout.rowHeight, 28);
    layout.signalSpacing = numberOr(layout.signalSpacing, 6);
    layout.pathDisplayMode = Object.values(window.TimingChartPathDisplayModes || {}).includes(layout.pathDisplayMode) ? layout.pathDisplayMode : 'signalOnly';
    layout.instancePathAlign = ['left', 'center', 'right'].includes(layout.instancePathAlign) ? layout.instancePathAlign : 'left';
    layout.instancePathWidth = numberOr(layout.instancePathWidth, 180);
    layout.busWidthMode = layout.busWidthMode === 'alignedColumn' ? 'alignedColumn' : 'inline';
    layout.overflow ||= 'ellipsis';
    if (Array.isArray(layout.spacers)) {
      for (const [index, spacer] of layout.spacers.entries()) {
        const group = groups.find(candidate => candidate.rows.includes(spacer.afterSignal));
        if (group) (group.spacers ||= []).push(clone(spacer));
        else warn(`$.layout.spacers[${index}]`, 'Spacer has no matching group and cannot be represented in group layout');
      }
      delete layout.spacers;
    }
    const legacyPoint = (value, fallback = 'cycle-boundary') => {
      const map = { 'value-start': 'transition-start', 'value-center': 'transition-center', 'value-end': 'transition-end' };
      const point = map[value] || value;
      return canonicalPoints.has(point) ? point : fallback;
    };
    const normalizeAnchor = (anchor, path, fallbackSignal) => {
      const source = typeof anchor === 'object' && anchor ? anchor : {};
      const signal = firstDefined(source.signal, fallbackSignal, referenceClock);
      if (!source.signal) warn(path, `Anchor signal was inferred as '${signal}'`);
      const pointSource = firstDefined(source.point, source.anchor, source.edge);
      const point = legacyPoint(pointSource);
      if (pointSource && point !== pointSource && pointSource !== 'rising' && pointSource !== 'falling') warn(`${path}.point`, `Legacy point '${pointSource}' was mapped to '${point}'`);
      return { signal, cycle: Math.max(0, Math.round(numberOr(source.cycle, 0))), point, offset: { x: numberOr(source.offset?.x, 0), y: numberOr(source.offset?.y, 0) } };
    };
    const sourceAnnotations = Array.isArray(parsed?.annotations) ? parsed.annotations : (Array.isArray(cycleView.annotations) ? cycleView.annotations : []);
    const annotations = sourceAnnotations.map((source, index) => {
      const annotation = clone(source) || {};
      const type = ({ dependencyArrow: 'dependency', vline: 'verticalLine', 'vertical-line': 'verticalLine' })[annotation.type] || annotation.type || 'text';
      const result = { id: annotation.id || `annotation_${index + 1}`, type, label: firstDefined(annotation.label, annotation.text, ''), color: annotation.color || '#1473e6', position: annotation.position || 'canvas', comment: annotation.comment || '', visible: annotation.visible !== false };
      for (const key of ['anchor', 'start', 'end', 'from', 'to']) if (annotation[key] !== undefined) {
        const scopedSignal = key === 'start' ? annotation.scope?.fromSignal : key === 'end' ? annotation.scope?.toSignal : undefined;
        result[key] = normalizeAnchor(annotation[key], `$.cycleView.annotations[${index}].${key}`, scopedSignal || referenceClock);
      }
      if (annotation.offset && (result.start || result.anchor)) {
        const offset = { x: numberOr(annotation.offset.x, 0), y: numberOr(annotation.offset.y, 0) };
        if (result.anchor && result.anchor.offset.x === 0 && result.anchor.offset.y === 0) result.anchor.offset = offset;
        if (result.start && result.start.offset.x === 0 && result.start.offset.y === 0) result.start.offset = offset;
        if (result.end && result.end.offset.x === 0 && result.end.offset.y === 0) result.end.offset = offset;
      }
      if (annotation.labelOffset) result.labelOffset = { x: numberOr(annotation.labelOffset.x, 0), y: numberOr(annotation.labelOffset.y, 0) };
      if (annotation.labelStyle) result.labelStyle = clone(annotation.labelStyle);
      if (type === 'dependency') { result.lineType = annotation.lineType || annotation.line || 'orthogonal'; result.arrowhead = annotation.arrowhead || annotation.arrow || 'end'; }
      if (annotation.scope !== undefined) warn(`$.cycleView.annotations[${index}].scope`, 'Annotation scope is not part of the canonical annotation schema');
      return result;
    });
    const sourceTransactions = Array.isArray(parsed?.transactions) ? parsed.transactions : (Array.isArray(transactionView.transactions) ? transactionView.transactions : []);
    const transactions = sourceTransactions.map((source, index) => {
      const result = clone(source) || {};
      result.id ||= `transaction_${index + 1}`;
      if (result.from !== undefined && result.source === undefined) result.source = result.from;
      if (result.to !== undefined && result.destination === undefined) result.destination = result.to;
      return result;
    });
    if (Array.isArray(transactionView.lanes)) warn('$.transactionView.lanes', 'Transaction lane definitions are not a canonical top-level field; transaction source/destination values were preserved');
    const sourceDocument = parsed?.document || {};
    const documentValue = { id: sourceDocument.id || 'sample.tcd', title: sourceDocument.title || 'Timing Chart Sample', header: clone(sourceDocument.header) || { subtitle: sourceDocument.description || '', description: sourceDocument.description || '', notes: '', preconditions: [], constraints: [], exceptions: [] }, footer: clone(sourceDocument.footer) || { figureNumber: '', revision: '', text: '' } };
    for (const key of ['samplePurpose', 'verificationCoverage']) if (parsed?.[key] !== undefined) warn(`$.${key}`, 'Metadata is not part of the canonical document schema');
    const legendSource = clone(parsed?.legend) || {};
    const legend = { ...legendSource, orientation: legendSource.orientation || 'horizontal', usedRolesOnly: legendSource.usedRolesOnly ?? (legendSource.items === undefined ? true : legendSource.items === 'usedRolesOnly'), position: clone(legendSource.position || legendSource.offset || { x: 0, y: 0 }) };
    if (legendSource.offset && !legendSource.position) warn('$.legend.offset', 'Legacy legend offset was mapped to canonical position');
    const sourceTimeline = clone(parsed?.timeline) || {};
    const labelAnchors = (Array.isArray(sourceTimeline.labelAnchors) ? sourceTimeline.labelAnchors : []).map((anchor, index) => ({
      id: anchor?.id || `label_anchor_${index + 1}`,
      source: numberOr(anchor?.source, 0),
      display: numberOr(anchor?.display, 0),
      ...(anchor?.ownerTimeGroupId ? { ownerTimeGroupId: anchor.ownerTimeGroupId } : {})
    }));
    const bookmarks = (Array.isArray(parsed?.bookmarks) ? parsed.bookmarks : []).map((bookmark, index) => ({
      id: bookmark?.id || `bookmark_${index + 1}`,
      name: String(bookmark?.name || `Bookmark ${index + 1}`),
      start: numberOr(bookmark?.start, 0),
      ...(bookmark?.comment ? { comment: String(bookmark.comment) } : {})
    }));
    const timeGroups = (Array.isArray(parsed?.timeGroups) ? parsed.timeGroups : []).map((group, index) => ({
      id: group?.id || `time_group_${index + 1}`,
      name: String(group?.name || `Time Group ${index + 1}`),
      ...(group?.category ? { category: String(group.category) } : {}),
      start: numberOr(group?.start, 0),
      end: numberOr(group?.end, cycleCount),
      ...(group?.comment ? { comment: String(group.comment) } : {}),
      ...(group?.presentation ? { presentation: clone(group.presentation) } : {})
    }));
    const result = { formatVersion: 2, document: documentValue, timeline: { start: numberOr(timebase.start, 0), end: numberOr(firstDefined(timebase.end, cycleCount), cycleCount), timeBase: timebase.timeBase || timebase.unit || 'cycle', cycleCount, referenceClock, edge: timebase.edge || 'rising', labelAnchors }, signalGroups: groups.length ? groups : [{ id: 'group_default', name: 'Signals', rows: signals.map(signal => signal.id) }], signals, annotations, legend, layout, transactions, constraints: clone(parsed?.constraints || sourceDocument.constraints || []), bookmarks, timeGroups, checkSettings: clone(parsed?.checkSettings) || {} };
    if (sourceIsCanonical && Number(parsed.formatVersion) === 1) warnings.push({ code: 'migrated-v1-to-v2', path: '$.formatVersion', reason: 'Canonical v1 document was normalized to v2 defaults', severity: 'info' });
    model.importWarnings = warnings;
    return result;
  };

  controller.normalizeExternalDocument = normalizeExternalDocument;
  controller.getImportWarnings = () => clone(model.importWarnings || []);
  const originalGetProblems = controller.getProblems;
  controller.getProblems = documentValue => {
    const issues = originalGetProblems(documentValue);
    if (documentValue === model.document) for (const warning of model.importWarnings || []) issues.push({ ...warning, displayType: 'Import warning', id: warning.path, path: warning.path, message: warning.reason });
    return issues;
  };
})();
