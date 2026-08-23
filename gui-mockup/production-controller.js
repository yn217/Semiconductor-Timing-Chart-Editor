(() => {
  'use strict';

  const PATH_DISPLAY_MODES = Object.freeze({ SIGNAL_ONLY: 'signalOnly', RELATIVE: 'relative', FULL: 'full', SPLIT_COLUMNS: 'splitColumns' });
  window.TimingChartPathDisplayModes = PATH_DISPLAY_MODES;

  const signals = [
    { id: 'clk', name: 'clk', type: 'clock', role: 'input', generator: { start: 0, period: 1, duty: 0.5, phase: 0, initial: 0, polarity: 'positive' }, edgeCounter: { show: false, mode: 'rising', startNumber: 1, countFrom: 'signal-start', labelEvery: 1, position: 'above', offset: { x: 0, y: -6 } } },
    { id: 'req_valid', name: 'req_valid', type: 'binary', role: 'input', values: [{ start: 0, value: 0, comment: '初期値' }, { start: 3, value: 1, comment: 'リクエスト有効' }, { start: 7, value: 0, comment: 'リクエスト無効（終了）' }] },
    { id: 'req_addr[7:0]', name: 'req_addr[7:0]', type: 'bus', role: 'input', width: 8, displayFormat: 'hex', values: [{ start: 0, value: '00', comment: '初期値' }, { start: 2, value: '12', comment: 'アドレス1' }, { start: 4, value: '34', comment: 'アドレス2' }, { start: 7, value: '9A', comment: '最終値' }] },
    { id: 'comment_01', type: 'commentRow', title: 'Address phase', body: 'アドレス位相フェーズ（req_valid = 1 の期間）', groupId: 'group_input' },
    { id: 'busy', name: 'busy', type: 'binary', role: 'internal', values: [{ start: 0, value: 0 }, { start: 2, value: 1 }, { start: 8, value: 0 }] },
    { id: 'state[1:0]', name: 'state[1:0]', type: 'state', role: 'internal', values: [{ start: 0, value: 'IDLE', comment: '初期状態' }, { start: 2, value: 'REQ', comment: 'リクエスト受付' }, { start: 4, value: 'WAIT', comment: '応答待ち' }, { start: 6, value: 'EXEC', comment: '実行中' }, { start: 8, value: 'DONE', comment: '完了' }, { start: 9, value: 'IDLE', comment: '待機へ復帰' }] },
    { id: 'comment_02', type: 'commentRow', title: 'Processing note', body: '処理中は新しいリクエストを受け付けない', groupId: 'group_internal' },
    { id: 'ready', name: 'ready', type: 'binary', role: 'output', values: [{ start: 0, value: 0 }, { start: 8, value: 1 }, { start: 9, value: 0 }] },
    { id: 'rdata[15:0]', name: 'rdata[15:0]', type: 'bus', role: 'output', width: 16, displayFormat: 'hex', values: [{ start: 0, value: 'XXXX' }, { start: 3, value: '0000' }, { start: 6, value: '5678' }, { start: 8, value: 'ABCD' }] },
    { id: 'comment_03', type: 'commentRow', title: 'Read latency', body: 'リクエスト受付からレスポンス出力まで 6 cycle', groupId: 'group_output' }
  ];
  const canonicalDocument = {
    formatVersion: 2,
    document: { id: 'example.tcd', title: 'Timing Chart', header: { subtitle: '', description: '', notes: '', preconditions: [], constraints: [], exceptions: [] }, footer: { figureNumber: '', revision: '', text: '' } },
    timeline: { start: 0, end: 10, timeBase: 'cycle', cycleCount: 10, referenceClock: 'clk', edge: 'rising', labelAnchors: [] },
    signalGroups: [
      { id: 'group_input', name: '入力 (Input)', rows: ['clk', 'req_valid', 'req_addr[7:0]', 'comment_01'] },
      { id: 'group_internal', name: '内部制御 (Internal Control)', rows: ['busy', 'state[1:0]', 'comment_02'] },
      { id: 'group_output', name: '出力 (Output)', rows: ['ready', 'rdata[15:0]', 'comment_03'] }
    ],
    signals,
    annotations: [
      { id: 'ann_default_range', type: 'range', start: { signal: 'req_valid', cycle: 3, point: 'rising', offset: { x: 0, y: -24 } }, end: { signal: 'ready', cycle: 8, point: 'rising', offset: { x: 0, y: -24 } }, label: 'リクエスト受付からレスポンスまで 6 cycle', color: '#1473e6', position: 'top', comment: 'リード全体の期間', visible: false },
      { id: 'ann_default_marker', type: 'marker', anchor: { signal: 'clk', cycle: 4, point: 'rising', offset: { x: 0, y: -40 } }, label: 'REQ assert', color: '#1473e6', position: 'canvas', comment: 'リクエストアサート点', visible: false },
      { id: 'ann_default_callout', type: 'callout', anchor: { signal: 'req_valid', cycle: 3, point: 'rising', offset: { x: 120, y: -10 } }, label: 'req_valid がHighの期間がリクエスト有効期間です', color: '#1473e6', position: 'canvas', comment: '動作説明', visible: false },
      { id: 'ann_default_dependency', type: 'dependency', from: { signal: 'state[1:0]', cycle: 4, point: 'transition-center', offset: { x: 0, y: 0 } }, to: { signal: 'rdata[15:0]', cycle: 6, point: 'transition-center', offset: { x: 0, y: 0 } }, label: '', color: '#1473e6', position: 'canvas', comment: 'REQ からデータ出力まで', lineType: 'straight', arrowhead: 'end', visible: false },
      { id: 'ann_default_highlight', type: 'highlight', start: { signal: 'req_valid', cycle: 4, point: 'cycle-boundary', offset: { x: 0, y: 0 } }, end: { signal: 'ready', cycle: 10, point: 'cycle-boundary', offset: { x: 0, y: 0 } }, label: '', color: '#1473e6', position: 'background', comment: '処理期間のハイライト', visible: false }
    ],
    legend: { orientation: 'horizontal', usedRolesOnly: true, position: { x: 0, y: 0 } },
    layout: { roleColumnWidth: 32, signalNameWidth: 168, signalNameAlign: 'left', busWidthAlign: 'left', rowHeight: 28, signalSpacing: 6, overflow: 'ellipsis', pathDisplayMode: 'signalOnly', instancePathAlign: 'left', instancePathWidth: 180, busWidthMode: 'inline', scope: [] },
    transactions: [],
    constraints: [],
    bookmarks: [],
    timeGroups: [],
    checkSettings: {}
  };
  const parseStructuredName = name => {
    const match = String(name || '').match(/^(.*)\[(\d+)(?::(\d+))?\]$/);
    if (!match) return { signalName: String(name || ''), msb: undefined, lsb: undefined };
    const msb = Number(match[2]); const lsb = Number(match[3] ?? match[2]);
    return { signalName: match[1], msb: Math.max(msb, lsb), lsb: Math.min(msb, lsb) };
  };
  const ensureCanonicalSource = signal => {
    if (signal.type === 'commentRow') return signal;
    const parsed = parseStructuredName(signal.name || signal.id);
    signal.source = {
      instancePath: Array.isArray(signal.source?.instancePath) ? [...signal.source.instancePath] : [],
      signalName: signal.source?.signalName || parsed.signalName,
      ...(signal.source?.msb !== undefined || parsed.msb !== undefined ? { msb: Number(signal.source?.msb ?? parsed.msb) } : {}),
      ...(signal.source?.lsb !== undefined || parsed.lsb !== undefined ? { lsb: Number(signal.source?.lsb ?? parsed.lsb) } : {})
    };
    signal.display = { ...(signal.display || {}), name: signal.display?.name || signal.name || parsed.signalName };
    if (signal.width === undefined && signal.source.msb !== undefined) signal.width = Math.abs(signal.source.msb - signal.source.lsb) + 1;
    return signal;
  };
  const parseSignalLiteral = (rawValue, signal = {}) => {
    const raw = String(rawValue ?? '').trim();
    const format = String(signal.displayFormat || 'hex').toLowerCase();
    const width = Number(signal.width);
    const invalid = (error, extra = {}) => ({ valid: false, kind: 'invalid', numericValue: null, requiredBits: null, containsUnknown: false, normalizedText: raw, error, ...extra });
    if (!raw) return invalid('値が空です');
    let digits = raw;
    let base = format === 'binary' ? 2 : 16;
    if (/^0x/i.test(digits)) { base = 16; digits = digits.slice(2); }
    else if (/^0b/i.test(digits)) { base = 2; digits = digits.slice(2); }
    if (!digits) return invalid('基数 prefix の後に値が必要です');
    if (/(^_|_$|__)/.test(digits)) return invalid('桁区切りの位置が不正です');
    digits = digits.replaceAll('_', '');
    const digitPattern = base === 2 ? /^[01xz]+$/i : /^[0-9a-fxz]+$/i;
    if (digitPattern.test(digits)) {
      const containsUnknown = /[xz]/i.test(digits);
      const bitsPerDigit = base === 2 ? 1 : 4;
      let requiredBits = digits.length * bitsPerDigit;
      let numericValue = null;
      if (!containsUnknown) {
        numericValue = BigInt(base === 2 ? `0b${digits}` : `0x${digits}`);
        requiredBits = numericValue === 0n ? 0 : numericValue.toString(2).length;
      }
      const overflow = Number.isFinite(width) && width > 0 && requiredBits > width;
      return { valid: !overflow, kind: base === 2 ? 'binary' : 'hex', numericValue: numericValue === null ? null : numericValue.toString(), requiredBits, containsUnknown, normalizedText: digits.toUpperCase(), base, width: Number.isFinite(width) ? width : null, overflow, error: overflow ? `${requiredBits}ビット必要ですが幅は${width}ビットです` : null };
    }
    if (/^[A-Za-z_][A-Za-z0-9_$]*$/.test(digits) && /[g-wy]/i.test(digits)) return { valid: true, kind: 'symbolic', numericValue: null, requiredBits: null, containsUnknown: false, normalizedText: digits, base: null, width: Number.isFinite(width) ? width : null, overflow: false, error: null };
    return invalid('許可されていないBus literalです');
  };
  window.TimingChartLiteralParser = parseSignalLiteral;
  canonicalDocument.signals = signals.map(signal => ensureCanonicalSource(signal));
  const model = { document: canonicalDocument, selection: { kind: 'signal', id: 'req_valid' }, editor: { rowIndex: 2 }, validation: [], compatibility: null, validationCache: { documentRef: null, documentRevision: null, settingsKey: null, refreshRevision: 0, issues: [] }, validationMetrics: { validationRuns: 0, validationCacheHits: 0, validationCacheMisses: 0 }, view: { mode: 'cycle', tab: 'signal', followSelection: true, pinned: false, zoom: 1, hiddenSignals: [], scope: [], leftPanelMode: 'group' } };
  const controller = { model, getState: () => structuredClone(model), actions: {}, renderHooks: { after: new Map() }, renderMetrics: {
    appFullRenders: 0, rowMoves: 0, cycleRowCreates: 0, cycleRowRemoves: 0, cycleRowMoves: 0,
    wavePayloadBuilds: 0, waveCacheLookups: 0, waveDromRenders: 0, geometryBuilds: 0,
    geometryScreenRefreshes: 0, screenMatrixReads: 0, boundingRectReads: 0, geometryPointsTransformed: 0,
    rulerRebuilds: 0, gridRebuilds: 0, gridBoundaryResolutions: 0,
    annotationFullRenders: 0, annotationNodeCreates: 0, annotationNodeRemoves: 0,
    inspectorInnerHtmlRebuilds: 0, signalStyleFullScans: 0, layoutRowLookups: 0, minimapRowRectReads: 0,
    transactionRenders: 0, bottomRenders: 0, inspectorRenders: 0,
    minimapOverviewRebuilds: 0, minimapViewportUpdates: 0
  } };
  const profileMark = name => { if (!controller.profileEnabled || !window.performance?.mark) return; performance.mark(`tc:${name}`); };
  controller.enableProfiling = enabled => { controller.profileEnabled = Boolean(enabled); if (controller.profileEnabled) performance.clearMarks?.('tc:'); return controller.profileEnabled; };
  controller.profileMark = profileMark;
  controller.parseSignalLiteral = parseSignalLiteral;
  controller.registerRenderHook = (name, callback) => { if (!name || typeof callback !== 'function') return false; if (controller.renderHooks.after.has(name)) throw new Error(`Duplicate render hook owner: ${name}`); controller.renderHooks.after.set(name, callback); return true; };
  controller.removeRenderHook = name => controller.renderHooks.after.delete(name);
  const rebuildObjectIndex = () => {
    const signalsById = new Map();
    const commentsById = new Map();
    for (const signal of model.document.signals || []) {
      signalsById.set(signal.id, signal);
      if (signal.type === 'commentRow') commentsById.set(signal.id, signal);
    }
    model.index = { signalsById, commentsById, documentRef: model.document };
    return model.index;
  };
  const objectIndex = () => model.index?.documentRef === model.document ? model.index : rebuildObjectIndex();
  const getSignals = () => (model.document.signals || []).filter(signal => signal.type !== 'commentRow');
  const getSignal = id => { const signal = objectIndex().signalsById.get(id); return signal?.type === 'commentRow' ? undefined : signal; };
  const getTimeline = () => model.document.timeline;
  const getComments = () => [...objectIndex().commentsById.values()];
  const getGroupRows = groupId => model.document.signalGroups.find(group => group.id === groupId)?.rows || [];
  const getReferenceClock = () => getSignal(getTimeline().referenceClock);
  const getSource = signal => signal?.source || { instancePath: [], signalName: signal?.name || signal?.id || '' };
  const getBusRange = signal => {
    const source = getSource(signal);
    if (source.msb === undefined || source.lsb === undefined) return signal?.width ? `[${Number(signal.width) - 1}:0]` : '';
    return `[${source.msb}:${source.lsb}]`;
  };
  const fullPath = signal => {
    if (!signal || signal.type === 'commentRow') return signal?.title || signal?.id || '';
    const source = getSource(signal); return [...(source.instancePath || []), source.signalName].filter(Boolean).join('.') + getBusRange(signal);
  };
  const shortenMiddle = (value, max = 32) => {
    const text = String(value || ''); if (text.length <= max) return text;
    const parts = text.split('.'); if (parts.length < 3) return `${text.slice(0, Math.max(1, max - 1))}…`;
    const tail = parts.slice(-2).join('.'); const head = parts[0]; const budget = Math.max(1, max - tail.length - 2);
    return `${head.slice(0, budget)}.…${tail}`;
  };
  const relativePath = (signal, scope = model.view.scope) => {
    const source = getSource(signal); const path = source.instancePath || []; const current = Array.isArray(scope) ? scope : String(scope || '').split('.').filter(Boolean);
    let index = 0; while (index < current.length && index < path.length && current[index] === path[index]) index++;
    return [...path.slice(index), source.signalName].filter(Boolean).join('.') + getBusRange(signal);
  };
  const signalLabel = (signal, mode = model.document.layout.pathDisplayMode || 'signalOnly') => {
    if (!signal || signal.type === 'commentRow') return signal?.title || signal?.id || '';
    if (mode === 'full') return shortenMiddle(fullPath(signal));
    if (mode === 'relative') return shortenMiddle(relativePath(signal));
    if (mode === 'splitColumns') return signal.display?.name || getSource(signal).signalName;
    return signal.display?.name || getSource(signal).signalName;
  };
  const annotationTypes = new Set(['range', 'marker', 'text', 'callout', 'dependency', 'verticalLine', 'bracket', 'highlight']);
  const anchorPoints = new Set(['cycle-boundary', 'rising', 'falling', 'transition-start', 'transition-center', 'transition-end']);
  const serializeAnchor = anchor => anchor && ({ signal: anchor.signal, cycle: Number(anchor.cycle), point: anchor.point, offset: { x: Number(anchor.offset?.x || 0), y: Number(anchor.offset?.y || 0) } });
  const serializeAnnotationStyle = style => {
    if (!style || typeof style !== 'object') return undefined;
    const result = {}; for (const key of ['strokeColor', 'strokeWidth', 'lineStyle', 'strokeOpacity', 'fillColor', 'fillOpacity']) if (style[key] !== undefined) result[key] = structuredClone(style[key]);
    if (style.text && typeof style.text === 'object') { const text = {}; for (const key of ['color', 'fontFamily', 'fontSize', 'bold', 'italic', 'underline', 'strikethrough', 'align', 'wrap', 'maxWidth', 'lineHeight']) if (style.text[key] !== undefined) text[key] = structuredClone(style.text[key]); if (Object.keys(text).length) result.text = text; }
    return Object.keys(result).length ? result : undefined;
  };
  const serializeAnnotation = annotation => {
    const result = { id: annotation.id, type: annotation.type, label: annotation.label || '', color: annotation.color || '#1473e6', position: annotation.position || 'canvas', comment: annotation.comment || '', visible: annotation.visible !== false };
    for (const key of ['anchor', 'start', 'end', 'from', 'to']) if (annotation[key]) result[key] = serializeAnchor(annotation[key]);
    const style = serializeAnnotationStyle(annotation.style); if (style) result.style = style;
    if (annotation.labelPlacement) result.labelPlacement = annotation.labelPlacement;
    if (annotation.labelOffset) result.labelOffset = { x: Number(annotation.labelOffset.x || 0), y: Number(annotation.labelOffset.y || 0) };
    if (annotation.zOrder !== undefined) result.zOrder = Number(annotation.zOrder);
    if (annotation.locked !== undefined) result.locked = Boolean(annotation.locked);
    if (annotation.labelStyle) result.labelStyle = { wrap: annotation.labelStyle.wrap !== false, ...(annotation.labelStyle.maxWidth !== undefined ? { maxWidth: Number(annotation.labelStyle.maxWidth) } : {}), ...(annotation.labelStyle.lineHeight !== undefined ? { lineHeight: Number(annotation.labelStyle.lineHeight) } : {}), align: ['left', 'center', 'right'].includes(annotation.labelStyle.align) ? annotation.labelStyle.align : 'center' };
    if (annotation.lineType) result.lineType = annotation.lineType;
    if (annotation.arrowhead) result.arrowhead = annotation.arrowhead;
    return result;
  };
  const serializeSignal = signal => {
    if (signal.type === 'commentRow') return { id: signal.id, type: signal.type, title: signal.title, body: signal.body, ...(signal.groupId ? { groupId: signal.groupId } : {}), ...(signal.display?.visible === false ? { display: { visible: false } } : {}) };
    ensureCanonicalSource(signal);
    const result = { id: signal.id, name: signal.name, type: signal.type, role: signal.role, source: { instancePath: [...(signal.source.instancePath || [])], signalName: signal.source.signalName }, display: { name: signal.display?.name || signal.name } };
    if (signal.display?.visible === false) result.display.visible = false;
    if (signal.display?.style && typeof signal.display.style === 'object') result.display.style = structuredClone(signal.display.style);
    if (signal.source.msb !== undefined) result.source.msb = Number(signal.source.msb);
    if (signal.source.lsb !== undefined) result.source.lsb = Number(signal.source.lsb);
    if (signal.width !== undefined) result.width = signal.width;
    if (signal.displayFormat !== undefined) result.displayFormat = signal.displayFormat;
    if (signal.spacingBefore !== undefined) result.spacingBefore = Number(signal.spacingBefore);
    if (signal.spacingAfter !== undefined) result.spacingAfter = Number(signal.spacingAfter);
    if (signal.type === 'clock') {
      result.generator = { start: signal.generator.start, period: signal.generator.period, duty: signal.generator.duty, phase: signal.generator.phase, initial: signal.generator.initial, polarity: signal.generator.polarity, ...(Array.isArray(signal.generator.suppressedPeriods) && signal.generator.suppressedPeriods.length ? { suppressedPeriods: [...signal.generator.suppressedPeriods] } : {}) };
      result.edgeCounter = { show: signal.edgeCounter.show, mode: signal.edgeCounter.mode, startNumber: signal.edgeCounter.startNumber, countFrom: signal.edgeCounter.countFrom, labelEvery: signal.edgeCounter.labelEvery, position: signal.edgeCounter.position, offset: { x: signal.edgeCounter.offset.x, y: signal.edgeCounter.offset.y } };
    } else result.values = (signal.values || []).map(value => ({ start: value.start, value: value.value, ...(value.comment !== undefined ? { comment: value.comment } : {}) }));
    return result;
  };
  const finiteNumber = (value, field) => {
    const number = Number(value);
    if (!Number.isFinite(number)) throw new Error(`Non-finite number at ${field}`);
    return number;
  };
  const serializeDocument = documentValue => ({
    formatVersion: 2,
    document: { id: documentValue.document.id, title: documentValue.document.title, header: structuredClone(documentValue.document.header || { subtitle: '', description: '', notes: '', preconditions: [], constraints: [], exceptions: [] }), footer: structuredClone(documentValue.document.footer || { figureNumber: '', revision: '', text: '' }) },
    timeline: { start: finiteNumber(documentValue.timeline.start, '$.timeline.start'), end: finiteNumber(documentValue.timeline.end, '$.timeline.end'), timeBase: documentValue.timeline.timeBase, cycleCount: finiteNumber(documentValue.timeline.cycleCount, '$.timeline.cycleCount'), referenceClock: documentValue.timeline.referenceClock, edge: documentValue.timeline.edge, labelAnchors: (documentValue.timeline.labelAnchors || []).map(anchor => ({ id: anchor.id, source: finiteNumber(anchor.source, `$.timeline.labelAnchors[${anchor.id}].source`), display: finiteNumber(anchor.display, `$.timeline.labelAnchors[${anchor.id}].display`), ...(anchor.ownerTimeGroupId ? { ownerTimeGroupId: anchor.ownerTimeGroupId } : {}) })) },
    signalGroups: documentValue.signalGroups.map(group => ({ id: group.id, name: group.name, rows: [...group.rows], ...(group.style ? { style: structuredClone(group.style) } : {}), ...(group.spacers ? { spacers: structuredClone(group.spacers) } : {}), ...(group.spacingBefore ? { spacingBefore: Number(group.spacingBefore) } : {}), ...(group.spacingAfter ? { spacingAfter: Number(group.spacingAfter) } : {}), ...(group.collapsed ? { collapsed: true } : {}) })),
    signals: documentValue.signals.map(serializeSignal),
    annotations: (documentValue.annotations || []).map(serializeAnnotation),
    legend: structuredClone(documentValue.legend),
    layout: structuredClone(documentValue.layout),
    transactions: structuredClone(documentValue.transactions),
    constraints: structuredClone(documentValue.constraints),
    bookmarks: (documentValue.bookmarks || []).map(bookmark => ({ id: bookmark.id, name: bookmark.name, start: finiteNumber(bookmark.start, `$.bookmarks[${bookmark.id}].start`), ...(bookmark.comment ? { comment: bookmark.comment } : {}) })),
    timeGroups: (documentValue.timeGroups || []).map(group => ({ id: group.id, name: group.name, ...(group.category ? { category: group.category } : {}), start: finiteNumber(group.start, `$.timeGroups[${group.id}].start`), end: finiteNumber(group.end, `$.timeGroups[${group.id}].end`), ...(group.comment ? { comment: group.comment } : {}), ...(group.presentation ? { presentation: structuredClone(group.presentation) } : {}) })),
    checkSettings: structuredClone(documentValue.checkSettings || {})
  });
  rebuildObjectIndex();
  controller.rebuildObjectIndex = rebuildObjectIndex;
  controller.selectors = { getSignals, getSignal, getTimeline, getComments, getGroupRows, getReferenceClock };
  controller.getSerializableDocument = () => serializeDocument(model.document);
  controller.getCompatibilityPreview = () => { if (!model.compatibility) return null; const { rawText, ...publicPreview } = model.compatibility; return structuredClone(publicPreview); };
  controller.validateDocument = documentValue => {
    const issues = [];
    const candidateSignals = documentValue?.signals || [];
    const candidateSignal = id => candidateSignals.find(signal => signal.id === id);
    if (![1, 2].includes(documentValue?.formatVersion)) issues.push({ code: 'format-version' });
    for (const field of ['document', 'timeline', 'signalGroups', 'signals', 'annotations', 'legend', 'layout', 'transactions', 'constraints']) if (!(field in (documentValue || {}))) issues.push({ code: `missing-${field}` });
    if (documentValue?.formatVersion === 2) for (const field of ['bookmarks', 'timeGroups', 'checkSettings']) if (!(field in (documentValue || {}))) issues.push({ code: `missing-${field}` });
    const anchors = documentValue?.timeline?.labelAnchors || [];
    const anchorIds = new Set();
    for (const anchor of anchors) {
      if (!anchor?.id || anchorIds.has(anchor.id)) issues.push({ code: 'duplicate-label-anchor-id', id: anchor?.id });
      anchorIds.add(anchor?.id);
      if (!Number.isFinite(Number(anchor.source)) || !Number.isFinite(Number(anchor.display))) issues.push({ code: 'invalid-label-anchor', id: anchor?.id });
      if (Number(anchor.source) < Number(documentValue?.timeline?.start ?? 0) || Number(anchor.source) > Number(documentValue?.timeline?.end ?? 0)) issues.push({ code: 'label-anchor-outside-timeline', id: anchor?.id });
    }
    const bookmarkIds = new Set();
    for (const bookmark of documentValue?.bookmarks || []) {
      if (!bookmark?.id || bookmarkIds.has(bookmark.id)) issues.push({ code: 'duplicate-bookmark-id', id: bookmark?.id });
      bookmarkIds.add(bookmark?.id);
      if (!String(bookmark?.name || '').trim() || !Number.isFinite(Number(bookmark?.start)) || Number(bookmark.start) < Number(documentValue?.timeline?.start ?? 0) || Number(bookmark.start) > Number(documentValue?.timeline?.end ?? 0)) issues.push({ code: 'invalid-bookmark', id: bookmark?.id });
    }
    const timeGroupIds = new Set();
    const timeGroups = documentValue?.timeGroups || [];
    for (const group of timeGroups) {
      if (!group?.id || timeGroupIds.has(group.id)) issues.push({ code: 'duplicate-time-group-id', id: group?.id });
      timeGroupIds.add(group?.id);
      if (!String(group?.name || '').trim() || !Number.isFinite(Number(group?.start)) || !Number.isFinite(Number(group?.end)) || Number(group.start) >= Number(group.end)) issues.push({ code: 'invalid-time-group', id: group?.id });
      const presentation = group.presentation || {};
      if (presentation.foldStyle !== undefined && !['none', 'compact', 'axis-break'].includes(presentation.foldStyle)) issues.push({ code: 'invalid-time-group-fold-style', id: group?.id });
      if (presentation.resumeLabelAnchorId && !anchorIds.has(presentation.resumeLabelAnchorId)) issues.push({ code: 'invalid-resume-label-anchor', id: group?.id });
    }
    const validTimeGroups = timeGroups.filter(group => Number.isFinite(Number(group?.start)) && Number.isFinite(Number(group?.end)) && Number(group.start) < Number(group.end));
    for (let index = 0; index < validTimeGroups.length; index += 1) for (let other = index + 1; other < validTimeGroups.length; other += 1) {
      const left = validTimeGroups[index]; const right = validTimeGroups[other];
      const partial = Number(left.start) < Number(right.start) && Number(right.start) < Number(left.end) && Number(left.end) < Number(right.end)
        || Number(right.start) < Number(left.start) && Number(left.start) < Number(right.end) && Number(right.end) < Number(left.end);
      if (partial) issues.push({ code: 'overlapping-time-groups', id: left.id, relatedId: right.id, message: `Time Group ${left.id} and ${right.id} partially overlap` });
    }
    for (const anchor of anchors) if (anchor.ownerTimeGroupId && !timeGroupIds.has(anchor.ownerTimeGroupId)) issues.push({ code: 'invalid-label-anchor-owner', id: anchor.id });
    const walkFinite = (value, path = '$') => {
      if (typeof value === 'number' && !Number.isFinite(value)) issues.push({ code: 'non-finite-number', path });
      else if (Array.isArray(value)) value.forEach((entry, index) => walkFinite(entry, `${path}[${index}]`));
      else if (value && typeof value === 'object') Object.entries(value).forEach(([key, entry]) => walkFinite(entry, `${path}.${key}`));
    };
    walkFinite(documentValue);
    const annotationIds = new Set();
    for (const annotation of documentValue?.annotations || []) {
      if (!annotation.id || annotationIds.has(annotation.id)) issues.push({ code: 'duplicate-annotation-id', id: annotation.id }); annotationIds.add(annotation.id);
      if (!annotationTypes.has(annotation.type)) issues.push({ code: 'invalid-annotation-type', id: annotation.id });
      for (const key of Object.keys(annotation)) if (['resolved', 'canvasX', 'canvasY', 'localX', 'localY', 'bbox', 'drag', 'element'].includes(key)) issues.push({ code: 'annotation-runtime-field', id: annotation.id, field: key });
      const anchors = ['anchor', 'start', 'end', 'from', 'to'].filter(key => annotation[key]);
      for (const key of anchors) { const anchor = annotation[key]; if (!candidateSignal(anchor.signal) || !Number.isInteger(Number(anchor.cycle)) || Number(anchor.cycle) < 0 || Number(anchor.cycle) > (documentValue.timeline?.cycleCount ?? -1) || !anchorPoints.has(anchor.point) || !Number.isFinite(Number(anchor.offset?.x || 0)) || !Number.isFinite(Number(anchor.offset?.y || 0))) issues.push({ code: 'invalid-annotation-anchor', id: annotation.id, field: key }); }
      if (annotation.type === 'dependency' && (!['straight', 'orthogonal', 'curve', 'diagonal'].includes(annotation.lineType || 'orthogonal') || !['none', 'start', 'end', 'both'].includes(annotation.arrowhead || 'end'))) issues.push({ code: 'invalid-dependency-style', id: annotation.id });
      if (annotation.visible !== undefined && typeof annotation.visible !== 'boolean') issues.push({ code: 'invalid-annotation-visible', id: annotation.id });
      if (annotation.labelOffset !== undefined && (!Number.isFinite(Number(annotation.labelOffset.x || 0)) || !Number.isFinite(Number(annotation.labelOffset.y || 0)))) issues.push({ code: 'invalid-label-offset', id: annotation.id });
      if (annotation.labelStyle !== undefined && (typeof annotation.labelStyle !== 'object' || !['left', 'center', 'right'].includes(annotation.labelStyle.align || 'center') || (annotation.labelStyle.maxWidth !== undefined && (!Number.isFinite(Number(annotation.labelStyle.maxWidth)) || Number(annotation.labelStyle.maxWidth) <= 0)) || (annotation.labelStyle.lineHeight !== undefined && (!Number.isFinite(Number(annotation.labelStyle.lineHeight)) || Number(annotation.labelStyle.lineHeight) <= 0)))) issues.push({ code: 'invalid-label-style', id: annotation.id });
      if (annotation.style !== undefined) {
        const style = annotation.style;
        const text = style?.text;
        const styleKeys = new Set(['strokeColor', 'strokeWidth', 'lineStyle', 'strokeOpacity', 'fillColor', 'fillOpacity', 'text']);
        const unknownStyle = style && typeof style === 'object' && Object.keys(style).some(key => !styleKeys.has(key));
        if (!style || typeof style !== 'object' || unknownStyle || (style.strokeColor !== undefined && !/^#[0-9a-f]{6}$/i.test(String(style.strokeColor))) || (style.fillColor !== undefined && !/^#[0-9a-f]{6}$/i.test(String(style.fillColor))) || (style.strokeWidth !== undefined && (!Number.isFinite(Number(style.strokeWidth)) || Number(style.strokeWidth) <= 0 || Number(style.strokeWidth) > 64)) || (style.strokeOpacity !== undefined && (!Number.isFinite(Number(style.strokeOpacity)) || Number(style.strokeOpacity) < 0 || Number(style.strokeOpacity) > 1)) || (style.fillOpacity !== undefined && (!Number.isFinite(Number(style.fillOpacity)) || Number(style.fillOpacity) < 0 || Number(style.fillOpacity) > 1)) || (style.lineStyle !== undefined && !['solid', 'dash', 'dot', 'dashDot'].includes(style.lineStyle))) issues.push({ code: 'invalid-annotation-style', id: annotation.id });
        if (text) { const textKeys = new Set(['color', 'fontFamily', 'fontSize', 'bold', 'italic', 'underline', 'strikethrough', 'align', 'wrap', 'maxWidth', 'lineHeight']); const unknownText = typeof text === 'object' && Object.keys(text).some(key => !textKeys.has(key)); const invalidBoolean = ['bold', 'italic', 'underline', 'strikethrough', 'wrap'].some(key => text[key] !== undefined && typeof text[key] !== 'boolean'); if (typeof text !== 'object' || unknownText || invalidBoolean || (text.color !== undefined && !/^#[0-9a-f]{6}$/i.test(String(text.color))) || (text.fontFamily !== undefined && typeof text.fontFamily !== 'string') || (text.fontSize !== undefined && (!Number.isFinite(Number(text.fontSize)) || Number(text.fontSize) <= 0 || Number(text.fontSize) > 512)) || (text.maxWidth !== undefined && (!Number.isFinite(Number(text.maxWidth)) || Number(text.maxWidth) <= 0 || Number(text.maxWidth) > 10000)) || (text.lineHeight !== undefined && (!Number.isFinite(Number(text.lineHeight)) || Number(text.lineHeight) < 0.1 || Number(text.lineHeight) > 10)) || (text.align !== undefined && !['left', 'center', 'right'].includes(text.align))) issues.push({ code: 'invalid-annotation-text-style', id: annotation.id }); }
      }
      if (annotation.labelPlacement !== undefined && !['start', 'center', 'end', 'above', 'below'].includes(annotation.labelPlacement)) issues.push({ code: 'invalid-label-placement', id: annotation.id });
      if (annotation.zOrder !== undefined && (!Number.isInteger(Number(annotation.zOrder)) || Math.abs(Number(annotation.zOrder)) > 1000000)) issues.push({ code: 'invalid-annotation-z-order', id: annotation.id });
      if (annotation.locked !== undefined && typeof annotation.locked !== 'boolean') issues.push({ code: 'invalid-annotation-locked', id: annotation.id });
    }
    const ids = new Set();
    for (const signal of documentValue?.signals || []) {
      for (const key of Object.keys(signal)) if (['draft', 'selected', 'editing', 'dirty', 'validation', 'waveGeometry', 'edgeReference'].includes(key)) issues.push({ code: 'transient-or-unsupported-field', id: signal.id, field: key });
      if (ids.has(signal.id)) issues.push({ code: 'duplicate-signal-id', id: signal.id });
      ids.add(signal.id);
        if (signal.type !== 'commentRow') {
          if (signal.type === 'bus' && Number(signal.width) > 0) {
            for (const value of signal.values || []) {
              const raw = String(value.value ?? '').trim();
              const literal = parseSignalLiteral(raw, signal);
              if (!literal.valid) issues.push({ code: literal.overflow ? 'bus-width-overflow' : 'invalid-bus-literal', severity: 'error', id: signal.id, field: 'value', range: String(value.start), value: raw, requiredBits: literal.requiredBits, message: literal.overflow ? `値 '${raw}' は${signal.width}ビット幅を超えています` : `値 '${raw}' は有効なBus literalではありません`, recommendation: literal.overflow ? `${signal.width}ビット以内の値にしてください` : 'Hex/Binaryの値、X/Z、または識別子を指定してください', path: `$.signals[${signal.id}].values[${value.start}]` });
            }
          }
          const source = signal.source;
          if (source !== undefined && (!Array.isArray(source.instancePath) || source.instancePath.some(part => typeof part !== 'string' || !part.trim()) || typeof source.signalName !== 'string' || !source.signalName.trim())) issues.push({ code: 'invalid-signal-source', id: signal.id });
          if (source?.msb !== undefined && (!Number.isInteger(Number(source.msb)) || source.lsb === undefined)) issues.push({ code: 'invalid-bus-range', id: signal.id });
          if (source?.lsb !== undefined && (!Number.isInteger(Number(source.lsb)) || source.msb === undefined)) issues.push({ code: 'invalid-bus-range', id: signal.id });
          if (source?.msb !== undefined && source?.lsb !== undefined && Number(source.msb) < Number(source.lsb)) issues.push({ code: 'invalid-bus-range', id: signal.id });
          if (signal.display?.name !== undefined && typeof signal.display.name !== 'string') issues.push({ code: 'invalid-display-name', id: signal.id });
          if (signal.spacingBefore !== undefined && (!Number.isFinite(Number(signal.spacingBefore)) || Number(signal.spacingBefore) < 0)) issues.push({ code: 'invalid-signal-spacing', id: signal.id });
          if (signal.spacingAfter !== undefined && (!Number.isFinite(Number(signal.spacingAfter)) || Number(signal.spacingAfter) < 0)) issues.push({ code: 'invalid-signal-spacing', id: signal.id });
        }
        if (signal.type === 'clock') {
          const generator = signal.generator || {};
          const counter = signal.edgeCounter || {};
          const suppressed = generator.suppressedPeriods;
          const validSuppressed = Array.isArray(suppressed) && suppressed.every(value => Number.isInteger(Number(value)) && Number(value) >= 0) && new Set(suppressed.map(Number)).size === suppressed.length && [...suppressed].every((value, index, values) => index === 0 || Number(values[index - 1]) < Number(value));
          if (!Number.isFinite(Number(generator.start)) || Number(generator.start) < 0 || !Number.isFinite(Number(generator.duty)) || Number(generator.duty) <= 0 || Number(generator.duty) >= 1 || !Number.isFinite(Number(generator.period)) || Number(generator.period) <= 0 || !Number.isFinite(Number(generator.phase)) || ![0, 1].includes(Number(generator.initial)) || (suppressed !== undefined && !validSuppressed)) issues.push({ code: 'invalid-clock-generator', id: signal.id });
          if (!['rising', 'falling', 'both'].includes(counter.mode) || !['above', 'below'].includes(counter.position) || !['signal-start', 'selected-edge', 'marker', 'visible-range-start'].includes(counter.countFrom) || !Number.isInteger(Number(counter.startNumber)) || Number(counter.startNumber) < 0 || !Number.isInteger(Number(counter.labelEvery)) || Number(counter.labelEvery) < 1 || !Number.isFinite(Number(counter.offset?.x)) || !Number.isFinite(Number(counter.offset?.y))) issues.push({ code: 'invalid-edge-counter', id: signal.id });
        } else if (signal.type !== 'commentRow') {
        let previous = -1;
        for (const value of signal.values || []) { if (Number(value.start) <= previous) issues.push({ code: 'invalid-start-order', id: signal.id }); previous = Number(value.start); }
        if (signal.type === 'clock' && (!signal.generator || signal.generator.period <= 0 || signal.generator.duty <= 0 || signal.generator.duty > 1)) issues.push({ code: 'invalid-clock-generator', id: signal.id });
      }
    }
    const signalIds = ids;
    for (const group of documentValue?.signalGroups || []) for (const row of group.rows || []) if (!signalIds.has(row)) issues.push({ code: 'invalid-group-row', groupId: group.id, row });
    if (!signalIds.has(documentValue?.timeline?.referenceClock) || documentValue?.signals?.find(signal => signal.id === documentValue.timeline.referenceClock)?.type !== 'clock') issues.push({ code: 'invalid-reference-clock' });
    if (!['rising', 'falling'].includes(documentValue?.timeline?.edge)) issues.push({ code: 'invalid-timeline-edge' });
    const transactionIds = new Set();
    const timelineStart = Number(documentValue?.timeline?.start ?? 0);
    const timelineEnd = Number(documentValue?.timeline?.end ?? documentValue?.timeline?.cycleCount ?? 0);
    for (const transaction of documentValue?.transactions || []) {
      const id = transaction?.id;
      const start = Number(transaction?.start);
      const end = Number(transaction?.end);
      if (!id || transactionIds.has(id)) issues.push({ code: 'duplicate-transaction-id', id });
      transactionIds.add(id);
      if (!Number.isInteger(start) || !Number.isInteger(end) || start < timelineStart || end <= start || end > timelineEnd) issues.push({ code: 'invalid-transaction-bounds', id });
      if (transaction.linkedSignals !== undefined) {
        if (!Array.isArray(transaction.linkedSignals)) issues.push({ code: 'invalid-transaction-links', id });
        else for (const signalId of transaction.linkedSignals) if (!candidateSignal(signalId) || candidateSignal(signalId).type === 'commentRow') issues.push({ code: 'invalid-transaction-link', id, signalId });
      }
      if (transaction.phases !== undefined && !Array.isArray(transaction.phases)) issues.push({ code: 'invalid-transaction-phases', id });
      for (const phase of Array.isArray(transaction.phases) ? transaction.phases : []) {
        const phaseStart = Number(phase?.start);
        const phaseEnd = Number(phase?.end);
        if (!phase?.name || !Number.isFinite(phaseStart) || !Number.isFinite(phaseEnd) || phaseStart < start || phaseEnd <= phaseStart || phaseEnd > end) issues.push({ code: 'invalid-transaction-phase-bounds', id, phase: phase?.name });
      }
    }
    const paths = issue => ({
      'format-version': '$.formatVersion', 'duplicate-label-anchor-id': '$.timeline.labelAnchors', 'invalid-label-anchor': '$.timeline.labelAnchors', 'label-anchor-outside-timeline': '$.timeline.labelAnchors', 'duplicate-bookmark-id': '$.bookmarks', 'invalid-bookmark': '$.bookmarks', 'duplicate-time-group-id': '$.timeGroups', 'invalid-time-group': '$.timeGroups', 'invalid-time-group-fold-style': '$.timeGroups', 'invalid-resume-label-anchor': '$.timeGroups', 'invalid-label-anchor-owner': '$.timeline.labelAnchors', 'non-finite-number': '$',
      'missing-document': '$.document', 'missing-timeline': '$.timeline', 'missing-signalGroups': '$.signalGroups', 'missing-signals': '$.signals', 'missing-annotations': '$.annotations', 'missing-legend': '$.legend', 'missing-layout': '$.layout', 'missing-transactions': '$.transactions', 'missing-constraints': '$.constraints',
      'invalid-reference-clock': '$.timeline.referenceClock', 'invalid-timeline-edge': '$.timeline.edge', 'invalid-group-row': `$.signalGroups[${issue.groupId}].rows`, 'invalid-annotation-anchor': `$.annotations[${issue.id}].${issue.field || 'anchor'}`, 'duplicate-annotation-id': `$.annotations[${issue.id}]`, 'invalid-annotation-type': `$.annotations[${issue.id}].type`, 'invalid-dependency-style': `$.annotations[${issue.id}]`, 'invalid-start-order': `$.signals[${issue.id}].values`, 'duplicate-signal-id': `$.signals[${issue.id}]`, 'invalid-clock-generator': `$.signals[${issue.id}].generator`, 'transient-or-unsupported-field': `$.signals[${issue.id}].${issue.field}`, 'invalid-signal-source': `$.signals[${issue.id}].source`, 'invalid-bus-range': `$.signals[${issue.id}].source`, 'invalid-display-name': `$.signals[${issue.id}].display.name`, 'invalid-bus-literal': `$.signals[${issue.id}].values`, 'bus-width-overflow': `$.signals[${issue.id}].values`, 'invalid-display-name': `$.signals[${issue.id}].display.name`, 'invalid-label-offset': `$.annotations[${issue.id}].labelOffset`, 'invalid-label-style': `$.annotations[${issue.id}].labelStyle`, 'invalid-signal-spacing': `$.signals[${issue.id}].spacing`, 'duplicate-transaction-id': `$.transactions[${issue.id}]`, 'invalid-transaction-bounds': `$.transactions[${issue.id}]`, 'invalid-transaction-links': `$.transactions[${issue.id}].linkedSignals`, 'invalid-transaction-link': `$.transactions[${issue.id}].linkedSignals`, 'invalid-transaction-phases': `$.transactions[${issue.id}].phases`, 'invalid-transaction-phase-bounds': `$.transactions[${issue.id}].phases`
    }[issue.code] || '$');
    return issues.map(issue => ({ ...issue, path: issue.path || paths(issue), message: issue.message || issue.code }));
  };
  const rawValidateDocument = controller.validateDocument;
  const validateDocumentRaw = documentValue => {
    if (typeof controller.validationTestHook === 'function') controller.validationTestHook(documentValue);
    return rawValidateDocument(documentValue);
  };
  controller.validateDocumentRaw = validateDocumentRaw;
  controller.validateDocument = validateDocumentRaw;
  const validationSettingsKey = documentValue => JSON.stringify(documentValue?.checkSettings || {});
  const cloneIssues = issues => issues.map(issue => ({ ...issue }));
  controller.clearValidationCache = () => {
    model.validationCache = { documentRef: null, documentRevision: null, settingsKey: null, refreshRevision: null, issues: [] };
  };
  controller.cacheValidationResult = (documentValue, issues, revision = model.documentRevision) => {
    if (documentValue !== model.document) return false;
    model.validationCache = { documentRef: documentValue, documentRevision: revision ?? 0, settingsKey: validationSettingsKey(documentValue), refreshRevision: model.problemRefreshRevision || 0, issues: cloneIssues(issues) };
    return true;
  };
  controller.getValidationMetrics = () => ({ ...model.validationMetrics });
  controller.getProblems = (documentValue = model.document, { force = false } = {}) => {
    if (documentValue !== model.document) return validateDocumentRaw(documentValue);
    const revision = model.documentRevision ?? 0;
    const settingsKey = validationSettingsKey(documentValue);
    const cache = model.validationCache;
    if (!force && cache.documentRef === documentValue && cache.documentRevision === revision && cache.settingsKey === settingsKey && cache.refreshRevision === (model.problemRefreshRevision || 0)) {
      model.validationMetrics.validationCacheHits += 1;
      return cloneIssues(cache.issues);
    }
    model.validationMetrics.validationCacheMisses += 1;
    model.validationMetrics.validationRuns += 1;
    const issues = validateDocumentRaw(documentValue);
    controller.cacheValidationResult(documentValue, issues, revision);
    return cloneIssues(issues);
  };
  window.TimingChartProductionController = controller;

  const tabs = () => [...document.querySelectorAll('#bottomTabs [data-tab]')];
  const rows = () => [...document.querySelectorAll('.row[data-signal]')];
  const setHidden = (element, hidden) => { if (!element) return; element.hidden = hidden; element.classList.toggle('hidden', hidden); };
  const renderSelection = () => rows().forEach(row => row.classList.toggle('selected', row.dataset.signal === model.selection.id || (model.crossHighlight || []).includes(row.dataset.signal)));
  const applyCenterLayout = () => {
    const center = document.querySelector('.center');
    if (!center) return;
    const mode = model.view.mode;
    center.dataset.viewMode = mode;
    center.dataset.layoutContract = 'explicit';
    center.style.minHeight = '0';
    const workspace = center.closest('.workspace');
    const workspaceHeight = workspace?.getBoundingClientRect().height;
    if (workspaceHeight) center.style.height = `${workspaceHeight}px`;
    const centerWidth = `${Math.max(0, center.clientWidth)}px`;
    center.querySelectorAll('.canvas').forEach(canvas => { canvas.style.minWidth = '0'; canvas.style.width = centerWidth; canvas.style.maxWidth = centerWidth; canvas.style.boxSizing = 'border-box'; });
    const bottom = center.querySelector('.bottom');
    if (bottom) { bottom.style.minWidth = '0'; bottom.style.width = centerWidth; bottom.style.maxWidth = centerWidth; bottom.style.boxSizing = 'border-box'; }
    if (mode !== 'split') {
      center.style.removeProperty('--split-bottom-h');
      center.style.gridTemplateRows = 'minmax(320px,1fr) var(--bottom-h)';
      return;
    }
    const centerHeight = center.getBoundingClientRect().height;
    const preferredBottom = Number.parseFloat(getComputedStyle(center).getPropertyValue('--bottom-h')) || center.querySelector('.bottom')?.getBoundingClientRect().height || 270;
    const minimumUpper = Math.min(160, Math.max(90, (centerHeight - 150) / 2));
    const bottomHeight = Math.max(150, Math.min(preferredBottom, Math.max(150, centerHeight - minimumUpper * 2)));
    center.style.setProperty('--split-bottom-h', `${bottomHeight}px`);
    center.style.gridTemplateRows = `minmax(${minimumUpper}px,1fr) minmax(${minimumUpper}px,1fr) var(--split-bottom-h)`;
  };
  const renderMode = () => {
    document.querySelectorAll('.seg').forEach(button => button.classList.toggle('active', button.dataset.mode === model.view.mode));
    const transaction = model.view.mode === 'transaction' || model.view.mode === 'split';
    setHidden(document.querySelector('#bottomTabs [data-tab="signal"]'), model.view.mode === 'transaction');
    setHidden(document.querySelector('#bottomTabs [data-tab="transaction"]'), !transaction);
    setHidden(document.querySelector('.ribbon-tabs .cycle-only'), model.view.mode === 'transaction');
    setHidden(document.querySelector('.ribbon-tabs .txn-only'), model.view.mode === 'cycle');
    setHidden(document.querySelector('#cycleCanvas'), model.view.mode === 'transaction');
    setHidden(document.querySelector('#transactionCanvas'), model.view.mode === 'cycle');
    applyCenterLayout();
  };
  const renderTab = () => tabs().forEach(button => button.classList.toggle('active', button.dataset.tab === model.view.tab));
  const renderContextControls = () => {
    const follow = document.querySelector('#bottomTabs input[type="checkbox"]');
    const pin = document.querySelector('#bottomTabs .follow button');
    if (follow) { follow.checked = Boolean(model.view.followSelection); follow.setAttribute('aria-checked', String(Boolean(model.view.followSelection))); }
    if (pin) { pin.dataset.state = model.view.pinned ? 'on' : 'off'; pin.setAttribute('aria-pressed', String(Boolean(model.view.pinned))); pin.style.backgroundColor = model.view.pinned ? '#dbeafe' : ''; pin.style.borderColor = model.view.pinned ? '#4f8fea' : ''; pin.style.fontWeight = model.view.pinned ? '600' : ''; pin.title = model.view.pinned ? 'Pinned context (クリックで解除)' : 'Pin context'; }
  };
  const renderStatus = () => { const status = document.querySelector('.status'); if (!status) return; const range = [...status.querySelectorAll('span')].find(span => span.textContent.includes('Time Range')); const zoom = [...status.querySelectorAll('span')].find(span => span.textContent.includes('Zoom')); const signals = [...status.querySelectorAll('span')].find(span => span.textContent.includes('Signals:')); const annotations = [...status.querySelectorAll('span')].find(span => span.textContent.includes('Annotations:')); const problems = [...status.querySelectorAll('span')].find(span => span.textContent.includes('Problems:')); if (range) range.textContent = `Time Range: ${model.document.timeline.start} - ${model.document.timeline.end} cycle`; if (zoom) zoom.textContent = `Zoom: ${Math.round(model.view.zoom * 100)}%`; if (signals) signals.textContent = `Signals: ${(model.document.signals || []).length}`; if (annotations) annotations.textContent = `Annotations: ${(model.document.annotations || []).length}`; if (problems) problems.textContent = `Problems: ${controller.getProblems(model.document).length}`; };
  const closeStatusPopup = () => document.querySelector('[data-status-popup]')?.remove();
  const openStatusPopup = (kind, target) => { closeStatusPopup(); const popup = document.createElement('div'); popup.dataset.statusPopup = kind; popup.style.cssText = 'position:fixed;z-index:1000;width:190px;padding:8px;background:#fff;border:1px solid #b8c5d4;border-radius:4px;box-shadow:0 4px 14px rgba(0,0,0,.16);font:12px sans-serif;color:#334155;'; const rect = target.getBoundingClientRect(); popup.style.left = `${Math.max(4, Math.min(window.innerWidth - 204, rect.left - 20))}px`; popup.style.top = `${Math.max(4, rect.top - (kind === 'range' ? 122 : 92))}px`; if (kind === 'range') { popup.innerHTML = '<b>Time Range</b><label style="display:block;margin-top:6px">Start <input data-status-field="start" type="number" style="width:90px"></label><label style="display:block;margin-top:4px">End <input data-status-field="end" type="number" style="width:90px"></label><div data-status-error style="height:16px;color:#b22"></div><button data-status-action="reset">Reset</button> <button data-status-action="apply">Apply</button>'; popup.querySelector('[data-status-field="start"]').value = model.document.timeline.start; popup.querySelector('[data-status-field="end"]').value = model.document.timeline.end; } else { popup.innerHTML = '<b>Zoom</b><div style="margin-top:6px"><button data-status-action="minus">−</button> <input data-status-field="zoom" type="number" min="25" max="400" step="5" style="width:66px">% <button data-status-action="plus">＋</button></div><div style="margin-top:6px"><button data-status-action="fit-all">Fit All</button> <button data-status-action="fit-selection">Selection</button></div>'; popup.querySelector('[data-status-field="zoom"]').value = Math.round(model.view.zoom * 100); } popup.addEventListener('click', event => { const action = event.target.closest('[data-status-action]')?.dataset.statusAction; if (!action) return; if (kind === 'range') { if (action === 'reset') { popup.querySelector('[data-status-field="start"]').value = 0; popup.querySelector('[data-status-field="end"]').value = model.document.timeline.cycleCount; } if (action === 'apply') { const ok = controller.actions.setTimeRange(popup.querySelector('[data-status-field="start"]').value, popup.querySelector('[data-status-field="end"]').value); if (!ok) popup.querySelector('[data-status-error]').textContent = 'Invalid range'; else closeStatusPopup(); } } else { const input = popup.querySelector('[data-status-field="zoom"]'); const current = Number(input.value); if (action === 'minus') input.value = Math.max(25, current - 10); if (action === 'plus') input.value = Math.min(400, current + 10); if (action === 'fit-all') { controller.actions.fitAll(); closeStatusPopup(); } if (action === 'fit-selection') { controller.actions.fitSelection(); closeStatusPopup(); } } }); if (kind === 'zoom') { const input = popup.querySelector('[data-status-field="zoom"]'); const apply = () => { if (!controller.actions.setZoom(input.value)) input.setCustomValidity('Zoom must be 25-400%'); else input.setCustomValidity(''); }; input.addEventListener('change', apply); input.addEventListener('keydown', event => { if (event.key === 'Enter') { apply(); event.preventDefault(); } }); } document.body.appendChild(popup); };
  const bindStatus = () => { const status = document.querySelector('.status'); if (!status) return; [...status.querySelectorAll('span')].filter(span => /Time Range|Zoom/.test(span.textContent)).forEach(span => { if (span.dataset.statusBound) return; span.dataset.statusControl = span.textContent.includes('Time Range') ? 'range' : 'zoom'; span.dataset.statusBound = 'true'; span.tabIndex = 0; span.style.cursor = 'pointer'; span.addEventListener('click', event => { event.stopPropagation(); openStatusPopup(span.dataset.statusControl, span); }); }); };
  document.addEventListener('pointerdown', event => { if (!event.target.closest('[data-status-popup], [data-status-control]')) closeStatusPopup(); });
  document.addEventListener('click', event => { const action = event.target.closest('[data-status-action]')?.dataset.statusAction; if (!['minus', 'plus'].includes(action)) return; const popup = event.target.closest('[data-status-popup="zoom"]'); const input = popup?.querySelector('[data-status-field="zoom"]'); if (input) controller.actions.setZoom(input.value); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeStatusPopup(); });
  const render = () => { profileMark('render:start'); controller.renderMetrics.appFullRenders += 1; rebuildObjectIndex(); renderMode(); renderTab(); renderContextControls(); renderSelection(); renderStatus(); renderHierarchy(); window.TimingChartGoldenRenderer?.render(model); appendHierarchyInspector(); ensurePathMenu(); profileMark('waveform:start'); window.TimingChartProductionWaveform?.render(model); profileMark('waveform:end'); window.TimingChartProductionTimeAxis?.renderTransient(model); window.TimingChartProductionAnnotations?.render(model); window.TimingChartProductionTransactions?.render(model); applyZoom(); bindStatus(); for (const callback of controller.renderHooks.after.values()) callback(model); profileMark('render:end'); };
  controller.render = render;
  controller.actions.setViewMode = nextMode => { model.view.mode = nextMode; if (nextMode === 'transaction') model.view.tab = 'transaction'; if (nextMode === 'cycle' && model.view.tab === 'transaction') model.view.tab = 'signal'; render(); };
  controller.actions.setBottomTab = nextTab => { if (model.view.mode === 'cycle' && nextTab === 'transaction') return; if (model.view.mode === 'transaction' && nextTab === 'signal') return; model.view.tab = nextTab; render(); };
  controller.actions.setProblemFilter = (severity = 'all', signalId = 'all') => { if (!['all', 'err', 'warn', 'info'].includes(severity)) return false; model.view.problemSeverityFilter = severity; model.view.problemSignalFilter = signalId || 'all'; render(); return true; };
  controller.actions.refreshProblems = () => { model.problemRefreshRevision = (model.problemRefreshRevision || 0) + 1; controller.clearValidationCache(); model.validation = controller.getProblems(model.document, { force: true }); render(); return true; };
  const PROBLEM_CATEGORIES = {
    schema: ['format-version', 'missing-document', 'missing-timeline', 'missing-signalGroups', 'missing-signals', 'missing-annotations', 'missing-legend', 'missing-layout', 'missing-transactions', 'missing-constraints'],
    signal: ['invalid-start-order', 'duplicate-signal-id', 'invalid-signal-source', 'invalid-display-name', 'transient-or-unsupported-field', 'non-finite-number', 'invalid-signal-spacing'],
    bus: ['invalid-bus-range', 'invalid-bus-literal', 'bus-width-overflow'],
    timeline: ['duplicate-label-anchor-id', 'invalid-label-anchor', 'label-anchor-outside-timeline', 'invalid-resume-label-anchor', 'invalid-label-anchor-owner', 'duplicate-bookmark-id', 'invalid-bookmark', 'duplicate-time-group-id', 'invalid-time-group', 'invalid-time-group-fold-style'],
    clock: ['invalid-reference-clock', 'invalid-timeline-edge', 'invalid-clock-generator'],
    annotation: ['invalid-annotation-anchor', 'duplicate-annotation-id', 'invalid-annotation-type', 'invalid-dependency-style', 'invalid-label-offset', 'invalid-label-style'],
    transaction: ['duplicate-transaction-id', 'invalid-transaction-bounds', 'invalid-transaction-links', 'invalid-transaction-link', 'invalid-transaction-phases', 'invalid-transaction-phase-bounds']
  };
  const problemCategoryOf = code => Object.keys(PROBLEM_CATEGORIES).find(category => PROBLEM_CATEGORIES[category].includes(code)) || 'schema';
  controller.problemCategories = PROBLEM_CATEGORIES;
  controller.problemCategoryOf = problemCategoryOf;
  controller.actions.setProblemObjectFilter = (ids = null) => { model.view.problemObjectFilter = Array.isArray(ids) && ids.length ? [...ids] : null; render(); return true; };
  controller.actions.setProblemCategoryFilter = (categories = null) => { const valid = Array.isArray(categories) ? categories.filter(category => Object.prototype.hasOwnProperty.call(PROBLEM_CATEGORIES, category)) : null; model.view.problemCategoryFilter = valid && valid.length ? valid : null; render(); return true; };
  controller.actions.setFollowSelection = enabled => { model.view.followSelection = enabled; if (enabled) model.view.pinned = false; render(); };
  controller.actions.setPinned = pinned => { model.view.pinned = pinned; if (pinned) model.view.followSelection = false; render(); };
  controller.actions.setSignalVisibility = (signalId, visible) => { const signal = model.document.signals.find(item => item.id === signalId); if (!signal) return false; return incrementalRun('Change signal visibility', () => { signal.display ||= { name: signal.name }; if (visible) delete signal.display.visible; else signal.display.visible = false; model.view.hiddenSignals = model.document.signals.filter(item => item.display?.visible === false).map(item => item.id); }, () => reconcileSignalVisibility(signalId)); };
  controller.actions.setSignalNameWidth = widthValue => { const width = Number(widthValue); if (!Number.isInteger(width) || width < 120 || width > 360) return false; return transactionRun('Resize signal label column', () => { model.document.layout.signalNameWidth = width; }); };
  const transactionRun = (label, mutation) => {
    if (controller.documentHistory?.run) return controller.documentHistory.run(label, mutation);
    let result = true;
    try { result = mutation() !== false; } catch { result = false; }
    if (result) render();
    return result;
  };
  const reconcileSignalVisibility = signalId => {
    const signal = model.document.signals.find(item => item.id === signalId);
    if (!signal) return;
    const hidden = signal.display?.visible === false;
    const apply = row => {
      if (!row) return;
      row.hidden = hidden;
      row.style.display = hidden ? 'none' : '';
    };
    apply(document.querySelector(`#cycleCanvas .wave-row[data-signal="${CSS.escape(signalId)}"]`));
    apply(document.querySelector(`#cycleCanvas .frozen-label-row[data-signal="${CSS.escape(signalId)}"]`));
    const treeRow = document.querySelector(`#groups .row[data-signal="${CSS.escape(signalId)}"]`);
    if (treeRow) {
      treeRow.dataset.visibility = hidden ? 'hidden' : 'visible';
      const eye = treeRow.querySelector('.eye');
      if (eye) {
        eye.setAttribute('aria-label', hidden ? '表示' : '非表示');
        eye.innerHTML = `<svg aria-hidden="true"><use href="icons.svg#${hidden ? 'i-eye-off' : 'i-eye'}"></use></svg>`;
      }
    }
  };
  const reconcileSignalOrder = (signalId, delta) => {
    const group = (model.document.signalGroups || []).find(item => (item.rows || []).includes(signalId));
    const index = group ? group.rows.indexOf(signalId) : -1;
    const reorderTimings = [];
    const applyTimingVisualOrder = host => {
      const rows = [...host.querySelectorAll(':scope > .wave-row')];
      const byId = new Map(rows.map(row => [row.dataset.signalId || row.dataset.signal, row]));
      const visibleRows = rows.filter(row => !row.hidden && row.style.display !== 'none');
      const visibleIds = new Set(visibleRows.map(row => row.dataset.signalId || row.dataset.signal));
      const orderedIds = (model.document.signalGroups || []).flatMap(item => item.rows || []).filter(id => visibleIds.has(id));
      if (!visibleRows.length || !orderedIds.length) return false;
      // Keep the WaveDrom SVG subtrees in place, but let one layout container
      // determine visual order. Per-row transforms promote every SVG-heavy row
      // to a compositor layer on large documents.
      host.style.display = 'flex';
      host.style.flexDirection = 'column';
      host.style.alignItems = 'stretch';
      const ruler = host.querySelector(':scope > .ruler');
      if (ruler) {
        // The locked GUI's initial DOM places the ruler after the rows. Keep
        // that established geometry while assigning flex order to signals.
        ruler.style.order = String(orderedIds.length + 1);
        ruler.style.flex = '0 0 auto';
      }
      const baseTop = new Map(visibleRows.map(row => [row, row.offsetTop]));
      const orderById = new Map(orderedIds.map((id, index) => [id, index + 1]));
      for (const row of rows) {
        const id = row.dataset.signalId || row.dataset.signal;
        const order = orderById.get(id);
        row.style.order = order === undefined ? '0' : String(order);
        row.style.flex = '0 0 auto';
        // Do not rasterize off-screen SVG rows during large-document reorder.
        // The intrinsic size preserves the existing row geometry until the
        // browser brings a row into the viewport.
        row.style.contentVisibility = 'auto';
        row.style.containIntrinsicSize = '35px 100%';
        row.style.transform = '';
        row.style.willChange = '';
        row.dataset.reorderVisual = order === undefined ? 'none' : 'layout-order';
      }
      controller.renderMetrics.rowMoves += 1;
      controller.renderMetrics.cycleRowMoves += 1;
      host.dataset.reorderLayout = 'flex-order';
      return true;
    };
    const reorder = host => {
      if (!host) return;
      const started = performance.now();
      if (host.matches('#cycleCanvas .timing-scroll-pane > .wave') && applyTimingVisualOrder(host)) {
        reorderTimings.push({ host: host.className || host.id || 'host', mode: 'layout-order', ms: performance.now() - started });
        return;
      }
      const row = host.querySelector(`[data-signal="${CSS.escape(signalId)}"]`);
      if (!group || !row) { reorderTimings.push({ host: host.className || host.id || 'host', ms: performance.now() - started }); return; }
      const nextId = group.rows[index + 1];
      const next = nextId ? host.querySelector(`[data-signal="${CSS.escape(nextId)}"]`) : null;
      if (next) { host.insertBefore(row, next); controller.renderMetrics.rowMoves += 1; controller.renderMetrics.cycleRowMoves += 1; reorderTimings.push({ host: host.className || host.id || 'host', ms: performance.now() - started }); return; }
      const groupIds = new Set(group.rows);
      const last = [...host.children].reverse().find(node => groupIds.has(node.dataset.signal));
      if (last?.nextSibling) host.insertBefore(row, last.nextSibling); else if (last) host.appendChild(row);
      controller.renderMetrics.rowMoves += 1; controller.renderMetrics.cycleRowMoves += 1;
      reorderTimings.push({ host: host.className || host.id || 'host', ms: performance.now() - started });
    };
    reorder(document.querySelector('#cycleCanvas .wave'));
    reorder(window.TimingChartFrozenLabels?.frozenWave);
    const treeHost = group ? document.querySelector(`#groups .group[data-group-id="${CSS.escape(group.id)}"]`) : null;
    if (treeHost && group) {
      const row = treeHost.querySelector(`.row[data-signal="${CSS.escape(signalId)}"]`);
      const nextId = group.rows[index + 1];
      const next = nextId ? treeHost.querySelector(`.row[data-signal="${CSS.escape(nextId)}"]`) : null;
      if (row) {
        if (next) treeHost.insertBefore(row, next);
        else { const rowIds = new Set(group.rows); const last = [...treeHost.querySelectorAll(':scope > .row[data-signal]')].reverse().find(node => rowIds.has(node.dataset.signal)); if (last?.nextSibling) treeHost.insertBefore(row, last.nextSibling); else treeHost.appendChild(row); }
      }
    }
    const shiftStarted = performance.now();
    window.TimingChartProductionWaveform?.shiftScreenGeometryAfterRowReorder?.(model);
    const shiftFinished = performance.now();
    const axisFinished = performance.now();
    if ((model.document.annotations || []).length) window.TimingChartProductionAnnotations?.render?.(model);
    const annotationFinished = performance.now();
    const neighborIndex = Number(delta) < 0 ? index + 1 : index - 1;
    const minimapRows = group && group.rows[neighborIndex] ? [signalId, group.rows[neighborIndex]] : [];
    if (controller.viewRibbon?.reconcileMinimapRows?.(minimapRows)) {
      controller.viewMetrics ||= {};
      controller.viewMetrics.minimapLocalizedUpdates = (controller.viewMetrics.minimapLocalizedUpdates || 0) + 1;
    }
    controller.lastIncrementalTraceParts = { shiftMs: shiftFinished - shiftStarted, timeAxisMs: axisFinished - shiftFinished, annotationsMs: annotationFinished - axisFinished, reorderTimings };
  };
  const incrementalRun = (label, mutation, reconcile) => {
    const started = performance.now();
    profileMark('command:start');
    profileMark('history:start');
    const result = controller.documentHistory?.run ? controller.documentHistory.run(label, mutation, { render: false }) : (() => { try { return mutation() !== false; } catch { return false; } })();
    const historyFinished = performance.now();
    profileMark('history:end');
    if (!result) { render(); controller.lastIncrementalTrace = { label, historyMs: historyFinished - started, reconcileMs: 0, totalMs: performance.now() - started }; return false; }
    profileMark('reconcile:start');
    reconcile?.();
    profileMark('reconcile:end');
    if (controller.profileEnabled) requestAnimationFrame(() => profileMark('command:raf-1'));
    profileMark('command:dom-ready');
    controller.lastIncrementalTrace = { label, historyMs: historyFinished - started, reconcileMs: performance.now() - historyFinished, totalMs: performance.now() - started, parts: controller.lastIncrementalTraceParts || null };
    return true;
  };
  controller.dispatchDocumentCommand = transactionRun;
  const hierarchyRows = () => getSignals().map(signal => ({ signal, group: model.document.signalGroups.find(group => (group.rows || []).includes(signal.id)) })).filter(item => item.signal);
  const parseFullPath = raw => {
    const text = String(raw || '').trim();
    const match = text.match(/^(.+?)(?:\[(\d+)(?::(\d+))?\])?$/);
    if (!match || !match[1] || /(^\.|\.$|\.\.|\s)/.test(match[1])) return { valid: false, input: text, reason: '階層パスまたは信号名が不正です' };
    const parts = match[1].split('.'); const signalName = parts.pop();
    if (!signalName || !/^[A-Za-z_$][\w$]*$/.test(signalName) || parts.some(part => !/^[A-Za-z_$][\w$]*$/.test(part))) return { valid: false, input: text, reason: '識別子に使用できない文字があります' };
    const msb = match[2] === undefined ? undefined : Number(match[2]); const lsb = match[3] === undefined ? msb : Number(match[3]);
    if (msb !== undefined && msb < lsb) return { valid: false, input: text, reason: 'Bus rangeはMSB:LSB順で指定してください' };
    return { valid: true, input: text, instancePath: parts, signalName, ...(msb === undefined ? {} : { msb, lsb, width: msb - lsb + 1 }) };
  };
  const duplicatePath = parsed => hierarchyRows().some(({ signal }) => {
    const source = getSource(signal); return JSON.stringify(source.instancePath || []) === JSON.stringify(parsed.instancePath || []) && source.signalName === parsed.signalName && Number(source.msb ?? -1) === Number(parsed.msb ?? -1) && Number(source.lsb ?? -1) === Number(parsed.lsb ?? -1);
  });
  const previewBatch = text => { const seen = new Set(); return String(text || '').split(/\r?\n/).map((line, index) => { const parsed = parseFullPath(line); if (!parsed.valid) return { line: index + 1, ...parsed, status: 'invalid' }; const key = JSON.stringify([parsed.instancePath, parsed.signalName, parsed.msb ?? null, parsed.lsb ?? null]); if (duplicatePath(parsed) || seen.has(key)) return { line: index + 1, ...parsed, status: 'duplicate' }; seen.add(key); return { line: index + 1, ...parsed, status: 'valid' }; }).filter(item => item.input); };
  const scopePaths = () => { const paths = new Set(['']); for (const { signal } of hierarchyRows()) { const path = getSource(signal).instancePath || []; for (let index = 1; index <= path.length; index++) paths.add(path.slice(0, index).join('.')); } return [...paths].sort((a, b) => a.length - b.length || a.localeCompare(b)).map(value => value ? value.split('.') : []); };
  const normalizeScope = scope => Array.isArray(scope) ? [...scope].filter(Boolean) : String(scope || '').split('.').filter(Boolean);
  const scopeKey = scope => normalizeScope(scope).join('.');
  const isValidScope = scope => { const key = scopeKey(scope); return !key || scopePaths().some(candidate => candidate.join('.') === key); };
  controller.repairScope = () => { if (!isValidScope(model.view.scope)) model.view.scope = []; return model.view.scope; };
  controller.hierarchy = { parseFullPath, previewBatch, getFullPath: fullPath, getRelativePath: relativePath, getDisplayLabel: signalLabel, getRows: hierarchyRows, getScopePaths: scopePaths, isValidScope };
  controller.ensureCanonicalSource = ensureCanonicalSource;
  controller.actions.setPathDisplayMode = mode => { if (!Object.values(PATH_DISPLAY_MODES).includes(mode)) return false; return transactionRun('Change path display mode', () => { model.document.layout.pathDisplayMode = mode; }); };
  controller.actions.setScope = scope => { const next = normalizeScope(scope); if (!isValidScope(next)) return false; model.view.scope = next; render(); controller.viewRibbon?.refresh?.(); return true; };
  controller.actions.setLeftPanelMode = mode => { if (!['group', 'hierarchy'].includes(mode)) return false; model.view.leftPanelMode = mode; render(); return true; };
  controller.actions.setInstancePathAlignment = alignment => { if (!['left', 'center', 'right'].includes(alignment)) return false; return transactionRun('Align instance path column', () => { model.document.layout.instancePathAlign = alignment; }); };
  controller.actions.setDisplayName = (signalId, name) => { const signal = getSignal(signalId); if (!signal || typeof name !== 'string' || !name.trim()) return false; return transactionRun('Change signal display name', () => { ensureCanonicalSource(signal); signal.display = { ...(signal.display || {}), name: name.trim() }; }); };
  const inspectorStyleFields = new Set(['textColor', 'backgroundColor', 'fontFamily', 'fontSize', 'bold', 'italic', 'underline', 'strikethrough', 'align', 'waveformColor', 'timingRowBackground']);
  controller.actions.updateSignalStyle = (signalId, field, rawValue) => { const signal = getSignal(signalId); if (!signal || !inspectorStyleFields.has(field)) return false; const value = ['fontSize'].includes(field) ? Number(rawValue) : ['bold', 'italic', 'underline', 'strikethrough'].includes(field) ? Boolean(rawValue) : String(rawValue ?? ''); if (field === 'fontSize' && (!Number.isFinite(value) || value < 8 || value > 48)) return false; if (field === 'align' && !['left', 'center', 'right'].includes(value)) return false; return transactionRun(`Update signal style ${field}`, () => { signal.display = { ...(signal.display || {}), style: { ...(signal.display?.style || {}), [field]: value } }; }); };
  controller.actions.setSignalType = (signalId, type) => { const signal = getSignal(signalId); if (!signal || !['binary', 'bus', 'state', 'clock'].includes(type) || signal.type === 'commentRow') return false; if (signal.type === type) return true; return transactionRun('Change signal type', () => { signal.type = type; if (type === 'clock') { delete signal.values; signal.generator = { ...(signal.generator || { start: 0, period: 1, duty: 0.5, phase: 0, initial: 0, polarity: 'positive' }) }; signal.edgeCounter = { ...(signal.edgeCounter || { show: false, mode: 'rising', startNumber: 1, countFrom: 'signal-start', labelEvery: 1, position: 'above', offset: { x: 0, y: -6 } }) }; } else { delete signal.generator; delete signal.edgeCounter; if (!Array.isArray(signal.values) || !signal.values.length) signal.values = [{ start: 0, value: type === 'state' ? 'IDLE' : type === 'bus' ? '00' : 0 }]; if (type === 'bus' && !signal.width) signal.width = 8; } }); };
  controller.actions.addSignalsFromPaths = (text, options = {}) => {
    const preview = previewBatch(text); const valid = preview.filter(item => item.status === 'valid'); if (!valid.length) return { added: [], preview };
    const group = model.document.signalGroups.find(item => item.id === options.groupId) || model.document.signalGroups[0];
    const added = [];
    const committed = transactionRun('Bulk add hierarchical signals', () => {
      for (const item of valid) { const base = item.signalName + (item.msb === undefined ? '' : `[${item.msb}:${item.lsb}]`); let id = base; let suffix = 2; while (model.document.signals.some(signal => signal.id === id)) id = `${base}_${suffix++}`; const signal = { id, name: base, type: options.type || (item.msb === undefined ? 'binary' : 'bus'), role: options.role || 'internal', source: { instancePath: [...item.instancePath], signalName: item.signalName, ...(item.msb === undefined ? {} : { msb: item.msb, lsb: item.lsb }) }, display: { name: item.signalName }, ...(item.msb === undefined ? { values: [{ start: 0, value: 0 }] } : { width: item.width, displayFormat: 'hex', values: [{ start: 0, value: '0' }] }) }; model.document.signals.push(signal); group.rows.push(id); added.push(id); }
    });
    return committed ? { added, preview } : { added: [], preview };
  };
  const renderHierarchy = () => {
    const host = document.querySelector('#groups'); if (!host) return;
    if (model.view.leftPanelMode !== 'hierarchy') { if (host.dataset.hierarchyMode === 'true') { host.innerHTML = host.dataset.groupMarkup || host.innerHTML; delete host.dataset.hierarchyMode; } return; }
    host.dataset.hierarchyMode = 'true';
    const tree = new Map();
    for (const { signal } of hierarchyRows()) { const path = getSource(signal).instancePath || []; let node = tree; for (const part of path) { if (!node.has(part)) node.set(part, { children: new Map(), signals: [] }); node = node.get(part).children; } if (!node.has('__signals')) node.set('__signals', { children: new Map(), signals: [] }); node.get('__signals').signals.push(signal); }
    const esc = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
    const icon = signal => signal.role === 'output' ? 'o' : signal.role === 'internal' ? 'wire' : 'i';
    const labelParts = signal => { const source = getSource(signal); const path = source.instancePath || []; const mode = model.document.layout.pathDisplayMode || 'signalOnly'; const scope = model.view.scope || []; let visiblePath = []; if (mode === 'full') visiblePath = path; else if (mode === 'relative') { let index = 0; while (index < scope.length && index < path.length && scope[index] === path[index]) index++; visiblePath = path.slice(index); } const range = getBusRange(signal); const name = esc(String(signal.display?.name || source.signalName).replace(/\[\d+\s*:\s*\d+\]$/, '')); return `${visiblePath.length ? `<span class="instance-path-part hierarchy-instance-column">${esc(visiblePath.join('.'))}.</span>` : ''}<span class="signal-name-part">${name}</span>${range ? `<span class="bus-width-part bus-width-column">${esc(range)}</span>` : ''}`; };
    const renderNode = (node, depth = 0) => [...node.entries()].flatMap(([name, value]) => name === '__signals' ? value.signals.map(signal => `<div class="row ${model.selection.id === signal.id ? 'selected' : ''}" data-signal="${esc(signal.id)}" data-kind="${esc(signal.type)}" style="padding-left:${18 + depth * 14}px"><span class="role ${signal.role === 'output' ? 'out' : signal.role === 'internal' ? 'wire' : 'in'}">${icon(signal)}</span><span class="row-name" title="${esc(fullPath(signal))}">${labelParts(signal)}</span><span class="eye"><svg aria-hidden="true"><use href="icons.svg#${signal.display?.visible === false ? 'i-eye-off' : 'i-eye'}"></use></svg></span><span class="more">⋮</span></div>`) : `<div class="group-h" style="padding-left:${8 + depth * 14}px"><span class="chev">⌄</span>${esc(name)}</div>${renderNode(value.children, depth + 1)}`).join('');
    host.innerHTML = `<div class="group hierarchy-root"><div class="group-h"><span class="chev">⌄</span>Hierarchy<div class="spacer"></div><span>⋮</span></div>${renderNode(tree)}</div>`;
    host.querySelectorAll('.row[data-signal]').forEach(row => row.addEventListener('click', () => controller.actions.selectObject(row)));
  };
  const appendHierarchyInspector = () => {
    const host = document.querySelector('#inspectorBody'); const signal = getSignal(model.selection?.id); if (!host || !signal || model.view.leftPanelMode !== 'hierarchy' && (model.document.layout.pathDisplayMode || 'signalOnly') === 'signalOnly') return;
    if (host.querySelector('[data-hierarchy-inspector]')) return;
    const source = getSource(signal); const section = document.createElement('div'); section.className = 'section'; section.dataset.hierarchyInspector = 'true';
    const heading = document.createElement('h3'); heading.textContent = 'Source / Hierarchy'; section.appendChild(heading);
    const addProperty = (label, value, { title, input } = {}) => { const row = document.createElement('div'); row.className = 'prop'; const name = document.createElement('span'); name.textContent = label; row.appendChild(name); if (input) { const field = document.createElement('input'); field.dataset.hierarchyDisplayName = 'true'; field.value = String(value ?? ''); row.appendChild(field); } else { const content = document.createElement('b'); content.textContent = String(value ?? ''); if (title) content.title = String(title); row.appendChild(content); } section.appendChild(row); };
    const instancePath = (source.instancePath || []).join('.') || '(flat)'; const full = fullPath(signal); addProperty('Instance Path', instancePath, { title: full }); addProperty('Signal', source.signalName); addProperty('Bus Width', getBusRange(signal) || '—'); addProperty('Display Name', signal.display?.name || source.signalName, { input: true }); addProperty('Path Display', model.document.layout.pathDisplayMode || 'signalOnly'); addProperty('Relative Preview', relativePath(signal));
    const reveal = document.createElement('button'); reveal.type = 'button'; reveal.dataset.hierarchyAction = 'reveal'; reveal.textContent = 'Hierarchyで表示'; section.appendChild(reveal); reveal.addEventListener('click', () => controller.actions.setLeftPanelMode('hierarchy')); section.querySelector('[data-hierarchy-display-name]').addEventListener('change', event => controller.actions.setDisplayName(signal.id, event.target.value)); host.appendChild(section);
  };
  const ensurePathMenu = () => {
    const menu = document.querySelector('#addMenu'); if (!menu || menu.querySelector('[data-hierarchy-command]')) return;
    menu.insertAdjacentHTML('beforeend', '<div class="menuitem" data-hierarchy-command="full-path">フルパス確認</div><div class="menuitem" data-hierarchy-command="bulk-add">信号一括登録</div><div class="menuitem" data-hierarchy-command="group-view">グループ表示</div><div class="menuitem" data-hierarchy-command="hierarchy-view">階層表示</div>');
    menu.addEventListener('click', event => { const command = event.target.closest('[data-hierarchy-command]')?.dataset.hierarchyCommand; if (command === 'full-path' || command === 'bulk-add') { menu.classList.remove('show'); openFullPathDialog(command === 'bulk-add'); } });
    menu.addEventListener('click', event => { const command = event.target.closest('[data-hierarchy-command]')?.dataset.hierarchyCommand; if (command === 'group-view' || command === 'hierarchy-view') { menu.classList.remove('show'); controller.actions.setLeftPanelMode(command === 'hierarchy-view' ? 'hierarchy' : 'group'); } });
    const more = document.querySelector('.left-panel .panel-head .iconbtn:last-child'); more?.addEventListener('click', event => { event.stopPropagation(); const rect = more.getBoundingClientRect(); menu.style.left = `${rect.left}px`; menu.style.top = `${rect.bottom + 4}px`; menu.classList.toggle('show'); });
  };
  const openFullPathDialog = bulkMode => {
    document.querySelector('[data-full-path-dialog]')?.remove(); const dialog = document.createElement('div'); dialog.dataset.fullPathDialog = 'true'; dialog.style.cssText = 'position:fixed;z-index:2000;inset:8% 8%;background:#fff;border:1px solid #b8c5d4;box-shadow:0 10px 30px #0003;border-radius:6px;padding:16px;overflow:auto;font:13px sans-serif;color:#243047;';
    const safe = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
    const rowsHtml = () => hierarchyRows().map(({ signal, group }) => { const source = getSource(signal); const full = fullPath(signal); return `<tr data-path-row="${safe(signal.id)}"><td>${safe(signal.role)}</td><td>${safe(group?.name || '—')}</td><td>${safe((source.instancePath || []).join('.') || '—')}</td><td>${safe(source.signalName)}</td><td>${safe(getBusRange(signal) || '—')}</td><td title="${safe(full)}">${safe(full)}</td><td>${safe(signal.display?.name || source.signalName)}</td></tr>`; }).join('');
    dialog.innerHTML = `<div style="display:flex;align-items:center;gap:8px"><h2 style="margin:0;flex:1">フルパス確認</h2><button type="button" data-path-close>閉じる</button></div><div style="display:flex;gap:8px;margin:12px 0"><input data-path-search placeholder="検索" style="flex:1"><button type="button" data-path-copy>選択パスをコピー</button></div><div data-path-bulk style="display:${bulkMode ? 'block' : 'none'};margin-bottom:12px"><textarea data-path-input rows="3" placeholder="Full Pathを複数行貼り付け"></textarea><button type="button" data-path-preview>Preview</button><button type="button" data-path-add>＋ 信号を追加</button><pre data-path-preview-output style="white-space:pre-wrap"></pre></div><table style="width:100%;border-collapse:collapse"><thead><tr><th>Role</th><th>Group</th><th>Instance Path</th><th>Signal Name</th><th>Bus Width</th><th>Full Path</th><th>Display Name</th></tr></thead><tbody data-path-rows>${rowsHtml()}</tbody></table>`;
    document.body.appendChild(dialog); dialog.querySelector('[data-path-close]').addEventListener('click', () => dialog.remove()); dialog.querySelector('[data-path-search]').addEventListener('input', event => { const query = event.target.value.toLowerCase(); dialog.querySelectorAll('[data-path-row]').forEach(row => { row.hidden = !row.textContent.toLowerCase().includes(query); }); }); dialog.querySelector('[data-path-copy]').addEventListener('click', async () => { const values = [...dialog.querySelectorAll('[data-path-row]:not([hidden])')].map(row => row.children[5].textContent); await navigator.clipboard?.writeText(values.join('\n')); }); dialog.querySelector('[data-path-rows]').addEventListener('dblclick', event => { const row = event.target.closest('[data-path-row]'); if (row) { controller.actions.selectObject({ dataset: { signal: row.dataset.pathRow, kind: 'signal' } }); dialog.remove(); } }); const previewOutput = dialog.querySelector('[data-path-preview-output]'); dialog.querySelector('[data-path-preview]')?.addEventListener('click', () => { const result = previewBatch(dialog.querySelector('[data-path-input]').value); previewOutput.textContent = result.map(item => `${item.status.toUpperCase()} line ${item.line}: ${item.input}${item.reason ? ` — ${item.reason}` : ''}`).join('\n'); }); dialog.querySelector('[data-path-add]')?.addEventListener('click', () => { const result = controller.actions.addSignalsFromPaths(dialog.querySelector('[data-path-input]').value); if (result.added.length) { dialog.remove(); openFullPathDialog(false); } else { previewOutput.textContent = result.preview.map(item => `${item.status.toUpperCase()} line ${item.line}: ${item.input}${item.reason ? ` — ${item.reason}` : ''}`).join('\n'); } });
  };
  controller.actions.setTimeRange = (startValue, endValue) => {
    const start = Number(startValue); const end = Number(endValue);
    const current = model.document.timeline;
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start || end > 10000) return false;
    return transactionRun(`Set time range ${start}-${end}`, () => {
      current.start = start;
      current.end = end;
      current.cycleCount = end - start;
    });
  };
  const applyZoom = () => {
    const wave = document.querySelector('#cycleCanvas .wave');
    if (!wave) return;
    const zoom = Number(model.view.zoom || 1);
    wave.style.transformOrigin = 'left top';
    wave.style.transform = zoom === 1 ? '' : `scaleX(${zoom})`;
  };
  controller.actions.selectTransaction = id => { const transaction = model.document.transactions.find(item => item.id === id); if (!transaction) return false; model.selection = { kind: 'transaction', id }; model.crossHighlight = [...(transaction.linkedSignals || [])]; if (model.view.followSelection && !model.view.pinned) model.view.tab = 'transaction'; render(); return true; };
  controller.actions.revealSelection = (options = {}) => {
    const { leftTree = true, cycleRow = true, behavior = 'nearest', id: explicitId } = options;
    const id = explicitId ?? model.selection?.id;
    if (!id) return { revealed: false, reason: 'no-selection' };
    const staleGuard = (model.document.signals.some(item => item.id === id) || (model.document.annotations || []).some(item => item.id === id) || (model.document.transactions || []).some(item => item.id === id));
    if (!staleGuard) return { revealed: false, reason: 'stale-id' };
    const result = { revealed: false, leftTree: null, cycleRow: null };
    if (leftTree) {
      const row = document.querySelector(`#groups .row[data-signal="${CSS.escape(id)}"]`);
      if (!row) result.leftTree = 'not-found';
      else if (row.dataset.filterHidden === 'true') result.leftTree = 'filtered';
      else if (row.hidden && row.closest('.group')?.classList.contains('collapsed')) {
        const header = row.closest('.group')?.querySelector('.group-h');
        header?.scrollIntoView({ block: behavior, inline: 'nearest', behavior: 'auto' });
        if (header) { header.classList.remove('reveal-pulse'); void header.offsetWidth; header.classList.add('reveal-pulse'); }
        result.leftTree = 'group-collapsed';
      } else if (row.hidden) result.leftTree = 'hidden';
      else { row.scrollIntoView({ block: behavior, inline: 'nearest', behavior: 'auto' }); result.leftTree = 'revealed'; result.revealed = true; }
    }
    if (cycleRow) {
      const canvasRow = document.querySelector(`#cycleCanvas .wave-row[data-signal="${CSS.escape(id)}"]`);
      if (!canvasRow) result.cycleRow = 'not-found';
      else if (canvasRow.hidden) result.cycleRow = 'hidden';
      else { canvasRow.scrollIntoView({ block: behavior, inline: 'nearest', behavior: 'auto' }); result.cycleRow = 'revealed'; result.revealed = true; }
    }
    return result;
  };
  const getBookmark = id => (model.document.bookmarks || []).find(bookmark => bookmark.id === id);
  const nextBookmarkId = () => { const used = new Set((model.document.bookmarks || []).map(bookmark => bookmark.id)); for (let index = 1; index < 1_000_000; index += 1) { const id = `bm_${String(index).padStart(3, '0')}`; if (!used.has(id)) return id; } return null; };
  const validBookmarkStart = value => Number.isFinite(Number(value)) && Number(value) >= Number(model.document.timeline.start) && Number(value) <= Number(model.document.timeline.end);
  const bookmarkMutation = (label, mutation) => { const result = controller.documentHistory.run(label, mutation, { render: false }); if (result) { controller.renderBookmarkUi?.(model); controller.renderTransient?.(model); } return result; };
  controller.selectors.getBookmarks = () => model.document.bookmarks || [];
  controller.actions.addBookmark = (start = controller.actions.getCurrentCycle?.() ?? model.timeSelection?.cycle ?? model.document.timeline.start, seed = {}) => {
    const numericStart = Number(start);
    if (!validBookmarkStart(numericStart)) return false;
    const id = seed.id || nextBookmarkId();
    const name = String(seed.name || `Bookmark ${((model.document.bookmarks || []).length || 0) + 1}`).trim();
    if (!id || !name) return false;
    const bookmark = { id, name, start: numericStart, ...(seed.comment !== undefined ? { comment: String(seed.comment) } : {}) };
    return bookmarkMutation('Add bookmark', () => { model.document.bookmarks ??= []; if (model.document.bookmarks.some(item => item.id === id)) return false; model.document.bookmarks.push(bookmark); model.document.bookmarks.sort((a, b) => Number(a.start) - Number(b.start) || String(a.id).localeCompare(String(b.id))); model.selection = { kind: 'bookmark', id }; model.view.tab = 'bookmarks'; });
  };
  controller.actions.updateBookmark = (id, field, value) => {
    const bookmark = getBookmark(id);
    if (!bookmark || !['name', 'comment', 'start'].includes(field)) return false;
    if (field === 'name' && !String(value).trim()) return false;
    if (field === 'start' && !validBookmarkStart(value)) return false;
    return bookmarkMutation(`Update bookmark ${field}`, () => { bookmark[field] = field === 'start' ? Number(value) : String(value); model.document.bookmarks.sort((a, b) => Number(a.start) - Number(b.start) || String(a.id).localeCompare(String(b.id))); model.selection = { kind: 'bookmark', id }; });
  };
  controller.actions.deleteBookmark = id => { if (!getBookmark(id)) return false; return bookmarkMutation('Delete bookmark', () => { model.document.bookmarks = model.document.bookmarks.filter(bookmark => bookmark.id !== id); if (model.selection?.kind === 'bookmark' && model.selection.id === id) model.selection = { kind: 'signal', id: model.document.timeline.referenceClock }; }); };
  controller.actions.revealBookmark = id => {
    const bookmark = getBookmark(id); if (!bookmark) return false;
    model.selection = { kind: 'bookmark', id };
    controller.actions.setCurrentCycle?.(Number(bookmark.start));
    const boundary = controller.getCycleBoundary?.({ signal: model.document.timeline.referenceClock, cycle: Number(bookmark.start), coordinateSpace: 'canvas' });
    const host = window.TimingChartTimingViewport?.getScrollHost?.();
    if (boundary && host) { const rect = host.getBoundingClientRect(); const target = boundary.canvasX - rect.left + host.scrollLeft; if (target < host.scrollLeft || target > host.scrollLeft + host.clientWidth) host.scrollLeft = Math.max(0, target - host.clientWidth / 2); }
    document.dispatchEvent(new CustomEvent('timingchart:bookmark-selected', { detail: { id, start: bookmark.start } }));
    return true;
  };
  const nextTransactionId = () => { const used = new Set((model.document.transactions || []).map(transaction => transaction.id)); for (let index = 1; index <= used.size + 1_000_000; index++) { const id = `txn_${String(index).padStart(3, '0')}`; if (!used.has(id)) return id; } return null; };
  const defaultTransactionPhases = (start, end) => { if (end - start < 2) return [{ name: 'Transaction', start, end }]; const split = start + 1; return [{ name: 'Request', start, end: split }, { name: 'Response', start: split, end }]; };
  const transactionCandidate = seed => {
    const timeline = getTimeline();
    const defaultStart = Number(timeline.start ?? 0);
    const start = Number(seed.start ?? defaultStart);
    const defaultEnd = Math.min(start + 2, Number(timeline.end ?? (defaultStart + 2)));
    const end = Number(seed.end ?? defaultEnd);
    const links = seed.linkedSignals === undefined ? [] : structuredClone(seed.linkedSignals);
    if (!Array.isArray(links) || new Set(links).size !== links.length || links.some(id => !getSignal(id))) return null;
    const id = seed.id === undefined ? nextTransactionId() : String(seed.id);
    if (!id || model.document.transactions.some(transaction => transaction.id === id)) return null;
    const transaction = structuredClone(seed);
    transaction.id = id;
    transaction.name = String(seed.name || `Transaction ${model.document.transactions.length + 1}`);
    transaction.start = start;
    transaction.end = end;
    transaction.lane = seed.lane || 'default';
    transaction.source = seed.source || '';
    transaction.destination = seed.destination || '';
    transaction.phases = structuredClone(seed.phases || defaultTransactionPhases(start, end));
    transaction.linkedSignals = links;
    transaction.comment = seed.comment || '';
    return transaction;
  };
  controller.actions.addTransaction = (seed = {}) => transactionRun('Add transaction', () => { const transaction = transactionCandidate(seed); if (!transaction) return false; model.document.transactions.push(transaction); model.selection = { kind: 'transaction', id: transaction.id }; model.crossHighlight = [...transaction.linkedSignals]; model.view.mode = model.view.mode === 'cycle' ? 'transaction' : model.view.mode; model.view.tab = 'transaction'; });
  controller.actions.duplicateTransaction = id => { const source = model.document.transactions.find(transaction => transaction.id === id); if (!source) return false; const duration = Number(source.end) - Number(source.start); const start = Number(source.end); const end = start + duration; const offset = start - Number(source.start); const phases = (source.phases || []).map(phase => ({ ...structuredClone(phase), start: Number(phase.start) + offset, end: Number(phase.end) + offset })); return controller.actions.addTransaction({ ...structuredClone(source), id: undefined, name: `${source.name} copy`, start, end, phases }); };
  controller.actions.deleteTransaction = id => transactionRun('Delete transaction', () => { const index = model.document.transactions.findIndex(item => item.id === id); if (index < 0) return false; model.document.transactions.splice(index, 1); model.selection = { kind: 'signal', id: model.document.timeline.referenceClock }; model.crossHighlight = []; });
  controller.actions.updateTransaction = (id, field, value) => transactionRun(`Update transaction ${field}`, () => { const transaction = model.document.transactions.find(item => item.id === id); if (!transaction || !['name', 'start', 'end', 'lane', 'source', 'destination', 'comment', 'linkedSignals', 'phases'].includes(field)) return false; if (field === 'linkedSignals') { const ids = Array.isArray(value) ? value : []; transaction.linkedSignals = ids.filter(signalId => { const signal = getSignal(signalId); return signal && signal.type !== 'commentRow'; }); model.crossHighlight = [...transaction.linkedSignals]; return true; } if (field === 'phases') { if (!Array.isArray(value)) return false; transaction.phases = value.map(phase => ({ name: String(phase.name || ''), start: Number(phase.start), end: Number(phase.end) })); return true; } transaction[field] = ['start', 'end'].includes(field) ? Number(value) : String(value); });
  controller.actions.moveTransactionBy = (id, delta) => transactionRun('Reorder transaction', () => { const from = model.document.transactions.findIndex(item => item.id === id); if (from < 0) return false; const to = Math.max(0, Math.min(model.document.transactions.length - 1, from + Number(delta))); if (from === to) return false; const [transaction] = model.document.transactions.splice(from, 1); model.document.transactions.splice(to, 0, transaction); model.selection = { kind: 'transaction', id }; });
  controller.actions.setTransactionRange = (id, start, end) => transactionRun('Set transaction range', () => { const transaction = model.document.transactions.find(item => item.id === id); if (!transaction) return false; const startValue = Number(start); const endValue = Number(end); if (!Number.isInteger(startValue) || !Number.isInteger(endValue) || endValue <= startValue) return false; const offset = startValue - Number(transaction.start); transaction.start = startValue; transaction.end = endValue; if (Array.isArray(transaction.phases) && transaction.phases.length) { const shifted = transaction.phases.map(phase => ({ ...phase, start: Number(phase.start) + offset, end: Number(phase.end) + offset })); const fits = shifted.every(phase => phase.start >= startValue && phase.end <= endValue); transaction.phases = fits ? shifted : []; } });
  controller.actions.setBusWidthAlignment = alignment => { if (!['left', 'center', 'right'].includes(alignment)) return false; return transactionRun('Align bus width column', () => { model.document.layout.busWidthAlign = alignment; }); };
  controller.actions.setBusWidthMode = mode => { if (!['inline', 'alignedColumn'].includes(mode)) return false; return transactionRun('Change bus width display', () => { model.document.layout.busWidthMode = mode; }); };
  controller.actions.setSignalNameAlignment = alignment => { if (!['left', 'center', 'right'].includes(alignment)) return false; return transactionRun('Align signal name column', () => { model.document.layout.signalNameAlign = alignment; }); };
  controller.actions.moveSignal = (signalId, targetGroupId, targetIndex = -1) => transactionRun('Move signal', () => { const source = model.document.signalGroups.find(group => group.rows.includes(signalId)); const target = model.document.signalGroups.find(group => group.id === targetGroupId); if (!source || !target || !model.document.signals.some(signal => signal.id === signalId)) return false; source.rows = source.rows.filter(id => id !== signalId); const index = targetIndex < 0 ? target.rows.length : Math.min(targetIndex, target.rows.length); target.rows.splice(index, 0, signalId); });
  controller.actions.moveGroup = (groupId, targetIndex) => transactionRun('Move group', () => { const index = model.document.signalGroups.findIndex(group => group.id === groupId); if (index < 0 || targetIndex < 0 || targetIndex >= model.document.signalGroups.length) return false; const [group] = model.document.signalGroups.splice(index, 1); model.document.signalGroups.splice(targetIndex, 0, group); });
  controller.actions.setGroupAppearance = (groupId, style) => transactionRun('Update group appearance', () => { const group = model.document.signalGroups.find(item => item.id === groupId); if (!group) return false; group.style = { ...(group.style || {}), ...structuredClone(style) }; });
  const newSignal = (seed = {}) => { const id = seed.id || `signal_${Date.now()}`; const type = seed.type || 'binary'; const name = seed.name || id; const signal = { id, name, type, role: seed.role || 'internal', values: structuredClone(seed.values || [{ start: 0, value: type === 'state' ? 'IDLE' : type === 'bus' ? '00' : 0 }]) }; if (type === 'clock') { delete signal.values; signal.generator = structuredClone(seed.generator || { start: 0, period: 1, duty: 0.5, phase: 0, initial: 0, polarity: 'positive' }); signal.edgeCounter = structuredClone(seed.edgeCounter || { show: false, mode: 'rising', startNumber: 1, countFrom: 'signal-start', labelEvery: 1, position: 'above', offset: { x: 0, y: -6 } }); } return ensureCanonicalSource({ ...signal, ...structuredClone(seed), id, name, type }); };
  controller.actions.addGroup = (name = '新しいグループ', options = {}) => transactionRun('Add group', () => { const id = options.id || `group_${Date.now()}`; model.document.signalGroups.push({ id, name: String(name), rows: [], style: structuredClone(options.style || { background: '#eef5ff', opacity: 0.35, extend: 'both', showHeader: true }), spacers: [], spacingBefore: Number(options.spacingBefore || 0), spacingAfter: Number(options.spacingAfter || 0) }); model.selection = { kind: 'group', id }; });
  controller.actions.addSignal = (seed = {}, groupId = model.document.signalGroups[0]?.id) => transactionRun('Add signal', () => { const group = model.document.signalGroups.find(item => item.id === groupId) || model.document.signalGroups[0]; if (!group) return false; const signal = newSignal(seed); if (model.document.signals.some(item => item.id === signal.id)) return false; model.document.signals.push(signal); group.rows.push(signal.id); model.selection = { kind: 'signal', id: signal.id }; });
  controller.actions.addCommentRow = (seed = {}, groupId = model.document.signalGroups[0]?.id) => transactionRun('Add comment row', () => { const group = model.document.signalGroups.find(item => item.id === groupId) || model.document.signalGroups[0]; if (!group) return false; const id = seed.id || `comment_${Date.now()}`; if (model.document.signals.some(item => item.id === id)) return false; model.document.signals.push({ id, type: 'commentRow', title: seed.title || 'Comment', body: seed.body || '', groupId: group.id }); group.rows.push(id); model.selection = { kind: 'comment', id }; });
  controller.actions.duplicateSignal = signalId => transactionRun('Duplicate signal', () => { const source = getSignal(signalId); const group = model.document.signalGroups.find(item => (item.rows || []).includes(signalId)); if (!source || !group) return false; const copy = structuredClone(source); let id = `${source.id}_copy`; let index = 2; while (model.document.signals.some(item => item.id === id)) id = `${source.id}_copy${index++}`; copy.id = id; copy.display = { ...(copy.display || {}), name: copy.display?.name || copy.name }; model.document.signals.push(copy); const rowIndex = group.rows.indexOf(signalId); group.rows.splice(rowIndex + 1, 0, id); model.selection = { kind: 'signal', id }; });
  controller.actions.deleteSignal = signalId => transactionRun('Delete signal', () => { const signal = model.document.signals.find(item => item.id === signalId); if (!signal || signal.id === model.document.timeline.referenceClock) return false; for (const group of model.document.signalGroups) group.rows = (group.rows || []).filter(id => id !== signalId); model.document.signals = model.document.signals.filter(item => item.id !== signalId); model.selection = { kind: 'signal', id: model.document.timeline.referenceClock }; });
  controller.actions.setSignalRole = (signalId, role) => { if (!['input', 'output', 'internal'].includes(role)) return false; return transactionRun('Change signal role', () => { const signal = model.document.signals.find(item => item.id === signalId); if (!signal || signal.type === 'commentRow') return false; signal.role = role; }); };
  controller.actions.moveSignalBy = (signalId, delta) => incrementalRun('Reorder signal', () => { const group = model.document.signalGroups.find(item => (item.rows || []).includes(signalId)); if (!group) return false; const from = group.rows.indexOf(signalId); const to = Math.max(0, Math.min(group.rows.length - 1, from + Number(delta))); if (from === to) return false; group.rows.splice(from, 1); group.rows.splice(to, 0, signalId); }, () => reconcileSignalOrder(signalId, delta));
  controller.actions.setSignalSpacing = (signalId, field, value) => { if (!['spacingBefore', 'spacingAfter'].includes(field) || Number(value) < 0) return false; return transactionRun('Update signal spacing', () => { const signal = model.document.signals.find(item => item.id === signalId); if (!signal) return false; signal[field] = Number(value); }); };
  controller.actions.setGroupSpacing = (groupId, field, value) => { if (!['spacingBefore', 'spacingAfter'].includes(field) || Number(value) < 0) return false; return transactionRun('Update group spacing', () => { const group = model.document.signalGroups.find(item => item.id === groupId); if (!group) return false; group[field] = Number(value); }); };
  controller.actions.setGlobalSignalSpacing = value => { const spacing = Number(value); if (!Number.isFinite(spacing) || spacing < 0 || spacing > 48) return false; return transactionRun('Update row spacing', () => { model.document.layout.signalSpacing = spacing; }); };
  controller.actions.setGroupSpacingValues = (groupId, before, after) => { const spacingBefore = Number(before); const spacingAfter = Number(after); if (!Number.isFinite(spacingBefore) || !Number.isFinite(spacingAfter) || spacingBefore < 0 || spacingAfter < 0 || spacingBefore > 48 || spacingAfter > 48) return false; return transactionRun('Update group spacing', () => { const group = model.document.signalGroups.find(item => item.id === groupId); if (!group) return false; group.spacingBefore = spacingBefore; group.spacingAfter = spacingAfter; }); };
  controller.actions.autoLayout = () => transactionRun('Auto layout', () => {
    const layout = model.document.layout;
    const clamp = (value, min, max, fallback) => { const number = Number(value); return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback; };
    layout.signalSpacing = 6;
    layout.rowHeight = clamp(layout.rowHeight, 20, 80, 28);
    layout.roleColumnWidth = clamp(layout.roleColumnWidth, 24, 64, 32);
    layout.signalNameWidth = clamp(layout.signalNameWidth, 120, 360, 168);
    layout.instancePathWidth = clamp(layout.instancePathWidth, 120, 360, 180);
    for (const group of model.document.signalGroups || []) { group.spacingBefore = clamp(group.spacingBefore, 0, 48, 0); group.spacingAfter = clamp(group.spacingAfter, 0, 48, 0); }
    for (const signal of model.document.signals || []) { if (signal.spacingBefore !== undefined) signal.spacingBefore = clamp(signal.spacingBefore, 0, 48, 0); if (signal.spacingAfter !== undefined) signal.spacingAfter = clamp(signal.spacingAfter, 0, 48, 0); }
    return true;
  });
  controller.actions.setGroupCollapsed = (groupId, collapsed) => transactionRun('Toggle group collapse', () => { const group = model.document.signalGroups.find(item => item.id === groupId); if (!group) return false; group.collapsed = Boolean(collapsed); });
  const timeGroupById = id => (model.document.timeGroups || []).find(group => group.id === id);
  const timeGroupRange = (start, end) => Number.isFinite(Number(start)) && Number.isFinite(Number(end)) && Number(start) >= Number(model.document.timeline.start ?? 0) && Number(end) <= Number(model.document.timeline.end ?? model.document.timeline.cycleCount ?? 0) && Number(start) < Number(end);
  const partiallyOverlapsTimeGroup = (start, end, ignoreId = '') => (model.document.timeGroups || []).some(group => {
    if (group.id === ignoreId) return false;
    const a = Number(start); const b = Number(end); const c = Number(group.start); const d = Number(group.end);
    return a < d && c < b && !((a === c && b === d) || b === c || d === a) && ((a < c && c < b && b < d) || (c < a && a < d && d < b));
  });
  const nextTimeGroupId = () => { let index = (model.document.timeGroups || []).length + 1; let id = `tg_${String(index).padStart(3, '0')}`; while ((model.document.timeGroups || []).some(group => group.id === id)) id = `tg_${String(++index).padStart(3, '0')}`; return id; };
  const normalizeTimeGroupPresentation = presentation => {
    const value = structuredClone(presentation || {});
    if (value.collapsed !== undefined) value.collapsed = Boolean(value.collapsed);
    if (value.foldStyle !== undefined && !['none', 'compact', 'axis-break'].includes(value.foldStyle)) value.foldStyle = 'none';
    if (value.displayAfter) {
      value.displayAfter = { mode: value.displayAfter.mode === 'rebase' ? 'rebase' : 'source', ...(value.displayAfter.value === undefined ? {} : { value: Number(value.displayAfter.value) }) };
    }
    return value;
  };
  controller.selectors.getTimeGroups = ({ sort = 'start', category = '' } = {}) => {
    const groups = (model.document.timeGroups || []).filter(group => !category || String(group.category || '') === String(category));
    const sorted = groups.map((group, index) => ({ ...group, duration: Number(group.end) - Number(group.start), state: group.presentation?.collapsed ? 'Collapsed' : 'Expanded', order: index }));
    const compare = sort === 'name' ? (a, b) => String(a.name).localeCompare(String(b.name)) : sort === 'category' ? (a, b) => String(a.category || '').localeCompare(String(b.category || '')) : sort === 'duration' ? (a, b) => a.duration - b.duration : (a, b) => Number(a.start) - Number(b.start) || a.order - b.order;
    return sorted.sort(compare).map((group, index, all) => ({ ...group, gap: index ? Number(group.start) - Number(all[index - 1].end) : null, sameCategoryDurationDelta: index && String(group.category || '') === String(all[index - 1].category || '') ? group.duration - all[index - 1].duration : null }));
  };
  controller.actions.addTimeGroup = (seed = {}) => {
    const start = Number(seed.start ?? model.timeSelection?.rangeStart); const end = Number(seed.end ?? model.timeSelection?.rangeEnd);
    if (!timeGroupRange(start, end)) { model.validation = [{ code: 'invalid-time-group', message: '有効な時間範囲を選択してください' }]; controller.render(); return false; }
    if (partiallyOverlapsTimeGroup(start, end)) { model.validation = [{ code: 'overlapping-time-groups', message: 'Time Groupの部分重複は許可されません' }]; controller.render(); return false; }
    return transactionRun('Create time group', () => {
      const group = { id: seed.id || nextTimeGroupId(), name: String(seed.name || `Time Group ${(model.document.timeGroups || []).length + 1}`).trim(), start, end, ...(seed.category ? { category: String(seed.category) } : {}), ...(seed.comment ? { comment: String(seed.comment) } : {}), ...(seed.presentation ? { presentation: normalizeTimeGroupPresentation(seed.presentation) } : {}) };
      if (!group.name || (model.document.timeGroups || []).some(item => item.id === group.id)) return false;
      model.document.timeGroups ??= []; model.document.timeGroups.push(group); model.selection = { kind: 'timeGroup', id: group.id }; return true;
    });
  };
  controller.actions.updateTimeGroup = (id, field, value) => {
    const group = timeGroupById(id); if (!group) return false;
    const next = structuredClone(group); const presentationFields = new Set(['collapsed', 'foldStyle', 'foldLabel', 'displayAfter.mode', 'displayAfter.value']);
    if (presentationFields.has(field)) { next.presentation = normalizeTimeGroupPresentation(next.presentation); if (field === 'collapsed') next.presentation.collapsed = Boolean(value); else if (field === 'foldStyle') next.presentation.foldStyle = String(value); else if (field === 'foldLabel') next.presentation.foldLabel = String(value); else { next.presentation.displayAfter ??= { mode: 'source' }; if (field === 'displayAfter.mode') next.presentation.displayAfter.mode = value === 'rebase' ? 'rebase' : 'source'; else next.presentation.displayAfter.value = Number(value); } }
    else if (field === 'start' || field === 'end') next[field] = Number(value); else if (field === 'name') next.name = String(value).trim(); else if (field === 'category' || field === 'comment') next[field] = String(value ?? ''); else return false;
    if (!next.name || !timeGroupRange(next.start, next.end) || partiallyOverlapsTimeGroup(next.start, next.end, id)) { model.validation = [{ code: 'invalid-time-group-edit', id, message: 'Time Groupの範囲または重複が不正です' }]; controller.render(); return false; }
    return transactionRun(`Update time group ${field}`, () => { Object.assign(group, next); });
  };
  controller.actions.setTimeGroupCollapsed = (id, collapsed) => controller.actions.updateTimeGroup(id, 'collapsed', collapsed);
  controller.actions.deleteTimeGroup = id => transactionRun('Delete time group', () => { const index = (model.document.timeGroups || []).findIndex(group => group.id === id); if (index < 0) return false; model.document.timeGroups.splice(index, 1); model.selection = { kind: 'signal', id: model.document.timeline.referenceClock }; return true; });
  controller.actions.revealTimeGroup = id => { const group = timeGroupById(id); if (!group) return false; model.timeSelection = { ...(model.timeSelection || {}), cycle: Number(group.start), rangeStart: Number(group.start), rangeEnd: Number(group.end), source: 'time-group-reveal' }; controller.scheduleTransientLayout?.(model); return true; };
  controller.actions.setGroupName = (groupId, name) => { if (!String(name || '').trim()) return false; return transactionRun('Rename group', () => { const group = model.document.signalGroups.find(item => item.id === groupId); if (!group) return false; group.name = String(name).trim(); }); };
  controller.actions.moveGroupBy = (groupId, delta) => transactionRun('Reorder group', () => { const from = model.document.signalGroups.findIndex(item => item.id === groupId); const to = Math.max(0, Math.min(model.document.signalGroups.length - 1, from + Number(delta))); if (from < 0 || from === to) return false; const [group] = model.document.signalGroups.splice(from, 1); model.document.signalGroups.splice(to, 0, group); });
  controller.actions.deleteGroup = groupId => transactionRun('Delete group', () => { if (model.document.signalGroups.length <= 1) return false; const index = model.document.signalGroups.findIndex(item => item.id === groupId); if (index < 0 || (model.document.signalGroups[index].rows || []).length) return false; model.document.signalGroups.splice(index, 1); model.selection = { kind: 'signal', id: model.document.timeline.referenceClock }; });
  controller.actions.setLegendVisible = visible => transactionRun('Change legend visibility', () => { model.document.legend.show = Boolean(visible); });
  controller.actions.setLegendOrientation = orientation => { if (!['horizontal', 'vertical'].includes(orientation)) return false; return transactionRun('Change legend orientation', () => { model.document.legend.orientation = orientation; }); };
  controller.actions.addSpacer = (groupId, height = 16, index = -1) => transactionRun('Add spacer', () => { const group = model.document.signalGroups.find(item => item.id === groupId); if (!group) return false; group.spacers ??= []; const spacer = { id: `spacer_${Date.now()}`, height: Math.max(1, Number(height)) }; if (index < 0) group.spacers.push(spacer); else group.spacers.splice(index, 0, spacer); });
  controller.actions.updateDocumentRegion = (region, field, value) => transactionRun(`Update document ${region}.${field}`, () => { if (!['header', 'footer'].includes(region)) return false; model.document.document[region] ??= {}; model.document.document[region][field] = Array.isArray(value) ? structuredClone(value) : String(value); });
  controller.actions.moveLegend = (dx, dy) => transactionRun('Move legend', () => { model.document.legend.position ??= { x: 0, y: 0 }; model.document.legend.position.x += Number(dx); model.document.legend.position.y += Number(dy); });
  controller.formatDocumentText = (text, maxChars = 80) => String(text || '').split(/\r?\n/).flatMap(line => { const words = line.trim().split(/\s+/).filter(Boolean); const lines = []; let current = ''; for (const word of words) { if (current && current.length + 1 + word.length > maxChars) { lines.push(current); current = word; } else current = current ? `${current} ${word}` : word; } if (current) lines.push(current); return lines; });
  controller.exportSvg = ({ startCycle = 0, endCycle = model.document.timeline.cycleCount } = {}) => { const canvas = document.querySelector('#cycleCanvas'); if (!canvas) return ''; const rect = canvas.getBoundingClientRect(); const reference = getReferenceClock(); const start = controller.getCycleBoundary?.({ signal: reference?.id, cycle: Number(startCycle), coordinateSpace: 'canvas' }); const end = controller.getCycleBoundary?.({ signal: reference?.id, cycle: Number(endCycle), coordinateSpace: 'canvas' }); const left = start?.canvasX ?? rect.left; const right = end?.canvasX ?? rect.right; const width = Math.max(1, right - left); const fragments = [...canvas.querySelectorAll('svg')].map(svg => { const box = svg.getBoundingClientRect(); const clone = svg.cloneNode(true); clone.removeAttribute('style'); clone.setAttribute('x', box.left - left); clone.setAttribute('y', box.top - rect.top); clone.setAttribute('width', box.width); clone.setAttribute('height', box.height); return clone.outerHTML; }).join(''); const header = model.document.document.header || {}; const footer = model.document.document.footer || {}; const title = String(model.document.document.title || 'Timing Chart').replace(/[<>&\"']/g, ''); const subtitle = String(header.subtitle || '').replace(/[<>&\"']/g, ''); const footerText = String(footer.text || '').replace(/[<>&\"']/g, ''); return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${rect.height}" viewBox="0 0 ${width} ${rect.height}" data-export-selected-range="${startCycle}-${endCycle}"><title>${title}</title><text x="8" y="18" font-family="sans-serif" font-size="14">${title}</text><text x="8" y="36" font-family="sans-serif" font-size="11">${subtitle}</text>${fragments}<text x="8" y="${Math.max(48, rect.height - 8)}" font-family="sans-serif" font-size="10">${footerText}</text></svg>`; };
  controller.export = async (format, options = {}) => { const svg = controller.exportSvg(options); if (format === 'svg' || format === 'clipboard-svg') return { format, text: svg }; if (format === 'pdf') return { format, action: 'print', text: svg }; if (format === 'png' || format === 'clipboard-png') { const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`; return { format, dataUrl, source: svg }; } return { format, text: svg }; };
  const setValidation = issues => { model.validation = issues; };
  const canonicalize = signal => signal.values.sort((a, b) => Number(a.start) - Number(b.start));
  const validateValue = (signal, index, candidate) => { const issues = []; const start = Number(candidate.start); if (!Number.isInteger(start) || start < 0) issues.push({ field: 'start', code: 'negative-or-non-integer' }); if (start >= getTimeline().cycleCount) issues.push({ field: 'start', code: 'outside-document' }); if (signal.values.some((value, valueIndex) => valueIndex !== index && Number(value.start) === start)) issues.push({ field: 'start', code: 'duplicate-start' }); if (signal.type === 'binary' && !['0', '1', 'X', 'Z', 'x', 'z'].includes(String(candidate.value))) issues.push({ field: 'value', code: 'invalid-binary' }); if (signal.type === 'bus') { const literal = parseSignalLiteral(candidate.value, signal); if (!literal.valid) issues.push({ field: 'value', code: literal.overflow ? 'bus-width-overflow' : 'invalid-bus-literal', requiredBits: literal.requiredBits, message: literal.error }); } return issues; };
  const valueFromInput = (signal, value, field) => field === 'start' ? Number(value) : field === 'value' && signal.type === 'binary' && /^[01]$/.test(value) ? Number(value) : value;
   controller.actions.updateSignalValue = (signalId, index, field, rawValue) => { const signal = getSignal(signalId); if (!signal || !signal.values[index]) return false; const candidate = { ...signal.values[index], [field]: valueFromInput(signal, rawValue, field) }; const issues = validateValue(signal, index, candidate); if (issues.length) { setValidation(issues); render(); return false; } return transactionRun(`Change signal ${field}`, () => { signal.values[index] = candidate; canonicalize(signal); model.editor.rowIndex = signal.values.indexOf(candidate); setValidation([]); }); };
   controller.getSignalConfig = signalId => { const signal = getSignal(signalId); return signal ? structuredClone({ formatVersion: '1.0.0', signal }) : null; };
   controller.actions.importSignalConfig = (signalId, payload) => { const signal = getSignal(signalId); const incoming = payload?.signal || payload; if (!signal || signal.type === 'commentRow' || !incoming || typeof incoming !== 'object') return false; const allowed = ['type', 'values', 'width', 'displayFormat', 'generator', 'edgeCounter', 'source', 'display']; const next = structuredClone(incoming); if (next.type !== signal.type || (next.type !== 'clock' && (!Array.isArray(next.values) || !next.values.length))) return false; return transactionRun('Import signal configuration', () => { for (const field of allowed) if (Object.prototype.hasOwnProperty.call(next, field)) signal[field] = structuredClone(next[field]); signal.id = signalId; }); };
  const nextSignalValueInsertion = signalId => { const signal = getSignal(signalId); if (!signal || !Array.isArray(signal.values) || signal.type === 'commentRow') return null; const values = [...signal.values].sort((a, b) => Number(a.start) - Number(b.start)); const selectedIndex = Number.isInteger(model.editor?.rowIndex) && model.editor.rowIndex >= 0 && model.editor.rowIndex < values.length ? model.editor.rowIndex : values.length - 1; const anchor = Number(values[selectedIndex]?.start ?? values.at(-1)?.start ?? 0); const occupied = new Set(values.map(value => Number(value.start))); let start = Math.max(1, anchor + 1); const limit = Number(getTimeline().cycleCount) - 1; while (start <= limit && occupied.has(start)) start += 1; return start <= limit ? { start, index: selectedIndex } : null; };
  controller.getNextSignalValueInsertion = signalId => nextSignalValueInsertion(signalId)?.start ?? null;
  controller.actions.addSignalValue = signalId => { const signal = getSignal(signalId); if (!signal) return false; const insertion = nextSignalValueInsertion(signalId); if (!insertion) { setValidation([{ field: 'start', code: 'no-available-change-point', message: '変更点を追加できる空きcycleがありません' }]); render(); return false; } const { start } = insertion; return transactionRun('Add signal value', () => { signal.values.push({ start, value: signal.type === 'binary' ? 0 : signal.type === 'state' ? 'IDLE' : '00', comment: '' }); canonicalize(signal); model.editor.rowIndex = signal.values.findIndex(value => Number(value.start) === start); setValidation([]); }); };
  controller.actions.duplicateSignalValue = (signalId, index) => { const signal = getSignal(signalId); if (!signal || !signal.values[index]) return false; const start = Number(signal.values[index].start) + 1; if (start >= getTimeline().cycleCount || signal.values.some(value => Number(value.start) === start)) return false; const duplicate = { ...signal.values[index], start }; return transactionRun('Duplicate signal value', () => { model.editor.draft = { signalId, sourceIndex: index, value: structuredClone(duplicate) }; signal.values.push(duplicate); canonicalize(signal); model.editor.rowIndex = signal.values.findIndex(value => Number(value.start) === start); }); };
  controller.actions.deleteSignalValue = (signalId, index) => { const signal = getSignal(signalId); if (!signal || !signal.values[index] || signal.values.length <= 1) return false; return transactionRun('Delete signal value', () => { signal.values.splice(index, 1); canonicalize(signal); model.editor.rowIndex = Math.max(0, Math.min(index, signal.values.length - 1)); setValidation([]); }); };
  const clockFieldIssue = (signal, field, rawValue) => {
    const value = Number(rawValue);
    const path = field.startsWith('edgeCounter.') ? field.slice(12).split('.') : [];
    if (field === 'duty' && (!Number.isFinite(value) || value <= 0 || value >= 100)) return { code: 'invalid-duty', message: 'Dutyは0%より大きく100%未満で指定してください' };
    if (field === 'period' && (!Number.isFinite(value) || value <= 0)) return { code: 'invalid-period' };
    if (field === 'phase' && !Number.isFinite(value)) return { code: 'invalid-phase' };
    if (field === 'start' && (!Number.isFinite(value) || value < 0)) return { code: 'invalid-start' };
    if (field === 'initialLevel' && ![0, 1].includes(value)) return { code: 'invalid-initial-level' };
    if (field === 'edgeReference' && !['rising', 'falling'].includes(String(rawValue).toLowerCase())) return { code: 'invalid-edge-reference' };
    if (!path.length) return null;
    if (path[0] === 'offset' && path[1] && (!Number.isFinite(value))) return { code: 'invalid-edge-offset' };
    if (path[0] === 'mode' && !['rising', 'falling', 'both'].includes(String(rawValue).toLowerCase())) return { code: 'invalid-edge-mode' };
    if (path[0] === 'position' && !['above', 'below'].includes(String(rawValue).toLowerCase())) return { code: 'invalid-edge-position' };
    if (path[0] === 'startNumber' && (!Number.isInteger(value) || value < 0)) return { code: 'invalid-edge-start-number' };
    if (path[0] === 'labelEvery' && (!Number.isInteger(value) || value < 1)) return { code: 'invalid-edge-label-every' };
    if (path[0] === 'countFrom' && !['signal-start', 'selected-edge', 'marker', 'visible-range-start'].includes(String(rawValue))) return { code: 'invalid-edge-count-origin' };
    if (path.length && !['show', 'mode', 'position', 'startNumber', 'labelEvery', 'countFrom'].includes(path[0]) && !(path[0] === 'offset' && ['x', 'y'].includes(path[1]))) return { code: 'unsupported-clock-field' };
    return null;
  };
  controller.actions.updateClock = (signalId, field, rawValue) => {
    const signal = getSignal(signalId);
    const fail = issue => { setValidation([{ field, signalId, ...issue }]); render(); return false; };
    if (!signal || signal.type !== 'clock' || !signal.generator || !signal.edgeCounter) return fail({ code: 'invalid-clock-target' });
    const value = Number(rawValue);
    const issue = clockFieldIssue(signal, field, rawValue);
    if (issue) return fail(issue);
    const supported = ['duty', 'period', 'phase', 'start', 'initialLevel', 'edgeReference'];
    if (!supported.includes(field) && !field.startsWith('edgeCounter.')) return fail({ code: 'unsupported-clock-field' });
    return transactionRun(`Change clock ${field}`, () => {
      const generator = signal.generator;
      if (field === 'duty') generator.duty = value / 100;
      else if (field === 'period') generator.period = value;
      else if (field === 'phase') generator.phase = value;
      else if (field === 'start') generator.start = value;
      else if (field === 'initialLevel') generator.initial = Number(value);
      else if (field === 'edgeReference') model.document.timeline.edge = String(rawValue).toLowerCase();
      else {
        const path = field.slice(12).split('.');
        if (path[0] === 'offset' && ['x', 'y'].includes(path[1])) { signal.edgeCounter.offset ??= { x: 0, y: -6 }; signal.edgeCounter.offset[path[1]] = value; }
        else if (path[0] === 'show') signal.edgeCounter.show = rawValue === 'ON';
        else if (path[0] === 'mode') signal.edgeCounter.mode = String(rawValue).toLowerCase();
        else if (path[0] === 'position') signal.edgeCounter.position = String(rawValue).toLowerCase();
        else if (path[0] === 'startNumber' || path[0] === 'labelEvery') signal.edgeCounter[path[0]] = value;
        else if (path[0] === 'countFrom') signal.edgeCounter.countFrom = String(rawValue);
        else return false;
      }
      setValidation([]);
      return true;
    });
  };
  controller.actions.setClockPreset = (signalId, preset) => { const signal = getSignal(signalId); const values = { standard: { period: 1, phase: 0, start: 0 }, half: { period: 2, phase: 0, start: 0 }, delayed: { period: 1, phase: 0.5, start: 0 } }; const next = values[preset]; if (!signal || signal.type !== 'clock' || !next) return false; return transactionRun(`Apply clock preset ${preset}`, () => { signal.generator = { ...signal.generator, ...next, duty: 0.5 }; }); };
  controller.getClockConfig = signalId => { const signal = getSignal(signalId); if (!signal || signal.type !== 'clock') return null; return { signalId, generator: structuredClone(signal.generator), edgeCounter: structuredClone(signal.edgeCounter) }; };
  controller.actions.importClockConfig = (signalId, config) => {
    const signal = getSignal(signalId);
    if (!signal || signal.type !== 'clock' || !config?.generator || !config?.edgeCounter) return false;
    const generator = config.generator;
    const counter = config.edgeCounter;
    const generatorValid = Number.isFinite(Number(generator.start)) && Number(generator.start) >= 0 && Number.isFinite(Number(generator.period)) && Number(generator.period) > 0 && Number.isFinite(Number(generator.phase)) && Number.isFinite(Number(generator.duty)) && Number(generator.duty) > 0 && Number(generator.duty) < 1 && [0, 1].includes(Number(generator.initial)) && (!Array.isArray(generator.suppressedPeriods) || (generator.suppressedPeriods.every(value => Number.isInteger(Number(value)) && Number(value) >= 0) && new Set(generator.suppressedPeriods.map(Number)).size === generator.suppressedPeriods.length));
    const counterValid = ['rising', 'falling', 'both'].includes(counter.mode) && ['above', 'below'].includes(counter.position) && ['signal-start', 'selected-edge', 'marker', 'visible-range-start'].includes(counter.countFrom) && Number.isInteger(Number(counter.startNumber)) && Number(counter.startNumber) >= 0 && Number.isInteger(Number(counter.labelEvery)) && Number(counter.labelEvery) >= 1 && Number.isFinite(Number(counter.offset?.x)) && Number.isFinite(Number(counter.offset?.y));
    if (!generatorValid || !counterValid) { model.validation = [{ code: 'invalid-clock-config', signalId, message: 'Clock設定に無効な値があります。変更は適用されません' }]; render(); return false; }
    return transactionRun('Import clock configuration', () => { signal.generator = structuredClone(generator); signal.edgeCounter = structuredClone(counter); });
  };
  controller.actions.updateComment = (commentId, field, value) => { const comment = getComments().find(item => item.id === commentId); if (!comment || !['title', 'body'].includes(field)) return false; return transactionRun(`Change comment ${field}`, () => { comment[field] = String(value); }); };
  controller.actions.duplicateComment = commentId => transactionRun('Duplicate comment row', () => { const source = getComments().find(comment => comment.id === commentId); if (!source) return false; const copy = structuredClone(source); let id = `${source.id}_copy`; let suffix = 2; while (getComments().some(comment => comment.id === id)) id = `${source.id}_copy${suffix++}`; copy.id = id; copy.title = `${source.title || 'Comment'} copy`; const group = model.document.signalGroups.find(item => (item.rows || []).includes(commentId)); model.document.signals.push(copy); if (group) group.rows.splice(group.rows.indexOf(commentId) + 1, 0, id); model.selection = { kind: 'comment', id }; });
  controller.actions.deleteComment = commentId => transactionRun('Delete comment row', () => { const index = model.document.signals.findIndex(signal => signal.id === commentId && signal.type === 'commentRow'); if (index < 0) return false; for (const group of model.document.signalGroups) group.rows = (group.rows || []).filter(id => id !== commentId); model.document.signals.splice(index, 1); model.selection = { kind: 'signal', id: model.document.timeline.referenceClock }; });
  const selectionEntry = () => {
    const selection = model.selection || {};
    if (selection.kind === 'signal' || selection.kind === 'comment') return model.document.signals.find(item => item.id === selection.id) || null;
    if (selection.kind === 'annotation') return (model.document.annotations || []).find(item => item.id === selection.id) || null;
    if (selection.kind === 'transaction') return (model.document.transactions || []).find(item => item.id === selection.id) || null;
    if (selection.kind === 'spacer') { for (const group of model.document.signalGroups || []) { const spacer = (group.spacers || []).find(item => item.id === selection.id); if (spacer) return { ...spacer, groupId: group.id, type: 'spacer' }; } }
    return null;
  };
  const supportedSelection = () => { const entry = selectionEntry(); const kind = model.selection?.kind; return Boolean(entry && (kind === 'transaction' || kind === 'spacer' || ['clock', 'binary', 'bus', 'state', 'comment', 'annotation'].includes(kind) || ['clock', 'binary', 'bus', 'state', 'commentRow', 'range', 'marker', 'text', 'callout', 'dependency', 'verticalLine', 'bracket', 'highlight'].includes(entry.type))); };
  const uniqueId = (base, used) => { let id = `${base}_copy`; let suffix = 2; while (used.has(id)) id = `${base}_copy${suffix++}`; used.add(id); return id; };
  const groupForRow = id => (model.document.signalGroups || []).find(group => (group.rows || []).includes(id));
  const clipboardPayload = (entry, selectionKind = model.selection?.kind) => {
    if (entry.type === 'commentRow') return { version: 1, kind: 'comment', sourceDocumentId: model.document.document.id, payload: serializeSignal(structuredClone(entry)) };
    if (['clock', 'binary', 'bus', 'state'].includes(entry.type)) return { version: 1, kind: 'signal', sourceDocumentId: model.document.document.id, payload: serializeSignal(structuredClone(entry)) };
    if (entry.type === 'spacer') return { version: 1, kind: 'spacer', sourceDocumentId: model.document.document.id, payload: { id: entry.id, height: Number(entry.height) } };
    if (['range', 'marker', 'text', 'callout', 'dependency', 'verticalLine', 'bracket', 'highlight'].includes(entry.type)) return { version: 1, kind: 'annotation', sourceDocumentId: model.document.document.id, payload: serializeAnnotation(entry) };
    if (selectionKind === 'transaction') {
      const allowed = ['name', 'lane', 'start', 'end', 'source', 'destination', 'comment', 'linkedSignals', 'phases'];
      return { version: 1, kind: 'transaction', sourceDocumentId: model.document.document.id, payload: Object.fromEntries(allowed.filter(key => Object.prototype.hasOwnProperty.call(entry, key)).map(key => [key, structuredClone(entry[key])])) };
    }
    return null;
  };
  controller.actions.getSelectionCommandState = () => {
    const supported = supportedSelection();
    const payload = model.clipboard;
    const targetGroup = groupForRow(model.selection?.id) || model.document.signalGroups?.[0];
    const paste = Boolean(payload && targetGroup && ['signal', 'comment', 'spacer', 'annotation', 'transaction'].includes(payload.kind));
    const protectedReferenceClock = model.selection?.kind === 'signal' && model.selection.id === model.document.timeline.referenceClock;
    return { copy: supported, cut: supported && !protectedReferenceClock, delete: supported && !protectedReferenceClock, duplicate: supported, paste };
  };
  controller.actions.copySelection = () => {
    const payload = clipboardPayload(selectionEntry(), model.selection?.kind);
    if (!payload) return false;
    model.clipboard = structuredClone(payload);
    controller.lastClipboard = model.clipboard;
    controller.refreshCommandState?.();
    return true;
  };
  const insertPastedSignal = payload => {
    const source = structuredClone(payload);
    const isComment = payload.type === 'commentRow';
    const used = new Set(model.document.signals.map(signal => signal.id));
    const id = uniqueId(source.id || (isComment ? 'comment' : 'signal'), used);
    source.id = id;
    if (isComment) { source.groupId = undefined; }
    else ensureCanonicalSource(source);
    const targetGroup = groupForRow(model.selection?.id) || model.document.signalGroups?.[0];
    if (!targetGroup) return false;
    const selectedIndex = targetGroup.rows.indexOf(model.selection?.id);
    const insertAt = selectedIndex >= 0 ? selectedIndex + 1 : targetGroup.rows.length;
    model.document.signals.push(source); targetGroup.rows.splice(insertAt, 0, id);
    if (isComment) source.groupId = targetGroup.id;
    model.selection = { kind: isComment ? 'comment' : 'signal', id };
    return true;
  };
  controller.actions.pasteSelection = (targetContext = {}) => {
    const payload = model.clipboard;
    if (!payload || !['signal', 'comment', 'spacer', 'annotation', 'transaction'].includes(payload.kind)) return false;
    return transactionRun('Paste selection', () => {
      if (payload.kind === 'signal' || payload.kind === 'comment') return insertPastedSignal(payload.payload);
      if (payload.kind === 'spacer') {
        const group = model.document.signalGroups.find(item => item.id === targetContext.groupId) || groupForRow(model.selection?.id) || model.document.signalGroups?.[0];
        if (!group) return false; group.spacers ??= []; const used = new Set(group.spacers.map(item => item.id)); const spacer = structuredClone(payload.payload); spacer.id = uniqueId(spacer.id || 'spacer', used); spacer.height = Math.max(1, Number(spacer.height) || 16); group.spacers.push(spacer); model.selection = { kind: 'spacer', id: spacer.id }; return true;
      }
      if (payload.kind === 'annotation') {
        const annotation = structuredClone(payload.payload); const anchors = ['anchor', 'start', 'end', 'from', 'to'].map(key => annotation[key]).filter(Boolean);
        if (anchors.some(anchor => !model.document.signals.some(signal => signal.id === anchor.signal))) return false;
        annotation.id = uniqueId(annotation.id || 'annotation', new Set((model.document.annotations || []).map(item => item.id))); model.document.annotations.push(annotation); model.selection = { kind: 'annotation', id: annotation.id }; return true;
      }
      const transaction = structuredClone(payload.payload); const linked = (transaction.linkedSignals || []).filter(id => model.document.signals.some(signal => signal.id === id && signal.type !== 'commentRow')); if (linked.length !== (transaction.linkedSignals || []).length) return false; transaction.linkedSignals = linked; transaction.id = uniqueId(transaction.name || 'transaction', new Set((model.document.transactions || []).map(item => item.id))); model.document.transactions.push(transaction); model.selection = { kind: 'transaction', id: transaction.id }; model.crossHighlight = [...linked]; return true;
    });
  };
  controller.actions.deleteSelection = () => {
    const selection = model.selection || {}; const entry = selectionEntry(); if (!entry) return false;
    if (selection.kind === 'signal' && entry.type !== 'commentRow') return transactionRun('Delete selection', () => { for (const group of model.document.signalGroups) group.rows = (group.rows || []).filter(id => id !== entry.id); model.document.signals = model.document.signals.filter(signal => signal.id !== entry.id); model.document.transactions = (model.document.transactions || []).map(transaction => ({ ...transaction, linkedSignals: (transaction.linkedSignals || []).filter(id => id !== entry.id) })); model.document.annotations = (model.document.annotations || []).filter(annotation => !['anchor', 'start', 'end', 'from', 'to'].some(key => annotation[key]?.signal === entry.id)); model.selection = { kind: 'signal', id: model.document.timeline.referenceClock }; return true; });
    if (selection.kind === 'comment') return controller.actions.deleteComment(entry.id);
    if (selection.kind === 'annotation') return controller.actions.deleteAnnotation?.(entry.id) || false;
    if (selection.kind === 'transaction') return controller.actions.deleteTransaction(entry.id);
    if (selection.kind === 'spacer') return transactionRun('Delete selection', () => { const group = model.document.signalGroups.find(item => (item.spacers || []).some(spacer => spacer.id === entry.id)); if (!group) return false; group.spacers = group.spacers.filter(spacer => spacer.id !== entry.id); model.selection = { kind: 'signal', id: model.document.timeline.referenceClock }; return true; });
    return false;
  };
  controller.actions.cutSelection = () => { if (!controller.actions.copySelection()) return false; return controller.actions.deleteSelection(); };
  controller.actions.duplicateSelection = () => { if (!controller.actions.copySelection()) return false; return controller.actions.pasteSelection(); };
  controller.actions.updateSignalValue = (signalId, index, field, rawValue) => {
    const signal = getSignal(signalId); if (!signal || !signal.values?.[index]) return false;
    const candidate = { ...signal.values[index], [field]: valueFromInput(signal, rawValue, field) };
    const issues = validateValue(signal, index, candidate);
    if (issues.length) { setValidation(issues); render(); return false; }
    const result = controller.documentHistory.run(`Change signal ${field}`, () => {
      signal.values[index] = candidate; canonicalize(signal); model.editor.rowIndex = signal.values.indexOf(candidate); setValidation([]);
    }, { render: false });
    if (!result) return result;
    controller.cancelTransientLayout?.();
    controller.skipTimeAxisResizeRevision = model.documentRevision;
    controller.skipTimeAxisResizeUntil = performance.now() + 250;
    controller.skipTimingZoomUntil = performance.now() + 250;
    window.TimingChartProductionWaveform?.renderSignal?.(model, signalId);
    window.TimingChartProductionAnnotations?.render?.(model);
    if (field === 'start') window.TimingChartProductionUi?.refreshBottom?.(model);
    controller.viewRibbon?.scheduleMinimap?.();
    return true;
  };
  const initialGroupsHost = document.querySelector('#groups'); if (initialGroupsHost && !initialGroupsHost.dataset.groupMarkup) initialGroupsHost.dataset.groupMarkup = initialGroupsHost.innerHTML;
  document.querySelectorAll('.seg').forEach(button => button.addEventListener('click', () => controller.actions.setViewMode(button.dataset.mode)));
  tabs().forEach(button => button.addEventListener('click', () => controller.actions.setBottomTab(button.dataset.tab)));
  rows().forEach(row => row.addEventListener('click', () => controller.actions.selectObject(row)));
  const follow = document.querySelector('#bottomTabs input[type="checkbox"]'); follow?.addEventListener('change', () => controller.actions.setFollowSelection(follow.checked));
  const pin = document.querySelector('#bottomTabs .follow button'); pin?.addEventListener('click', () => controller.actions.setPinned(!model.view.pinned));
  document.querySelectorAll('.ribbon .txn-only [data-txn-action]').forEach(button => {
    button.dataset.controlStatus = 'implemented';
    button.addEventListener('click', () => {
      const action = button.dataset.txnAction;
      const id = model.selection?.kind === 'transaction' ? model.selection.id : null;
      if (action === 'add') controller.actions.addTransaction();
      else if (id && action === 'duplicate') controller.actions.duplicateTransaction(id);
      else if (id && action === 'delete') controller.actions.deleteTransaction(id);
      else if (id && action === 'up') controller.actions.moveTransactionBy(id, -1);
      else if (id && action === 'down') controller.actions.moveTransactionBy(id, 1);
      else if (id && action === 'reveal-links') {
        const transaction = model.document.transactions.find(item => item.id === id);
        const targetId = (transaction?.linkedSignals || [])[0];
        if (!targetId) return;
        if (model.view.mode === 'transaction') controller.actions.setViewMode('split');
        controller.actions.revealSelection?.({ id: targetId });
      }
      else if (id && action === 'apply-range') {
        const start = model.timeSelection?.rangeStart;
        const end = model.timeSelection?.rangeEnd;
        controller.actions.setTransactionRange(id, start, end);
      }
    });
  });
  controller.registerRenderHook?.('txn-ribbon-buttons', () => {
    const hasSelection = model.selection?.kind === 'transaction';
    const selectedTransaction = hasSelection ? model.document.transactions.find(item => item.id === model.selection.id) : null;
    const hasLinks = Boolean(selectedTransaction?.linkedSignals?.length);
    const rangeStart = model.timeSelection?.rangeStart;
    const rangeEnd = model.timeSelection?.rangeEnd;
    const hasValidRange = Number.isInteger(rangeStart) && Number.isInteger(rangeEnd) && rangeEnd > rangeStart;
    document.querySelectorAll('.ribbon .txn-only [data-txn-action]').forEach(button => {
      const action = button.dataset.txnAction;
      if (action === 'add') return;
      if (action === 'reveal-links') {
        button.disabled = !hasSelection || !hasLinks;
        button.title = !hasSelection ? 'Transactionを選択してください' : !hasLinks ? 'このTransactionにはLinked Signalがありません' : '';
        return;
      }
      if (action === 'apply-range') {
        button.disabled = !hasSelection || !hasValidRange;
        button.title = !hasSelection ? 'Transactionを選択してください' : !hasValidRange ? '時間軸で範囲を選択してください' : '';
        return;
      }
      button.disabled = !hasSelection;
      button.title = hasSelection ? '' : 'Transactionを選択してください';
    });
  });
  document.querySelectorAll('.export-tool').forEach(button => button.addEventListener('click', async () => { const format = button.querySelector('.filetype')?.textContent?.toLowerCase() || 'svg'; const result = await controller.export(format); window.TimingChartLastExport = result; if (format === 'pdf') { window.print(); return; } const blob = new Blob([format === 'svg' ? result.text : result.dataUrl], { type: format === 'svg' ? 'image/svg+xml' : 'text/plain' }); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `timing-chart.${format}`; link.click(); URL.revokeObjectURL(link.href); }));
  render();
})();
