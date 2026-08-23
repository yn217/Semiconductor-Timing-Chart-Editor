(() => {
  'use strict';
  const controller = window.TimingChartProductionController;
  if (!controller) return;
  const model = controller.model;
  const clone = value => structuredClone(value);
  const stable = value => JSON.stringify(value);
  const hash = value => stable(value);
  model.persistence = { fileHandle: null, fileName: 'example.tcd', dirty: false, savedRevisionHash: hash(controller.getSerializableDocument()), lastError: null, operation: { type: 'document', result: 'ready', message: 'Ready', detail: '', action: '' } };
  model.history = { undo: [], redo: [] };
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
    model.persistence.dirty = hash(controller.getSerializableDocument()) !== model.persistence.savedRevisionHash;
    const title = document.querySelector('.titlebar strong');
    const saved = document.querySelector('.titlebar .saved');
    if (title) title.textContent = `タイミングチャートエディタ - ${model.persistence.fileName}`;
    if (saved) saved.textContent = model.persistence.dirty ? 'Modified' : 'Saved';
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
  const record = (label, before, after) => { if (stable(before) === stable(after)) return; model.history.undo.push({ label, before, after }); model.history.redo = []; updateDirty(); };
  // Persistent mutation ownership is defined at each action in the controller.
  // Keep this module responsible for the shared history/dirty/validation boundary,
  // rather than adding another post-hoc wrapper list here.

  const replaceDocument = (nextDocument, { resetHistory = true, render = true } = {}) => {
    model.document = clone(nextDocument);
    model.compatibility = null;
    if (resetHistory) { model.history = { undo: [], redo: [] }; controller.history = model.history; }
    model.validation = [];
    model.crossHighlight = [];
    model.waveGeometry = null;
    controller.waveGeometry = null;
    model.timeSelection = { cycle: 0, rangeStart: null, rangeEnd: null };
    model.editor = { rowIndex: 0 };
    model.selection = { kind: 'signal', id: controller.selectors.getSignals()[0]?.id || null };
    model.view.hiddenSignals = [];
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
  const restore = snapshot => {
    const previousSelection = clone(model.selection);
    const previousView = clone(model.view);
    const previousTimeSelection = clone(model.timeSelection);
    const previousEditor = clone(model.editor);
    const previousDocument = clone(model.document);
    const scrollHost = window.TimingChartTimingViewport?.getScrollHost?.();
    const previousScroll = scrollHost ? { left: scrollHost.scrollLeft, top: scrollHost.scrollTop } : null;
    replaceDocument(snapshot, { resetHistory: false, render: false });
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
    model.view.hiddenSignals = (previousView.hiddenSignals || []).filter(id => model.document.signals.some(signal => signal.id === id));
    controller.repairScope?.();
    controller.render();
    if (previousScroll) requestAnimationFrame(() => { const host = window.TimingChartTimingViewport?.getScrollHost?.(); if (host) { host.scrollLeft = Math.max(0, Math.min(previousScroll.left, host.scrollWidth - host.clientWidth)); host.scrollTop = Math.max(0, Math.min(previousScroll.top, host.scrollHeight - host.clientHeight)); } });
    updateDirty();
  };
  controller.documentHistory = { run(label, mutation, options = {}) {
    const before = clone(controller.getSerializableDocument());
    let result = true;
    try { result = mutation() !== false; } catch (error) { model.persistence.lastError = error.message; result = false; }
    const issues = controller.validateDocument(model.document);
    if (!result || issues.length) { restore(before); model.validation = issues; if (options.render !== false) controller.render(); return false; }
    const after = clone(controller.getSerializableDocument());
    record(label, before, after);
    if (options.render !== false) controller.render();
    return true;
  } };
  controller.actions.undo = () => {
    const entry = model.history.undo.pop();
    if (!entry) return false;
    model.history.redo.push(entry);
    restore(entry.before);
    return true;
  };
  controller.actions.redo = () => {
    const entry = model.history.redo.pop();
    if (!entry) return false;
    model.history.undo.push(entry);
    restore(entry.after);
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
    model.compatibility = null;
    removeCompatibilityPreview();
    model.persistence.savedRevisionHash = documentHash;
    model.persistence.lastError = null;
    publishOperation({ type: 'save', result: 'success', message: `✓ Saved: ${fileName}` });
    updateDirty();
  };
  const prepareSaveText = ({ allowCompatibility = false } = {}) => {
    if (model.compatibility?.saveBlocked && !allowCompatibility) return { error: 'Cannot save a Compatibility Mode document until a compatible target is explicitly established.' };
    let serializable;
    try { serializable = controller.getSerializableDocument(); } catch (error) { return { error: `Cannot save invalid document: ${error.message}` }; }
    const issues = controller.validateDocument(serializable);
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
    replaceDocument(newDocument()); model.persistence.fileHandle = null; model.persistence.fileName = 'Untitled.tcd'; model.persistence.lastError = null; model.persistence.savedRevisionHash = hash(controller.getSerializableDocument()); model.persistence.dirty = false; publishOperation({ type: 'new', result: 'success', message: '✓ New document created' }); updateDirty(); return true;
  };
  const loadText = async (text, fileName = 'example.tcd', unsavedDecision = 'cancel') => {
    if (!await protect(unsavedDecision)) return false;
    let parsed;
    try { parsed = JSON.parse(text); parsed = controller.normalizeExternalDocument(parsed); } catch (error) { const future = error?.code === 'future-format-version'; const preview = controller.analyzeCompatibility?.(text); if (future || preview?.diagnostics?.length) { const fallback = preview || { sourceFormatVersion: Number(error.parsed?.formatVersion), diagnostics: [{ code: 'OPEN_FORMAT_VERSION', severity: 'blocking', path: '$.formatVersion', actual: Number(error.parsed?.formatVersion), message: error.message, reason: 'The source is newer than the supported format.', recommendation: 'Open in Compatibility Mode or cancel.' }], canOpen: false, rawText: text }; model.compatibility = { mode: 'preview', ...fallback, fileName }; controller.renderCompatibilityPreview?.(); publishOperation({ type: 'open', result: 'error', message: future ? '✕ Compatibility Preview' : '✕ Open diagnostics', detail: `${fallback.diagnostics?.length || 1} diagnostics available.` }); return false; } publishOperation({ type: 'open', result: 'error', message: '✕ Could not open file', detail: `Invalid JSON: ${error.message}` }); return false; }
    const issues = controller.validateDocument(parsed);
    if (parsed?.formatVersion !== 2 || issues.length) { const detail = `Invalid .tcd document: ${issues.map(issue => issue.code).join(', ') || 'unsupported formatVersion'}`; model.validation = issues; publishOperation({ type: 'open', result: 'error', message: '✕ Could not open file', detail, action: issues.length ? 'problems' : '' }); return false; }
    replaceDocument(parsed); model.persistence.fileName = fileName; model.persistence.fileHandle = null; model.persistence.savedRevisionHash = hash(controller.getSerializableDocument()); model.persistence.dirty = false; const importWarnings = controller.getImportWarnings?.() || []; publishOperation({ type: 'open', result: importWarnings.length ? 'warning' : 'success', message: `✓ Opened: ${fileName}`, detail: importWarnings.length ? importWarnings.map(warning => `${warning.path}: ${warning.reason}`).join('\n') : '' }); updateDirty(); return true;
  };
  controller.actions.openText = (text, options = {}) => loadText(text, options.fileName || 'example.tcd', options.unsavedDecision || 'cancel');
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
  controller.actions.requestOpen = async ({ text, fileName, unsavedDecision = 'cancel' } = {}) => {
    if (text !== undefined) return loadText(text, fileName || 'example.tcd', unsavedDecision);
    if (window.showOpenFilePicker) { try { const [handle] = await window.showOpenFilePicker({ types: [{ description: 'Timing Chart', accept: { 'application/json': ['.tcd'] } }] }); const file = await handle.getFile(); const result = await loadText(await file.text(), file.name, unsavedDecision); if (result) model.persistence.fileHandle = handle; return result; } catch (error) { if (error.name === 'AbortError') publishOperation({ type: 'open', result: 'neutral', message: 'Open canceled' }); else publishOperation({ type: 'open', result: 'error', message: '✕ Could not open file', detail: error.message }); return false; } }
    const input = document.createElement('input'); input.type = 'file'; input.accept = '.tcd,application/json'; input.hidden = true; document.body.appendChild(input); input.click(); return new Promise(resolve => { input.addEventListener('change', async () => { const file = input.files?.[0]; const result = file ? await loadText(await file.text(), file.name, unsavedDecision) : false; input.remove(); resolve(result); }, { once: true }); });
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
  const askUnsavedDecision = () => { const answer = window.prompt('未保存の変更があります。Save / Discard / Cancel を入力してください。', 'Cancel')?.trim().toLowerCase(); return answer === 'save' || answer === 'discard' ? answer : 'cancel'; };
  const uiDecision = () => model.persistence.dirty ? askUnsavedDecision() : 'discard';
  tool('新規')?.addEventListener('click', () => controller.actions.requestNew({ unsavedDecision: uiDecision() }));
  tool('開く')?.addEventListener('click', () => controller.actions.requestOpen({ unsavedDecision: uiDecision() }));
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
  shortcuts?.register({ id: 'document.open', owner: 'production-document', shortcut: 'Ctrl+O', execute: () => controller.actions.requestOpen({ unsavedDecision: uiDecision() }) });
  shortcuts?.register({ id: 'document.new', owner: 'production-document', shortcut: 'Ctrl+N', execute: () => controller.actions.requestNew({ unsavedDecision: uiDecision() }) });
  updateDirty();
})();
