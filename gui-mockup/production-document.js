(() => {
  'use strict';
  const controller = window.TimingChartProductionController;
  if (!controller) return;
  const model = controller.model;
  const clone = value => structuredClone(value);
  const stable = value => JSON.stringify(value);
  const hash = value => stable(value);
  model.persistence = { fileHandle: null, fileName: 'example.tcd', dirty: false, savedRevisionHash: hash(controller.getSerializableDocument()), lastError: null };
  model.history = { undo: [], redo: [] };

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
  };
  const repairSelection = () => {
    const id = model.selection?.id;
    const exists = controller.selectors.getSignals().some(signal => signal.id === id) || controller.selectors.getComments().some(comment => comment.id === id);
    if (!exists) model.selection = { kind: 'signal', id: controller.selectors.getSignals()[0]?.id || null };
    model.editor.rowIndex = 0;
  };
  const validateCurrent = () => controller.validateDocument(model.document);
  const record = (label, before, after) => { if (stable(before) === stable(after)) return; model.history.undo.push({ label, before, after }); model.history.redo = []; updateDirty(); };
  const wrapMutation = (name, label) => {
    const original = controller.actions[name];
    controller.actions[name] = (...args) => {
      const before = clone(controller.getSerializableDocument());
      const result = original(...args);
      const after = clone(controller.getSerializableDocument());
      if (result) record(label, before, after); else updateDirty();
      return result;
    };
  };
  for (const [name, label] of [['updateSignalValue', 'Change signal value'], ['addSignalValue', 'Add signal value'], ['duplicateSignalValue', 'Duplicate signal value'], ['deleteSignalValue', 'Delete signal value'], ['updateClock', 'Change clock'], ['updateComment', 'Change comment']]) wrapMutation(name, label);

  const replaceDocument = (nextDocument, { resetHistory = true, render = true } = {}) => {
    model.document = clone(nextDocument);
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
    replaceDocument(snapshot, { resetHistory: false, render: false });
    controller.render();
    updateDirty();
  };
  controller.documentHistory = { run(label, mutation) {
    const before = clone(controller.getSerializableDocument());
    let result = true;
    try { result = mutation() !== false; } catch (error) { model.persistence.lastError = error.message; result = false; }
    const issues = controller.validateDocument(model.document);
    if (!result || issues.length) { restore(before); model.validation = issues; controller.render(); return false; }
    const after = clone(controller.getSerializableDocument());
    record(label, before, after);
    controller.render();
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
    formatVersion: 1,
    document: { id: 'untitled.tcd', title: 'Untitled', header: { subtitle: '', description: '', notes: '', preconditions: [], constraints: [], exceptions: [] }, footer: { figureNumber: '', revision: '', text: '' } },
    timeline: { start: 0, end: 1, timeBase: 'cycle', cycleCount: 1, referenceClock: 'clk', edge: 'rising' },
    signalGroups: [{ id: 'group_input', name: '入力 (Input)', rows: ['clk'] }],
    signals: [{ id: 'clk', name: 'clk', type: 'clock', role: 'input', generator: { start: 0, period: 1, duty: 0.5, phase: 0, initial: 0, polarity: 'positive' }, edgeCounter: { show: true, mode: 'rising', startNumber: 1, countFrom: 'signal-start', labelEvery: 1, position: 'above', offset: { x: 0, y: -6 } } }],
    annotations: [], legend: { orientation: 'horizontal', usedRolesOnly: true }, layout: { roleColumnWidth: 32, signalNameWidth: 168, signalNameAlign: 'left', busWidthAlign: 'left', pathDisplayMode: 'signalOnly', instancePathAlign: 'left', instancePathWidth: 180, busWidthMode: 'inline', rowHeight: 28, signalSpacing: 6, overflow: 'ellipsis' }, transactions: [], constraints: []
  });
  const commitSaveSuccess = ({ fileHandle = model.persistence.fileHandle, fileName = model.persistence.fileName, documentHash }) => {
    model.persistence.fileHandle = fileHandle;
    model.persistence.fileName = fileName;
    model.persistence.savedRevisionHash = documentHash;
    model.persistence.lastError = null;
    updateDirty();
  };
  const prepareSaveText = () => {
    const serializable = controller.getSerializableDocument();
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
    if (!await protect(unsavedDecision)) return false;
    replaceDocument(newDocument()); model.persistence.fileHandle = null; model.persistence.fileName = 'Untitled.tcd'; model.persistence.lastError = null; model.persistence.savedRevisionHash = hash(controller.getSerializableDocument()); model.persistence.dirty = false; updateDirty(); return true;
  };
  const loadText = async (text, fileName = 'example.tcd', unsavedDecision = 'cancel') => {
    if (!await protect(unsavedDecision)) return false;
    let parsed;
    try { parsed = JSON.parse(text); parsed = normalizeExternalDocument(parsed); } catch (error) { model.persistence.lastError = `Invalid JSON: ${error.message}`; return false; }
    const issues = controller.validateDocument(parsed);
    if (parsed?.formatVersion !== 1 || issues.length) { model.persistence.lastError = `Invalid .tcd document: ${issues.map(issue => issue.code).join(', ') || 'unsupported formatVersion'}`; return false; }
    replaceDocument(parsed); model.persistence.fileName = fileName; model.persistence.fileHandle = null; model.persistence.savedRevisionHash = hash(controller.getSerializableDocument()); model.persistence.dirty = false; model.persistence.lastError = null; updateDirty(); return true;
  };
  controller.actions.openText = (text, options = {}) => loadText(text, options.fileName || 'example.tcd', options.unsavedDecision || 'cancel');
  controller.actions.requestOpen = async ({ text, fileName, unsavedDecision = 'cancel' } = {}) => {
    if (text !== undefined) return loadText(text, fileName || 'example.tcd', unsavedDecision);
    if (window.showOpenFilePicker) { try { const [handle] = await window.showOpenFilePicker({ types: [{ description: 'Timing Chart', accept: { 'application/json': ['.tcd'] } }] }); const file = await handle.getFile(); const result = await loadText(await file.text(), file.name, unsavedDecision); if (result) model.persistence.fileHandle = handle; return result; } catch (error) { model.persistence.lastError = error.name === 'AbortError' ? null : error.message; return false; } }
    const input = document.createElement('input'); input.type = 'file'; input.accept = '.tcd,application/json'; input.hidden = true; document.body.appendChild(input); input.click(); return new Promise(resolve => { input.addEventListener('change', async () => { const file = input.files?.[0]; const result = file ? await loadText(await file.text(), file.name, unsavedDecision) : false; input.remove(); resolve(result); }, { once: true }); });
  };
  controller.actions.saveAs = async ({ fileName = 'Untitled.tcd' } = {}) => {
    const prepared = prepareSaveText(); if (prepared.error) { model.persistence.lastError = prepared.error; return false; }
    if (window.showSaveFilePicker) { try { const handle = await window.showSaveFilePicker({ suggestedName: fileName, types: [{ description: 'Timing Chart', accept: { 'application/json': ['.tcd'] } }] }); const writable = await handle.createWritable(); await writable.write(prepared.text); await writable.close(); commitSaveSuccess({ fileHandle: handle, fileName, documentHash: prepared.documentHash }); return true; } catch (error) { model.persistence.lastError = error.name === 'AbortError' ? null : error.message; return false; } }
    const blob = new Blob([prepared.text], { type: 'application/json;charset=utf-8' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = fileName.endsWith('.tcd') ? fileName : `${fileName}.tcd`; link.hidden = true; document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url); commitSaveSuccess({ fileHandle: null, fileName: link.download, documentHash: prepared.documentHash }); return true;
  };
  controller.actions.save = async () => {
    const prepared = prepareSaveText(); if (prepared.error) { model.persistence.lastError = prepared.error; return false; }
    if (model.persistence.fileHandle) { try { const writable = await model.persistence.fileHandle.createWritable(); await writable.write(prepared.text); await writable.close(); commitSaveSuccess({ fileHandle: model.persistence.fileHandle, fileName: model.persistence.fileName, documentHash: prepared.documentHash }); return true; } catch (error) { model.persistence.lastError = error.message; return false; } }
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
