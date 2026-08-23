(() => {
  'use strict';
  const controller = window.TimingChartProductionController;
  if (!controller) return;
  const model = controller.model;
  const clone = value => structuredClone(value);
  const metrics = model.persistenceMetrics = { commands: 0, serializableSnapshots: 0, structuredClones: 0, fullDocumentStringifies: 0, validations: 0, fullRenders: 0 };
  const stable = value => { metrics.fullDocumentStringifies += 1; return JSON.stringify(value); };
  const hash = value => stable(value);
  const canonicalSnapshot = () => { metrics.serializableSnapshots += 1; metrics.structuredClones += 1; return clone(controller.getSerializableDocument()); };
  model.documentRevision = 0;
  model.persistence = { fileHandle: null, fileName: 'example.tcd', dirty: false, savedRevision: 0, savedRevisionHash: hash(controller.getSerializableDocument()), lastError: null, source: { kind: 'user', sample: false }, operation: { type: 'document', result: 'ready', message: 'Ready', detail: '', action: '' } };
  model.history = { undo: [], redo: [] };
  const renderWithMetrics = controller.render;
  controller.render = (...args) => { metrics.fullRenders += 1; return renderWithMetrics(...args); };
  let unloadGuardActive = false;
  const beforeUnload = event => { if (!model.persistence.dirty) return; event.preventDefault(); event.returnValue = ''; };
  const renderOperationStatus = () => {
    const status = document.querySelector('.status');
    const target = status?.querySelector('span');
    if (!target) return;
    const operation = model.persistence.operation || { result: 'ready', message: 'Ready', detail: '', action: '' };
    target.textContent = operation.message || 'Ready';
    target.dataset.operationResult = operation.result;
    target.dataset.operationType = operation.type || 'document';
    target.dataset.operationDetail = operation.detail || '';
    target.dataset.operationAction = operation.action || '';
    target.title = operation.detail || '';
    target.setAttribute('role', 'status');
    target.setAttribute('aria-live', 'polite');
    target.tabIndex = operation.action ? 0 : -1;
    if (!target.dataset.operationBound) {
      target.dataset.operationBound = 'true';
      const openProblems = event => { if (!target.dataset.operationAction) return; event.preventDefault(); controller.actions.setBottomTab?.('problems'); };
      target.addEventListener('click', openProblems);
      target.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') openProblems(event); });
    }
  };
  const syncUnloadGuard = () => {
    if (model.persistence.dirty && !unloadGuardActive) { window.addEventListener('beforeunload', beforeUnload); unloadGuardActive = true; }
    if (!model.persistence.dirty && unloadGuardActive) { window.removeEventListener('beforeunload', beforeUnload); unloadGuardActive = false; }
  };
  const publishOperation = ({ type = 'document', result = 'neutral', message, detail = '', action = '' }) => {
    model.persistence.operation = { type, result, message, detail, action };
    model.persistence.lastError = result === 'error' ? detail || message : null;
    renderOperationStatus();
  };
  const compatibilityDetails = preview => {
    const lines = [`Format version: ${preview.sourceFormatVersion} (supported through 2)`];
    for (const item of preview.diagnostics || []) lines.push(`[${item.severity}] ${item.code} ${item.path || '$'}${item.objectId ? ` (${item.objectId})` : ''}: ${item.message}${item.reason ? ` ${item.reason}` : ''}${item.recommendation ? ` Recommendation: ${item.recommendation}` : ''}`);
    return lines.join('\n');
  };
  const removeCompatibilityPreview = () => document.querySelector('#compatibilityPreview')?.remove();
  const renderCompatibilityPreview = () => {
    removeCompatibilityPreview();
    const preview = model.compatibility;
    if (!preview || preview.mode !== 'preview') return;
    const panel = document.createElement('section');
    panel.id = 'compatibilityPreview';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-labelledby', 'compatibilityPreviewTitle');
    panel.style.cssText = 'position:fixed;z-index:4000;inset:12% 20%;background:#fff;border:1px solid #9aaabd;border-radius:6px;box-shadow:0 16px 48px #10243b55;padding:18px;overflow:auto;font:13px sans-serif;color:#243047;';
    const title = document.createElement('h2'); title.id = 'compatibilityPreviewTitle'; title.textContent = preview.canOpen ? 'Compatibility Preview' : 'Cannot open in Compatibility Mode'; title.style.margin = '0 0 10px'; panel.appendChild(title);
    const intro = document.createElement('p'); intro.textContent = preview.canOpen ? 'The source is newer than this application. Review exact, degraded, and unsupported content before opening.' : 'The source could not be safely reconstructed. The current document remains unchanged.'; panel.appendChild(intro);
    const report = document.createElement('pre'); report.dataset.compatibilityDetails = 'true'; report.textContent = compatibilityDetails(preview); report.style.cssText = 'white-space:pre-wrap;background:#f5f8fb;border:1px solid #d7e0ea;padding:10px;max-height:52vh;overflow:auto;'; panel.appendChild(report);
    const actions = document.createElement('div'); actions.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;margin-top:12px;';
    const copy = document.createElement('button'); copy.type = 'button'; copy.dataset.compatibilityAction = 'copy'; copy.textContent = 'Copy details'; copy.addEventListener('click', () => { void navigator.clipboard?.writeText(compatibilityDetails(preview)).catch(() => {}); copy.dataset.copied = 'true'; });
    const cancel = document.createElement('button'); cancel.type = 'button'; cancel.dataset.compatibilityAction = 'cancel'; cancel.textContent = 'Cancel'; cancel.addEventListener('click', () => { model.compatibility = null; removeCompatibilityPreview(); publishOperation({ type: 'open', result: 'neutral', message: 'Open canceled' }); });
    actions.append(copy, cancel);
    if (preview.canOpen) { const open = document.createElement('button'); open.type = 'button'; open.dataset.compatibilityAction = 'open'; open.textContent = 'Open in Compatibility Mode'; open.addEventListener('click', async () => { await controller.actions.openCompatibilityText(preview.rawText, { fileName: preview.fileName || 'compatibility-preview.tcd' }); }); actions.append(open); }
    panel.appendChild(actions); document.body.appendChild(panel);
  };
  controller.publishOperation = publishOperation;
  controller.renderCompatibilityPreview = renderCompatibilityPreview;

  const updateDirty = () => {
    model.persistence.dirty = model.documentRevision !== model.persistence.savedRevision;
    const title = document.querySelector('.titlebar strong');
    const saved = document.querySelector('.titlebar .saved');
    if (title) title.textContent = `タイミングチャートエディタ - ${model.persistence.fileName}`;
    if (saved) saved.textContent = model.persistence.dirty ? 'Modified' : model.persistence.source?.kind === 'sample' ? 'Sample source — Save As required' : 'Saved';
    document.querySelectorAll('.tool').forEach(button => {
      const label = button.querySelector('.tool-label')?.textContent?.trim();
      if (label === 'Undo') button.disabled = model.history.undo.length === 0;
      if (label === 'Redo') button.disabled = model.history.redo.length === 0;
    });
    syncUnloadGuard();
    renderOperationStatus();
  };
  const repairSelection = () => {
    const id = model.selection?.id;
    const exists = controller.selectors.getSignals().some(signal => signal.id === id) || controller.selectors.getComments().some(comment => comment.id === id);
    if (!exists) model.selection = { kind: 'signal', id: controller.selectors.getSignals()[0]?.id || null };
    model.editor.rowIndex = 0;
  };
  const validateCurrent = () => controller.validateDocument(model.document);
  const record = (label, before, after) => {
    if (stable(before) === stable(after)) return false;
    const revisionBefore = model.documentRevision;
    const revisionAfter = revisionBefore + 1;
    model.documentRevision = revisionAfter;
    model.history.undo.push({ label, before, after, revisionBefore, revisionAfter });
    model.history.redo = [];
    updateDirty();
    return true;
  };
  // Persistent mutation ownership is defined at each action in the controller.
  // Keep this module responsible for the shared history/dirty/validation boundary,
  // rather than adding another post-hoc wrapper list here.

  const replaceDocument = (nextDocument, { resetHistory = true, render = true } = {}) => {
    model.document = clone(nextDocument);
    controller.rebuildObjectIndex?.();
    model.compatibility = null;
    if (resetHistory) { model.history = { undo: [], redo: [] }; controller.history = model.history; }
    model.validation = [];
    model.crossHighlight = [];
    model.waveGeometry = null;
    controller.waveGeometry = null;
    model.timeSelection = { cycle: 0, rangeStart: null, rangeEnd: null };
    model.editor = { rowIndex: 0 };
    model.selection = { kind: 'signal', id: controller.selectors.getSignals()[0]?.id || null };
    model.view.hiddenSignals = model.document.signals.filter(signal => signal.display?.visible === false).map(signal => signal.id);
    model.view.scope = [];
    model.view.leftPanelMode = 'group';
    model.view.pinned = false;
    model.view.followSelection = true;
    delete model.view.previewSignalNameWidth;
    delete model.view.annotationAnchorSelection;
    delete model.view.dependencySelection;
    delete model.view.currentGroupId;
    if (model.view.mode === 'cycle' && model.view.tab === 'transaction') model.view.tab = 'signal';
    if (model.view.mode === 'transaction' && model.view.tab === 'signal') model.view.tab = 'transaction';
    repairSelection();
    controller.repairScope?.();
    if (render) controller.render();
    return true;
  };
  controller.replaceDocument = replaceDocument;
  const restore = (snapshot, { revision = model.documentRevision, validation = [], render = true } = {}) => {
    const previousSelection = clone(model.selection);
    const previousView = clone(model.view);
    const previousTimeSelection = clone(model.timeSelection);
    const previousEditor = clone(model.editor);
    const previousDocument = clone(model.document);
    const scrollHost = window.TimingChartTimingViewport?.getScrollHost?.();
    const previousScroll = scrollHost ? { left: scrollHost.scrollLeft, top: scrollHost.scrollTop } : null;
    replaceDocument(snapshot, { resetHistory: false, render: false });
    model.documentRevision = revision;
    model.validation = validation;
    const exists = selection => {
      if (!selection?.id) return false;
      if (selection.kind === 'annotation') return model.document.annotations.some(item => item.id === selection.id);
      if (selection.kind === 'transaction') return model.document.transactions.some(item => item.id === selection.id);
      if (selection.kind === 'bookmark') return (model.document.bookmarks || []).some(item => item.id === selection.id);
      if (selection.kind === 'group') return model.document.signalGroups.some(item => item.id === selection.id);
      return model.document.signals.some(item => item.id === selection.id);
    };
    const fallbackObject = () => {
      const oldId = previousSelection?.id;
      const oldGroup = previousDocument.signalGroups?.find(group => (group.rows || []).includes(oldId));
      const oldRows = oldGroup?.rows || [];
      const oldIndex = oldRows.indexOf(oldId);
      const previous = oldRows.slice(0, Math.max(0, oldIndex)).reverse().find(id => model.document.signals.some(signal => signal.id === id));
      const next = oldRows.slice(Math.max(0, oldIndex + 1)).find(id => model.document.signals.some(signal => signal.id === id));
      const id = previous || next || model.document.signals.find(signal => signal.type !== 'commentRow')?.id;
      return id ? { kind: model.document.signals.find(signal => signal.id === id)?.type === 'commentRow' ? 'comment' : 'signal', id } : { kind: 'signal', id: null };
    };
    if (exists(previousSelection)) model.selection = previousSelection;
    else if (previousSelection?.kind === 'signal' || previousSelection?.kind === 'comment') model.selection = fallbackObject();
    model.view = { ...model.view, ...previousView };
    const timeline = model.document.timeline;
    const clamp = value => Math.max(Number(timeline.start ?? 0), Math.min(Number(timeline.end ?? timeline.cycleCount ?? 0), Number(value)));
    const restoredCycle = clamp(previousTimeSelection?.cycle ?? 0);
    const restoredStart = previousTimeSelection?.rangeStart === null || previousTimeSelection?.rangeStart === undefined ? null : clamp(previousTimeSelection.rangeStart);
    const restoredEnd = previousTimeSelection?.rangeEnd === null || previousTimeSelection?.rangeEnd === undefined ? null : clamp(previousTimeSelection.rangeEnd);
    model.timeSelection = { ...model.timeSelection, ...previousTimeSelection, cycle: restoredCycle, rangeStart: restoredStart, rangeEnd: restoredEnd };
    if (model.timeSelection.rangeStart !== null && model.timeSelection.rangeEnd !== null && model.timeSelection.rangeEnd < model.timeSelection.rangeStart) model.timeSelection.rangeEnd = model.timeSelection.rangeStart;
    const selectedSignal = model.document.signals.find(signal => signal.id === model.selection?.id);
    model.editor = { ...model.editor, ...previousEditor, rowIndex: selectedSignal?.values?.length ? Math.max(0, Math.min(Number(previousEditor?.rowIndex ?? 0), selectedSignal.values.length - 1)) : 0 };
    model.view.hiddenSignals = model.document.signals.filter(signal => signal.display?.visible === false).map(signal => signal.id);
    controller.repairScope?.();
    if (render) controller.render();
    if (previousScroll) requestAnimationFrame(() => { const host = window.TimingChartTimingViewport?.getScrollHost?.(); if (host) { host.scrollLeft = Math.max(0, Math.min(previousScroll.left, host.scrollWidth - host.clientWidth)); host.scrollTop = Math.max(0, Math.min(previousScroll.top, host.scrollHeight - host.clientHeight)); } });
    updateDirty();
  };
  controller.documentHistory = { run(label, mutation, options = {}) {
    metrics.commands += 1;
    const before = canonicalSnapshot();
    let result = true;
    try { result = mutation() !== false; } catch (error) { model.persistence.lastError = error.message; result = false; }
    metrics.validations += 1;
    model.validationReadContext = false;
    model.validationMetrics.validationRuns += 1;
    const issues = controller.validateDocument(model.document);
    model.validationReadContext = true;
    if (!result || issues.length) { restore(before, { validation: issues, render: options.render !== false }); return false; }
    const after = canonicalSnapshot();
    record(label, before, after);
    controller.cacheValidationResult?.(model.document, issues, model.documentRevision);
    if (options.render !== false) controller.render();
    return true;
  } };
  controller.actions.undo = () => {
    const entry = model.history.undo.pop();
    if (!entry) return false;
    model.history.redo.push(entry);
    restore(entry.before, { revision: entry.revisionBefore ?? Math.max(0, model.documentRevision - 1) });
    return true;
  };
  controller.actions.redo = () => {
    const entry = model.history.redo.pop();
    if (!entry) return false;
    model.history.undo.push(entry);
    restore(entry.after, { revision: entry.revisionAfter ?? model.documentRevision + 1 });
    return true;
  };

  const newDocument = () => ({
    formatVersion: 2,
    document: { id: 'untitled.tcd', title: 'Untitled', header: { subtitle: '', description: '', notes: '', preconditions: [], constraints: [], exceptions: [] }, footer: { figureNumber: '', revision: '', text: '' } },
    timeline: { start: 0, end: 1, timeBase: 'cycle', cycleCount: 1, referenceClock: 'clk', edge: 'rising', labelAnchors: [] },
    signalGroups: [{ id: 'group_input', name: '入力 (Input)', rows: ['clk'] }],
    signals: [{ id: 'clk', name: 'clk', type: 'clock', role: 'input', generator: { start: 0, period: 1, duty: 0.5, phase: 0, initial: 0, polarity: 'positive' }, edgeCounter: { show: true, mode: 'rising', startNumber: 1, countFrom: 'signal-start', labelEvery: 1, position: 'above', offset: { x: 0, y: -6 } } }],
    annotations: [], legend: { orientation: 'horizontal', usedRolesOnly: true }, layout: { roleColumnWidth: 32, signalNameWidth: 168, signalNameAlign: 'left', busWidthAlign: 'left', pathDisplayMode: 'signalOnly', instancePathAlign: 'left', instancePathWidth: 180, busWidthMode: 'inline', rowHeight: 28, signalSpacing: 6, overflow: 'ellipsis' }, transactions: [], constraints: [], bookmarks: [], timeGroups: [], checkSettings: {}
  });
  const commitSaveSuccess = ({ fileHandle = model.persistence.fileHandle, fileName = model.persistence.fileName, documentHash }) => {
    model.persistence.fileHandle = fileHandle;
    model.persistence.fileName = fileName;
    model.persistence.source = { kind: 'user', sample: false };
    model.compatibility = null;
    removeCompatibilityPreview();
    model.persistence.savedRevision = model.documentRevision;
    model.persistence.savedRevisionHash = documentHash;
    model.persistence.lastError = null;
    publishOperation({ type: 'save', result: 'success', message: `✓ Saved: ${fileName}` });
    updateDirty();
  };
  const prepareSaveText = ({ allowCompatibility = false } = {}) => {
    if (model.compatibility?.saveBlocked && !allowCompatibility) return { error: 'Cannot save a Compatibility Mode document until a compatible target is explicitly established.' };
    let serializable;
    try { serializable = controller.getSerializableDocument(); } catch (error) { return { error: `Cannot save invalid document: ${error.message}` }; }
    metrics.validations += 1;
    model.validationReadContext = false;
    model.validationMetrics.validationRuns += 1;
    const issues = controller.validateDocument(serializable);
    model.validationReadContext = true;
    if (issues.length) return { error: `Cannot save invalid document: ${issues.map(issue => issue.code).join(', ')}` };
    return { text: `${JSON.stringify(serializable, null, 2)}\n`, documentHash: hash(serializable) };
  };
  controller.prepareSaveText = prepareSaveText;
  const normalizeExternalDocument = parsed => {
    if (parsed?.formatVersion === 1 && parsed.timeline?.cycleCount && Array.isArray(parsed.signals)) return parsed;
    const sourceSignals = parsed?.cycleView?.signals || parsed?.signals || [];
    const cycleCount = Number(parsed?.document?.timebase?.cycleCount || parsed?.timeline?.cycleCount || parsed?.document?.cycleCount || 10);
    const normalizedSignals = sourceSignals.map((source, index) => { const signal = clone(source); signal.id ||= `signal_${index + 1}`; signal.name ||= signal.id; signal.role ||= 'internal'; signal.type ||= 'binary'; if (signal.type === 'clock') { signal.generator = { start: signal.generator?.start ?? 0, period: signal.generator?.period ?? 1, duty: signal.generator?.duty ?? 0.5, phase: signal.generator?.phase ?? 0, initial: signal.generator?.initial ?? 0, polarity: signal.generator?.polarity || 'positive' }; signal.edgeCounter ||= { show: false, mode: 'rising', startNumber: 1, countFrom: 'signal-start', labelEvery: 1, position: 'above', offset: { x: 0, y: -6 } }; } else if (!Array.isArray(signal.values)) signal.values = [{ start: 0, value: signal.type === 'state' ? 'IDLE' : signal.type === 'bus' ? '00' : 0 }]; return controller.ensureCanonicalSource?.(signal) || signal; });
    const referenceClock = normalizedSignals.find(signal => signal.type === 'clock')?.id || normalizedSignals[0]?.id || 'clk';
    const groups = (parsed.signalGroups || []).map(group => ({ id: group.id, name: group.name || group.id, rows: [...(group.rows || group.signals || [])] }));
    if (!groups.length) groups.push({ id: 'group_default', name: 'Signals', rows: normalizedSignals.map(signal => signal.id) });
    const pathModes = window.TimingChartPathDisplayModes;
    const pathDisplayMode = Object.values(pathModes).includes(parsed.layout?.pathDisplayMode) ? parsed.layout.pathDisplayMode : pathModes.SIGNAL_ONLY;
    return { formatVersion: 1, document: { id: parsed.document?.id || 'sample.tcd', title: parsed.document?.title || 'Timing Chart Sample', header: { subtitle: parsed.document?.description || '', description: parsed.document?.description || '', notes: '', preconditions: [], constraints: [], exceptions: [] }, footer: { figureNumber: '', revision: '', text: '' } }, timeline: { start: 0, end: cycleCount, timeBase: 'cycle', cycleCount, referenceClock, edge: 'rising' }, signalGroups: groups, signals: normalizedSignals, annotations: [], legend: { orientation: parsed.legend?.orientation || 'horizontal', usedRolesOnly: true, position: { x: Number(parsed.legend?.offset?.x || 0), y: Number(parsed.legend?.offset?.y || 0) } }, layout: { roleColumnWidth: 32, signalNameWidth: Number(parsed.layout?.signalNameWidth || 168), signalNameAlign: ['left', 'center', 'right'].includes(parsed.layout?.signalNameAlign) ? parsed.layout.signalNameAlign : 'left', busWidthAlign: ['left', 'center', 'right'].includes(parsed.layout?.busWidthAlign) ? parsed.layout.busWidthAlign : 'left', pathDisplayMode, instancePathAlign: ['left', 'center', 'right'].includes(parsed.layout?.instancePathAlign) ? parsed.layout.instancePathAlign : 'left', instancePathWidth: Number(parsed.layout?.instancePathWidth || 180), busWidthMode: parsed.layout?.busWidthMode === 'alignedColumn' ? 'alignedColumn' : 'inline', rowHeight: Number(parsed.layout?.rowHeight || 28), signalSpacing: Number(parsed.layout?.signalSpacing || 6), overflow: 'ellipsis' }, transactions: parsed.transactions || [], constraints: [] };
  };
  controller.normalizeExternalDocument = normalizeExternalDocument;
  const protect = async decision => {
    if (!model.persistence.dirty || decision === 'discard') return true;
    if (decision === 'save') return Boolean(await controller.actions.save());
    return false;
  };
  controller.actions.requestNew = async ({ unsavedDecision = 'cancel' } = {}) => {
    if (!await protect(unsavedDecision)) { publishOperation({ type: 'new', result: 'neutral', message: 'New canceled', detail: 'Unsaved changes were kept.' }); return false; }
    replaceDocument(newDocument()); model.documentRevision = 0; model.persistence.fileHandle = null; model.persistence.fileName = 'Untitled.tcd'; model.persistence.source = { kind: 'user', sample: false }; model.persistence.lastError = null; model.persistence.savedRevision = 0; model.persistence.savedRevisionHash = hash(controller.getSerializableDocument()); model.persistence.dirty = false; publishOperation({ type: 'new', result: 'success', message: '✓ New document created' }); updateDirty(); return true;
  };
  const loadText = async (text, fileName = 'example.tcd', unsavedDecision = 'cancel', source = { kind: 'user', sample: false }) => {
    if (!await protect(unsavedDecision)) return false;
    let parsed;
    try { parsed = JSON.parse(text); parsed = controller.normalizeExternalDocument(parsed); } catch (error) { const future = error?.code === 'future-format-version'; const preview = controller.analyzeCompatibility?.(text); if (future || preview?.diagnostics?.length) { const fallback = preview || { sourceFormatVersion: Number(error.parsed?.formatVersion), diagnostics: [{ code: 'OPEN_FORMAT_VERSION', severity: 'blocking', path: '$.formatVersion', actual: Number(error.parsed?.formatVersion), message: error.message, reason: 'The source is newer than the supported format.', recommendation: 'Open in Compatibility Mode or cancel.' }], canOpen: false, rawText: text }; model.compatibility = { mode: 'preview', ...fallback, fileName }; controller.renderCompatibilityPreview?.(); publishOperation({ type: 'open', result: 'error', message: future ? '✕ Compatibility Preview' : '✕ Open diagnostics', detail: `${fallback.diagnostics?.length || 1} diagnostics available.` }); return false; } publishOperation({ type: 'open', result: 'error', message: '✕ Could not open file', detail: `Invalid JSON: ${error.message}` }); return false; }
    const issues = controller.validateDocument(parsed);
    if (parsed?.formatVersion !== 2 || issues.length) { const detail = `Invalid .tcd document: ${issues.map(issue => issue.code).join(', ') || 'unsupported formatVersion'}`; model.validation = issues; publishOperation({ type: 'open', result: 'error', message: '✕ Could not open file', detail, action: issues.length ? 'problems' : '' }); return false; }
    replaceDocument(parsed); model.documentRevision = 0; model.persistence.fileName = fileName; model.persistence.fileHandle = null; model.persistence.source = { kind: source.kind || 'user', sample: Boolean(source.sample), sampleId: source.sampleId || null, sampleTitle: source.sampleTitle || null }; model.persistence.savedRevision = 0; model.persistence.savedRevisionHash = hash(controller.getSerializableDocument()); model.persistence.dirty = false; const importWarnings = controller.getImportWarnings?.() || []; publishOperation({ type: 'open', result: importWarnings.length ? 'warning' : 'success', message: `✓ Opened: ${fileName}`, detail: source.sample ? 'Bundled sample loaded. Save As is required before saving.' : importWarnings.length ? importWarnings.map(warning => `${warning.path}: ${warning.reason}`).join('\n') : '' }); updateDirty(); return true;
  };
  controller.actions.openText = (text, options = {}) => loadText(text, options.fileName || 'example.tcd', options.unsavedDecision || 'cancel', options.source || { kind: 'user', sample: false });
  const sampleCatalog = [
    ['protocol','01_apb_register_access.tcd.json','APB register write/read with wait state'],
    ['protocol','02_ahb_lite_pipelined_transfer.tcd.json','AHB-Lite pipelined transfers with stall'],
    ['protocol','03_axi4_full_write_burst.tcd.json','AXI4 Full write burst with backpressure'],
    ['protocol','04_axi4_full_read_outstanding.tcd.json','AXI4 Full read: multiple outstanding IDs'],
    ['protocol','05_sram_1p_sync_read_write.tcd.json','Single-port SRAM synchronous read/write'],
    ['protocol','06_sram_2p_parallel_and_conflict.tcd.json','Dual-port SRAM parallel access and conflict'],
    ['protocol','07_axi_to_dram_read_path.tcd.json','AXI-to-DRAM read path'],
    ['protocol','08_async_fifo_cdc.tcd.json','Asynchronous FIFO CDC'],
    ['protocol','09_accelerator_request_response.tcd.json','Accelerator request/response'],
    ['protocol','10_axi4_stream_packet_backpressure.tcd.json','AXI4-Stream packet backpressure'],
    ['feature','11_signal_types_roles_legend.tcd.json','Feature 11 - Signal types, roles and legend'],
    ['feature','12_group_bands_and_spacing.tcd.json','Feature 12 - Group bands and vertical spacing'],
    ['feature','13_signal_name_layout.tcd.json','Feature 13 - Signal label layout'],
    ['feature','14_annotation_overlay_all_types.tcd.json','Feature 14 - Annotation overlay'],
    ['feature','15_transition_arrows_anchor_styles.tcd.json','Feature 15 - Transition arrows and exact anchors'],
    ['feature','16_clock_phase_gating_gap.tcd.json','Feature 16 - Clock phase, gating and gap'],
    ['feature','17_cycle_insert_delete_ripple.tcd.json','Feature 17 - Cycle insert/delete ripple'],
    ['feature','18_legend_and_group_reorder.tcd.json','Feature 18 - Legend and group reorder'],
    ['feature','19_header_footer_export.tcd.json','Feature 19 - Header/footer and export'],
    ['feature','20_transaction_cycle_linked_views.tcd.json','Feature 20 - Transaction/cycle linked views']
  ].map(([category,file,title]) => ({ category, file, title, path: category === 'protocol' ? `../samples/golden-protocol/timing_chart_sample_pack/samples/${file}` : `../samples/golden-feature-coverage/timing_chart_feature_coverage_pack/samples/${file}` }));
  controller.sampleCatalog = sampleCatalog;
  controller.actions.openSample = async (sample, options = {}) => {
    const entry = typeof sample === 'string' ? sampleCatalog.find(item => item.file === sample) : sample;
    if (!entry) return false;
    try {
      let text = window.TimingChartSampleSources?.[entry.file];
      if (text === undefined) { const response = await fetch(entry.path, { cache: 'no-store' }); if (!response.ok) throw new Error(`HTTP ${response.status}`); text = await response.text(); }
      return loadText(text, entry.file, options.unsavedDecision || 'cancel', { kind: 'sample', sample: true, sampleId: entry.file, sampleTitle: entry.title });
    } catch (error) {
      publishOperation({ type: 'open', result: 'error', message: '✕ Could not open sample', detail: `${entry.file}: ${error.message}` });
      return false;
    }
  };
  controller.actions.openCompatibilityText = async (text, options = {}) => {
    try {
      const analysis = controller.analyzeCompatibility?.(text);
      if (!analysis?.canOpen || !analysis.projected) return false;
      const sourceVersion = Number(analysis.sourceFormatVersion);
      const parsed = analysis.projected;
      replaceDocument(parsed);
      model.compatibility = { mode: 'compatibility', sourceFormatVersion: sourceVersion, saveBlocked: true, diagnostics: analysis.diagnostics, rawText: text, fileName: options.fileName || 'compatibility-preview.tcd' };
      model.persistence.fileName = options.fileName || 'compatibility-preview.tcd';
      model.persistence.dirty = false;
      removeCompatibilityPreview();
      publishOperation({ type: 'open', result: 'warning', message: `⚠ Opened in Compatibility Mode: ${model.persistence.fileName}`, detail: 'Save is blocked to protect newer fields.' });
      updateDirty();
      return true;
    } catch (error) { publishOperation({ type: 'open', result: 'error', message: '✕ Compatibility open failed', detail: error.message }); return false; }
  };
  let fallbackOpenSerial = 0;
  const requestFallbackFile = ({ unsavedDecision = 'cancel' } = {}) => {
    const serial = ++fallbackOpenSerial;
    const input = document.createElement('input'); input.type = 'file'; input.accept = '.tcd,.tcd.json,.json,application/json'; input.hidden = true; input.dataset.openFallback = 'true'; document.body.appendChild(input);
    return new Promise(resolve => {
      let settled = false; let blurred = false; let focusTimer = 0;
      const cleanup = () => { if (focusTimer) clearTimeout(focusTimer); window.removeEventListener('blur', onBlur); window.removeEventListener('focus', onFocus); window.removeEventListener('pagehide', onTeardown); input.removeEventListener('change', onChange); input.removeEventListener('cancel', onCancel); input.remove(); };
      const settle = result => { if (settled) return; settled = true; cleanup(); resolve(result); };
      const onFocus = () => { if (!blurred || settled) return; focusTimer = window.setTimeout(() => { if (!settled && !input.files?.length) { publishOperation({ type: 'open', result: 'neutral', message: 'Open canceled' }); settle(false); } }, 0); };
      const onBlur = () => { blurred = true; };
      const onTeardown = () => settle(false);
      const onCancel = () => { publishOperation({ type: 'open', result: 'neutral', message: 'Open canceled' }); settle(false); };
      const onChange = async () => {
        if (settled || serial !== fallbackOpenSerial) { settle(false); return; }
        const file = input.files?.[0];
        if (!file) { onCancel(); return; }
        try { settle(await loadText(await file.text(), file.name, unsavedDecision)); } catch (error) { publishOperation({ type: 'open', result: 'error', message: '✕ Could not open file', detail: error.message }); settle(false); }
      };
      input.addEventListener('change', onChange, { once: true }); input.addEventListener('cancel', onCancel, { once: true }); window.addEventListener('blur', onBlur); window.addEventListener('focus', onFocus); window.addEventListener('pagehide', onTeardown, { once: true }); input.click();
    });
  };
  controller.actions.requestOpen = async ({ text, fileName, unsavedDecision = 'cancel' } = {}) => {
    if (text !== undefined) return loadText(text, fileName || 'example.tcd', unsavedDecision);
    if (window.showOpenFilePicker) { try { const [handle] = await window.showOpenFilePicker({ types: [{ description: 'Timing Chart JSON', accept: { 'application/json': ['.tcd', '.tcd.json', '.json'] } }] }); const file = await handle.getFile(); const result = await loadText(await file.text(), file.name, unsavedDecision); if (result) model.persistence.fileHandle = handle; return result; } catch (error) { if (error.name === 'AbortError') publishOperation({ type: 'open', result: 'neutral', message: 'Open canceled' }); else publishOperation({ type: 'open', result: 'error', message: '✕ Could not open file', detail: error.message }); return false; } }
    return requestFallbackFile({ unsavedDecision });
  };
  controller.actions.saveAs = async ({ fileName = 'Untitled.tcd', allowCompatibility = false } = {}) => {
    const prepared = prepareSaveText({ allowCompatibility }); if (prepared.error) { publishOperation({ type: 'save', result: 'error', message: '✕ Cannot save', detail: prepared.error, action: 'problems' }); return false; }
    if (window.showSaveFilePicker) { try { const handle = await window.showSaveFilePicker({ suggestedName: fileName, types: [{ description: 'Timing Chart', accept: { 'application/json': ['.tcd'] } }] }); const writable = await handle.createWritable(); await writable.write(prepared.text); await writable.close(); commitSaveSuccess({ fileHandle: handle, fileName, documentHash: prepared.documentHash }); return true; } catch (error) { if (error.name === 'AbortError') publishOperation({ type: 'save', result: 'neutral', message: 'Save canceled' }); else publishOperation({ type: 'save', result: 'error', message: '✕ Cannot save', detail: error.message }); return false; } }
    const blob = new Blob([prepared.text], { type: 'application/json;charset=utf-8' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = fileName.endsWith('.tcd') ? fileName : `${fileName}.tcd`; link.hidden = true; document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url); commitSaveSuccess({ fileHandle: null, fileName: link.download, documentHash: prepared.documentHash }); return true;
  };
  controller.actions.save = async () => {
    if (model.compatibility?.saveBlocked) return controller.actions.saveAs({ fileName: model.persistence.fileName.replace(/\.tcd$/i, '') + '_compatible_v2.tcd', allowCompatibility: true });
    const prepared = prepareSaveText(); if (prepared.error) { publishOperation({ type: 'save', result: 'error', message: '✕ Cannot save', detail: prepared.error, action: 'problems' }); return false; }
    if (model.persistence.fileHandle) { try { const writable = await model.persistence.fileHandle.createWritable(); await writable.write(prepared.text); await writable.close(); commitSaveSuccess({ fileHandle: model.persistence.fileHandle, fileName: model.persistence.fileName, documentHash: prepared.documentHash }); return true; } catch (error) { publishOperation({ type: 'save', result: 'error', message: '✕ Cannot save', detail: error.message }); return false; } }
    return controller.actions.saveAs({ fileName: model.persistence.fileName });
  };
  controller.persistence = model.persistence;
  controller.history = model.history;
  const tool = label => [...document.querySelectorAll('.tool')].find(button => button.querySelector('.tool-label')?.textContent?.replace(/\s/g, '').includes(label));
  let unsavedDialogPromise = null;
  const askUnsavedDecision = () => {
    if (unsavedDialogPromise) return unsavedDialogPromise;
    const dialog = document.createElement('section');
    dialog.id = 'unsavedChangesDialog'; dialog.dataset.unsavedDialog = 'true'; dialog.setAttribute('role', 'dialog'); dialog.setAttribute('aria-modal', 'true'); dialog.setAttribute('aria-labelledby', 'unsavedChangesTitle');
    dialog.style.cssText = 'position:fixed;inset:0;z-index:4000;display:flex;align-items:center;justify-content:center;background:rgba(20,35,55,.28);font:13px sans-serif;color:#243047;';
    const panel = document.createElement('div');
    panel.style.cssText = 'width:410px;background:#fff;border:1px solid #9aaabd;border-radius:6px;box-shadow:0 16px 48px rgba(16,36,59,.28);padding:20px;';
    const title = document.createElement('h2'); title.id = 'unsavedChangesTitle'; title.textContent = '未保存の変更'; title.style.cssText = 'margin:0 0 10px;font-size:16px;';
    const message = document.createElement('p'); message.textContent = '現在のドキュメントに未保存の変更があります。どうしますか？'; message.style.cssText = 'margin:0 0 18px;line-height:1.5;';
    const actions = document.createElement('div'); actions.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;';
    const makeButton = (id, label, decision, destructive = false) => { const button = document.createElement('button'); button.type = 'button'; button.id = id; button.dataset.unsavedDecision = decision; button.textContent = label; button.style.cssText = `min-width:112px;padding:8px 12px;border:1px solid ${destructive ? '#c55b5b' : '#9aaabd'};border-radius:4px;background:${destructive ? '#fff5f5' : '#fff'};color:${destructive ? '#9b2525' : '#243047'};`; button.addEventListener('click', () => settle(decision)); return button; };
    let settled = false; let settle;
    const save = makeButton('unsavedSave', '保存して続行', 'save');
    const discard = makeButton('unsavedDiscard', '保存せず続行', 'discard', true);
    const cancel = makeButton('unsavedCancel', 'キャンセル', 'cancel');
    actions.append(save, discard, cancel); panel.append(title, message, actions); dialog.appendChild(panel); document.body.appendChild(dialog);
    const onKey = event => { if (event.key === 'Escape') { event.preventDefault(); settle('cancel'); } else if (event.key === 'Enter' && !event.isComposing) { event.preventDefault(); settle(document.activeElement?.dataset?.unsavedDecision || 'save'); } };
    document.addEventListener('keydown', onKey, true);
    unsavedDialogPromise = new Promise(resolve => { settle = decision => { if (settled) return; settled = true; document.removeEventListener('keydown', onKey, true); dialog.remove(); unsavedDialogPromise = null; resolve(decision); }; });
    save.focus();
    return unsavedDialogPromise;
  };
  window.TimingChartUnsavedChangesDialog = { open: askUnsavedDecision };
  const uiDecision = () => model.persistence.dirty ? askUnsavedDecision() : Promise.resolve('discard');
  tool('新規')?.addEventListener('click', async () => controller.actions.requestNew({ unsavedDecision: await uiDecision() }));
  tool('開く')?.addEventListener('click', async () => controller.actions.requestOpen({ unsavedDecision: await uiDecision() }));
  tool('保存')?.addEventListener('click', () => controller.actions.save());
  const saveAsButton = [...document.querySelectorAll('.tool')].find(button => button.querySelector('.tool-label')?.textContent?.includes('名前を付けて'));
  saveAsButton?.addEventListener('click', () => controller.actions.saveAs());
  tool('Undo')?.addEventListener('click', () => controller.actions.undo());
  tool('Redo')?.addEventListener('click', () => controller.actions.redo());
  const shortcuts = window.TimingChartShortcutRouter;
  shortcuts?.register({ id: 'document.undo', owner: 'production-document', shortcut: 'Ctrl+Z', execute: () => controller.actions.undo() });
  shortcuts?.register({ id: 'document.redo', owner: 'production-document', shortcut: 'Ctrl+Y', execute: () => controller.actions.redo() });
  shortcuts?.register({ id: 'document.redo-shift', owner: 'production-document', shortcut: 'Ctrl+Shift+Z', execute: () => controller.actions.redo() });
  shortcuts?.register({ id: 'document.save', owner: 'production-document', shortcut: 'Ctrl+S', scope: 'any', allowEditable: true, execute: () => controller.actions.save() });
  shortcuts?.register({ id: 'document.save-as', owner: 'production-document', shortcut: 'Ctrl+Shift+S', scope: 'application', execute: () => controller.actions.saveAs() });
  shortcuts?.register({ id: 'document.open', owner: 'production-document', shortcut: 'Ctrl+O', execute: async () => controller.actions.requestOpen({ unsavedDecision: await uiDecision() }) });
  shortcuts?.register({ id: 'document.new', owner: 'production-document', shortcut: 'Ctrl+N', execute: async () => controller.actions.requestNew({ unsavedDecision: await uiDecision() }) });
  shortcuts?.register({ id: 'selection.copy', owner: 'production-document', shortcut: 'Ctrl+C', scope: 'application', execute: () => controller.actions.copySelection() });
  shortcuts?.register({ id: 'selection.cut', owner: 'production-document', shortcut: 'Ctrl+X', scope: 'application', execute: () => controller.actions.cutSelection() });
  shortcuts?.register({ id: 'selection.paste', owner: 'production-document', shortcut: 'Ctrl+V', scope: 'application', execute: () => controller.actions.pasteSelection() });
  shortcuts?.register({ id: 'selection.delete', owner: 'production-document', shortcut: 'Delete', scope: 'application', execute: () => controller.actions.deleteSelection() });
  shortcuts?.register({ id: 'selection.duplicate', owner: 'production-document', shortcut: 'Ctrl+D', scope: 'application', execute: () => controller.actions.duplicateSelection() });
  const installSampleBrowser = () => {
    const menu = document.querySelector('#issue26FileMenu');
    if (!menu || menu.querySelector('[data-sample-browser]')) return Boolean(menu);
    const button = document.createElement('button');
    button.type = 'button'; button.dataset.sampleBrowser = 'true'; button.textContent = 'サンプルを開く…';
    button.style.cssText = 'text-align:left;border:0;background:#fff;padding:6px 10px;';
    button.addEventListener('click', event => { event.stopPropagation(); controller.sampleBrowser?.open(); });
    menu.appendChild(button);
    const dialog = document.createElement('section');
    dialog.id = 'sampleBrowser'; dialog.hidden = true; dialog.setAttribute('role', 'dialog'); dialog.setAttribute('aria-labelledby', 'sampleBrowserTitle');
    dialog.style.cssText = 'position:fixed;z-index:3000;inset:10% 18%;background:#fff;border:1px solid #9aaabd;border-radius:6px;box-shadow:0 16px 48px #10243b55;padding:16px;overflow:auto;font:13px sans-serif;color:#243047;';
    const heading = document.createElement('div'); heading.style.cssText = 'display:flex;align-items:center;gap:8px;border-bottom:1px solid #d7e0ea;padding-bottom:8px;margin-bottom:10px;';
    const title = document.createElement('h2'); title.id = 'sampleBrowserTitle'; title.textContent = 'サンプルを開く'; title.style.margin = '0';
    const close = document.createElement('button'); close.type = 'button'; close.textContent = '閉じる'; close.style.marginLeft = 'auto'; close.addEventListener('click', () => { dialog.hidden = true; });
    heading.append(title, close); dialog.appendChild(heading);
    const intro = document.createElement('p'); intro.textContent = 'サンプルは読み取り専用の参照元です。編集後の保存には Save As が必要です。'; dialog.appendChild(intro);
    const list = document.createElement('div'); list.dataset.sampleList = 'true'; list.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:8px;';
    for (const category of ['protocol', 'feature']) {
      const section = document.createElement('div'); section.dataset.sampleCategory = category; section.style.cssText = 'border:1px solid #d7e0ea;border-radius:4px;padding:8px;';
      const label = document.createElement('h3'); label.textContent = category === 'protocol' ? 'Protocol' : 'Feature coverage'; label.style.margin = '0 0 6px'; section.appendChild(label);
      for (const sample of sampleCatalog.filter(item => item.category === category)) {
        const item = document.createElement('button'); item.type = 'button'; item.dataset.sampleFile = sample.file; item.textContent = sample.title; item.title = sample.file; item.style.cssText = 'display:block;width:100%;text-align:left;border:0;background:#fff;padding:6px;border-radius:3px;';
        item.addEventListener('mouseenter', () => { item.style.background = '#eef5ff'; }); item.addEventListener('mouseleave', () => { item.style.background = '#fff'; });
        item.addEventListener('click', async () => { const ok = await controller.actions.openSample(sample, { unsavedDecision: uiDecision() }); if (ok) dialog.hidden = true; }); section.appendChild(item);
      }
      list.appendChild(section);
    }
    dialog.appendChild(list); document.body.appendChild(dialog);
    controller.sampleBrowser = { open: () => { dialog.hidden = false; }, close: () => { dialog.hidden = true; }, dialog, list };
    return true;
  };
  if (!installSampleBrowser()) setTimeout(installSampleBrowser, 0);
  updateDirty();
})();
