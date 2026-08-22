(() => {
  'use strict';

  const handlers = [];
  const editableSelector = 'input, textarea, select, [contenteditable="true"], [data-json-editor], .code';
  const isEditable = target => Boolean(target?.closest?.(editableSelector));
  const normalizeKey = key => String(key || '').toLowerCase() === ' ' ? 'space' : String(key || '').toLowerCase();
  const descriptor = event => {
    const modifiers = [];
    if (event.ctrlKey || event.metaKey) modifiers.push('ctrl');
    if (event.shiftKey) modifiers.push('shift');
    if (event.altKey) modifiers.push('alt');
    if (event.key === 'Meta' || event.key === 'Control' || event.key === 'Shift' || event.key === 'Alt') return '';
    modifiers.push(normalizeKey(event.key));
    return modifiers.join('+');
  };
  const parse = shortcut => String(shortcut).toLowerCase().split('+').map(normalizeKey).join('+');
  const register = definition => {
    if (!definition?.id || typeof definition.execute !== 'function') throw new TypeError('Shortcut registration requires id and execute');
    const entry = { scope: 'application', priority: 0, preventDefault: true, ...definition, shortcut: parse(definition.shortcut) };
    handlers.push(entry);
    handlers.sort((a, b) => b.priority - a.priority);
    return () => { const index = handlers.indexOf(entry); if (index >= 0) handlers.splice(index, 1); };
  };
  const unregisterOwner = owner => { for (let index = handlers.length - 1; index >= 0; index--) if (handlers[index].owner === owner) handlers.splice(index, 1); };
  const route = event => {
    if (event.isComposing || event.keyCode === 229) return;
    const shortcut = descriptor(event); if (!shortcut) return;
    const editable = isEditable(event.target);
    for (const entry of handlers) {
      if (entry.shortcut !== shortcut) continue;
      if (entry.scope === 'editable' && !editable) continue;
      if (entry.scope === 'application' && editable && !entry.allowEditable) continue;
      if (entry.when && !entry.when(event, { editable })) continue;
      const handled = entry.execute(event, { editable });
      if (handled === false) continue;
      if (entry.preventDefault) event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
  };
  document.addEventListener('keydown', route, true);
  window.TimingChartShortcutRouter = { register, unregisterOwner, isEditableTarget: isEditable, describe: descriptor, get registrations() { return handlers.map(({ execute, when, ...entry }) => ({ ...entry })); } };
})();
