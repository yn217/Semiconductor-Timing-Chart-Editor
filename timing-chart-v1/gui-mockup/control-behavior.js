(() => {
  'use strict';
  const controller = window.TimingChartProductionController;
  if (!controller) return;
  const normalize = value => String(value || '').replace(/[\s\n]+/g, '').trim();
  const label = element => normalize(element.querySelector?.('.tool-label')?.textContent || element.textContent || element.value || element.getAttribute('aria-label'));
  const snapshot = () => {
    const model = controller.model;
    return {
      document: JSON.stringify(controller.getSerializableDocument?.() || model.document),
      view: JSON.stringify(model.view),
      selection: JSON.stringify(model.selection),
      persistence: JSON.stringify({ fileName: model.persistence?.fileName || '', dirty: Boolean(model.persistence?.dirty), savedRevisionHash: model.persistence?.savedRevisionHash || '' }),
      renderedTab: document.querySelector('#bottomContent')?.dataset.renderedTab || '',
      problemFilter: document.querySelector('#bottomContent')?.dataset.problemFilter || '',
      visibleProblemRows: document.querySelectorAll('#bottomContent tbody tr[data-problem-path]:not([hidden])').length,
      jsonFormatRevision: controller.model.jsonFormatRevision || 0,
      jsonValidationRevision: controller.model.jsonValidationRevision || 0,
      problemRefreshRevision: controller.model.problemRefreshRevision || 0,
      clipboardRevision: audit?.clipboardRevision || 0,
      activeRibbon: document.querySelector('.ribbon-tabs .rtab.active')?.textContent?.trim() || '',
      visibleMenus: [...document.querySelectorAll('#issue26FileMenu, #insertNCyclesDialog, [data-scope-menu], [data-status-popup], [data-full-path-dialog], [data-insert-menu], [data-annotation-label-editor], #issue92Popover')].filter(node => !node.hidden && (node.offsetParent !== null || getComputedStyle(node).position === 'fixed')).map(node => { const key = node.id || node.dataset.scopeMenu || node.dataset.statusPopup || node.dataset.fullPathDialog || node.dataset.insertMenu || node.dataset.annotationLabelEditor; const bulk = node.matches('[data-full-path-dialog]') ? `:${node.querySelector('[data-path-bulk]')?.style.display || ''}` : ''; return `${key}${bulk}`; }).sort().join('|'),
      status: document.querySelector('.status span')?.textContent || ''
    };
  };
  const contractFor = element => {
    if (!element || element.disabled || element.hidden) return null;
    if (element.matches('.rtab')) return { type: 'ribbon-tab', owner: 'ribbon-tabs', expected: 'active ribbon and panel change' };
    if (element.matches('.seg')) return { type: 'view-mode', owner: 'production-controller', expected: 'model.view.mode changes' };
    if (element.matches('.btab')) return { type: 'bottom-tab', owner: 'production-controller', expected: 'model.view.tab and rendered bottom content change' };
    if (element.matches('[data-view-command]')) return { type: 'view-command', owner: 'view-ribbon', expected: 'view state or visible view surface changes' };
    if (element.matches('[data-insert-command], [data-insert-menu-command]')) return { type: 'insert-command', owner: 'insert-ribbon', expected: 'menu, document, annotation, or timeline changes' };
    if (element.matches('[data-annotation-command]')) return { type: 'annotation-command', owner: 'annotation-ribbon', expected: 'annotation state or anchor workflow changes' };
    if (element.matches('[data-editor-action], [data-clock-field], [data-comment-field], [data-editor-field]')) return { type: 'editor-command', owner: 'app-ui', expected: 'canonical signal/editor state changes' };
    if (element.matches('[data-json-action]')) return { type: 'json-command', owner: 'app-ui', expected: 'JSON surface, validation, clipboard, or export state changes' };
    if (element.matches('[data-problem-action], [data-problem-filter]')) return { type: 'problem-command', owner: 'app-ui', expected: 'problem filter or validation surface changes' };
    if (element.matches('[data-transaction-action]')) return { type: 'transaction-command', owner: 'app-ui', expected: 'transaction state or selection changes' };
    if (element.matches('[data-file-export]')) return { type: 'export-command', owner: 'app-ui', expected: 'export result/download path is invoked' };
    if (element.matches('.search')) return { type: 'search', owner: 'control-completeness', expected: 'visible tree filtering changes' };
    if (element.matches('#leftAdd')) return { type: 'left-add', owner: 'app-ui', expected: 'add menu opens' };
    if (element.matches('.follow button, #bottomTabs input[type="checkbox"]')) return { type: 'selection-preference', owner: 'production-controller', expected: 'follow/pin state changes' };
    if (element.matches('#ribbonHome .tool')) return { type: 'home-command', owner: 'production-document/view-ribbon', expected: 'document, timeline, export, or view state changes' };
    return null;
  };
  const audit = controller.controlBehaviorAudit = controller.controlBehaviorAudit || { contracts: [], observations: [], failures: [], metrics: { scans: 0, exercised: 0, passed: 0, failed: 0 } };
  const digest = value => {
    const text = String(value || ''); let hash = 2166136261;
    for (let index = 0; index < text.length; index++) { hash ^= text.charCodeAt(index); hash = Math.imul(hash, 16777619); }
    return `${text.length}:${(hash >>> 0).toString(16)}`;
  };
  const compact = value => ({ document: digest(value.document), view: value.view, selection: value.selection, persistence: { fileName: value.persistence?.fileName || '', dirty: value.persistence?.dirty, savedRevisionHash: digest(value.persistence?.savedRevisionHash) }, renderedTab: value.renderedTab, problemFilter: value.problemFilter, visibleProblemRows: value.visibleProblemRows, jsonFormatRevision: value.jsonFormatRevision, jsonValidationRevision: value.jsonValidationRevision, problemRefreshRevision: value.problemRefreshRevision, clipboardRevision: value.clipboardRevision, activeRibbon: value.activeRibbon, visibleMenus: value.visibleMenus, status: value.status });
  audit.snapshot = snapshot;
  audit.describe = element => { const contract = contractFor(element); return contract ? { key: element.dataset.controlKey || `${element.tagName}:${label(element)}`, label: label(element), tag: element.tagName.toLowerCase(), enabled: !element.disabled, ...contract } : null; };
  audit.scan = (root = document) => {
    audit.metrics.scans++;
    const nodes = [...root.querySelectorAll('button,input,select,.tool,.mini-btn,.rtab,.seg,.btab')].filter(element => !element.hidden && element.offsetParent !== null && !element.disabled && !element.readOnly);
    const entries = nodes.map(element => audit.describe(element)).filter(Boolean);
    const unknown = nodes.filter(element => !audit.describe(element)).map(element => ({ label: label(element), tag: element.tagName.toLowerCase(), className: String(element.className) }));
    audit.contracts = entries;
    audit.unknown = unknown;
    return { entries, unknown };
  };
  audit.observe = (element, before, after, { action = 'click', result = true, expectedChange = true } = {}) => {
    const contract = audit.describe(element);
    const changed = JSON.stringify(before) !== JSON.stringify(after);
    const pass = Boolean(contract) && Boolean(result) && (expectedChange ? changed : true);
    const observation = { key: contract?.key || '', label: contract?.label || label(element), type: contract?.type || 'unknown', owner: contract?.owner || '', expected: contract?.expected || '', action, before: compact(before), after: compact(after), changed, result: pass ? 'PASS' : 'FAIL' };
    audit.observations.push(observation);
    audit.metrics.exercised++;
    if (pass) audit.metrics.passed++; else { audit.metrics.failed++; audit.failures.push(observation); }
    return observation;
  };
  audit.snapshot = snapshot;
  setTimeout(() => audit.scan(), 0);
  window.TimingChartControlBehavior = { snapshot, contractFor };
})();
