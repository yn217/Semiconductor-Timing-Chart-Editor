(() => {
  'use strict';

  // #105 responsive Ribbon overflow. Approved policy (product decision on
  // #105): stepped breakpoints rather than shrinking text/buttons
  // indiscriminately.
  //   >= 1600px       Full Ribbon
  //   1280..1599px    Compact Ribbon
  //   1024..1279px    More compact + explicit overflow
  //   < 1024px        Overflow-menu-centered desktop fallback
  // Home priority is per-COMMAND, not per-group: Undo/Redo/Zoom-/Zoom%/
  // Zoom+/Fit All stay directly visible at every collapsed band; Copy/Paste/
  // Delete/Up/Down/Fit Selection stay visible at Compact and collapse from
  // More-compact down; Layout and Display-toggle groups collapse into named
  // overflow triggers; Duplicate and other secondary actions always collapse
  // first. File stays visible down to More-compact and joins overflow only
  // at the <1024 fallback, matching "Overflow-menu-centered".
  // Collapsed elements are relocated (not cloned), so existing click
  // handlers, disabled state, and tooltip metadata travel with them.

  const BREAKPOINTS = { full: 1600, compact: 1280, moreCompact: 1024 };
  const norm = value => String(value || '').replace(/[\s\n]+/g, '').trim();

  const HOME_NAMED_OVERFLOW_GROUPS = new Set(['レイアウト', '表示']);
  const HOME_FILE_GROUP = 'ファイル';
  // 1 = always visible; 2 = visible at Compact, collapses from More-compact;
  // 4 = collapses first, at Compact and below. Unmapped tools default to 2.
  const HOME_TOOL_PRIORITY = new Map([
    ['Undo', 1], ['Redo', 1], ['Zoom−', 1], ['Zoom', 1], ['Zoom＋', 1], ['全体表示', 1],
    ['切取', 2], ['コピー', 2], ['貼付', 2], ['削除', 2], ['上へ', 2], ['下へ', 2], ['選択に合わせる', 2], ['Cycle挿入', 2], ['Cycle削除', 2],
    ['複製', 4], ['NCycle挿入', 4], ['範囲削除', 4],
  ]);

  const currentBand = () => {
    const width = window.innerWidth;
    if (width >= BREAKPOINTS.full) return 'full';
    if (width >= BREAKPOINTS.compact) return 'compact';
    if (width >= BREAKPOINTS.moreCompact) return 'moreCompact';
    return 'fallback';
  };

  const overflowState = new WeakMap(); // element (.rgroup or .tool) -> entry
  const ribbonSharedTrigger = new WeakMap(); // ribbon -> shared "..." entry
  const ribbonGroupsCache = new WeakMap(); // ribbon -> discovered .rgroup[]

  function closeMenu(entry) {
    entry.menu.classList.remove('open');
    entry.trigger.setAttribute('aria-expanded', 'false');
    if (entry._onDocDown) document.removeEventListener('mousedown', entry._onDocDown, true);
    if (entry._onDocKey) document.removeEventListener('keydown', entry._onDocKey, true);
  }

  function openMenu(entry) {
    document.querySelectorAll('.ribbon-overflow-menu.open').forEach(openEl => {
      const other = openEl.__ribbonEntry;
      if (other && other !== entry) closeMenu(other);
    });
    entry.menu.style.left = '-9999px';
    entry.menu.style.top = '-9999px';
    entry.menu.classList.add('open');
    entry.trigger.setAttribute('aria-expanded', 'true');
    const triggerRect = entry.trigger.getBoundingClientRect();
    const menuRect = entry.menu.getBoundingClientRect();
    let left = triggerRect.left;
    let top = triggerRect.bottom + 4;
    if (left + menuRect.width > window.innerWidth - 8) left = Math.max(8, window.innerWidth - 8 - menuRect.width);
    if (top + menuRect.height > window.innerHeight - 8) top = Math.max(8, triggerRect.top - menuRect.height - 4);
    entry.menu.style.left = `${Math.round(left)}px`;
    entry.menu.style.top = `${Math.round(top)}px`;
    entry._onDocDown = event => {
      if (!entry.menu.contains(event.target) && event.target !== entry.trigger) closeMenu(entry);
    };
    entry._onDocKey = event => {
      if (event.key === 'Escape') { closeMenu(entry); entry.trigger.focus(); return; }
      const items = [...entry.menu.querySelectorAll('button:not([disabled]), input:not([disabled])')];
      if (!items.length) return;
      const idx = items.indexOf(document.activeElement);
      if (event.key === 'ArrowDown') { event.preventDefault(); items[(idx + 1 + items.length) % items.length].focus(); }
      else if (event.key === 'ArrowUp') { event.preventDefault(); items[(idx - 1 + items.length) % items.length].focus(); }
    };
    document.addEventListener('mousedown', entry._onDocDown, true);
    document.addEventListener('keydown', entry._onDocKey, true);
    const first = entry.menu.querySelector('button:not([disabled]), input:not([disabled])');
    (first || entry.trigger).focus();
  }

  function makeTrigger(label, title) {
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'ribbon-overflow-trigger';
    trigger.dataset.controlStatus = 'implemented';
    trigger.dataset.ribbonOverflowTrigger = label;
    trigger.innerHTML = `<span class="tool-label">${label}<br>▾</span>`;
    trigger.setAttribute('aria-haspopup', 'true');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.title = title;
    const menu = document.createElement('div');
    menu.className = 'ribbon-overflow-menu';
    menu.setAttribute('role', 'menu');
    document.body.appendChild(menu);
    const entry = { trigger, menu, items: new Map() };
    menu.__ribbonEntry = entry;
    trigger.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      if (entry.menu.classList.contains('open')) closeMenu(entry); else openMenu(entry);
    });
    trigger.addEventListener('keydown', event => {
      if ((event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') && !entry.menu.classList.contains('open')) {
        event.preventDefault();
        openMenu(entry);
      }
    });
    return entry;
  }

  function getSharedEntry(ribbon) {
    let entry = ribbonSharedTrigger.get(ribbon);
    if (!entry) {
      entry = makeTrigger('その他', 'その他の追加コマンド');
      entry.trigger.hidden = true;
      ribbon.appendChild(entry.trigger);
      ribbonSharedTrigger.set(ribbon, entry);
    }
    return entry;
  }

  // Collapse a single element (a whole .rgroup, or one .tool) behind an
  // overflow trigger. `named` gives the element its own dedicated trigger;
  // otherwise it is relocated into the ribbon's single shared "..." trigger.
  function collapseInto(element, ribbon, { named } = {}) {
    let state = overflowState.get(element);
    if (state?.collapsed) return;
    const entry = named
      ? (state?.entry || makeTrigger(named, `${named} の追加コマンド`))
      : getSharedEntry(ribbon);
    if (!state) {
      const placeholder = document.createComment('ribbon-overflow-placeholder');
      state = { entry, placeholder, collapsed: false, named: Boolean(named) };
      overflowState.set(element, state);
    }
    element.parentNode.insertBefore(state.placeholder, element);
    if (named && !entry.trigger.isConnected) {
      element.parentNode.insertBefore(entry.trigger, state.placeholder);
    }
    entry.menu.appendChild(element);
    state.collapsed = true;
    if (!named) {
      entry.trigger.hidden = false;
      entry.items.set(element, true);
    }
  }

  function restoreFrom(element) {
    const state = overflowState.get(element);
    if (!state || !state.collapsed) return;
    closeMenu(state.entry);
    state.placeholder.parentNode.insertBefore(element, state.placeholder);
    if (state.named) state.entry.trigger.remove();
    else state.entry.items.delete(element);
    state.placeholder.remove();
    state.collapsed = false;
    if (!state.named && state.entry.items.size === 0) {
      state.entry.trigger.hidden = true;
      closeMenu(state.entry);
    }
  }

  function layoutHomeRibbon(ribbon, band) {
    const groups = ribbon.__cachedGroups || (ribbon.__cachedGroups = [...ribbon.querySelectorAll('.rgroup')]);
    const shared = getSharedEntry(ribbon);
    groups.forEach(group => {
      if (group.classList.contains('hidden')) return;
      const title = norm(group.querySelector('.rgroup-title')?.textContent);

      if (title === HOME_FILE_GROUP) {
        if (band === 'fallback') collapseInto(group, ribbon, { named: 'ファイル' });
        else restoreFrom(group);
        return;
      }
      if (HOME_NAMED_OVERFLOW_GROUPS.has(title)) {
        if (band === 'full') restoreFrom(group);
        else collapseInto(group, ribbon, { named: title });
        return;
      }
      // Command-level tiering for every other group (編集/行操作/時間軸/ズーム/...).
      // Tools are cached once: after a tool is relocated into an overflow
      // menu it is no longer a descendant of `group`, so a live query here
      // would silently lose track of it and it could never be restored.
      const tools = group.__cachedTools || (group.__cachedTools = [...group.querySelectorAll('.tool')]);
      tools.forEach(tool => {
        const priority = HOME_TOOL_PRIORITY.get(norm(tool.querySelector('.tool-label')?.textContent)) ?? 2;
        const shouldCollapse = band === 'full' ? false
          : band === 'compact' ? priority >= 4
          : priority >= 2; // moreCompact and fallback
        if (shouldCollapse) collapseInto(tool, ribbon);
        else restoreFrom(tool);
      });
    });
    if (shared.items.size === 0) shared.trigger.hidden = true;
  }

  function layoutGenericRibbon(ribbon, band) {
    const groups = ribbon.__cachedGroups || (ribbon.__cachedGroups = [...ribbon.querySelectorAll('.rgroup')]);
    const visible = groups.filter(group => !group.classList.contains('hidden'));
    visible.forEach((group, index) => {
      const alwaysVisible = index === 0;
      if (band !== 'full' && !alwaysVisible) collapseInto(group, ribbon, { named: norm(group.querySelector('.rgroup-title')?.textContent) || 'その他' });
      else restoreFrom(group);
    });
  }

  function layoutRibbon(ribbon) {
    if (!ribbon || ribbon.hidden || ribbon.style.display === 'none') return;
    const band = currentBand();
    if (ribbon.id === 'ribbonHome') layoutHomeRibbon(ribbon, band);
    else layoutGenericRibbon(ribbon, band);
    ribbon.scrollLeft = 0;
  }

  function layoutAll() {
    document.querySelectorAll('.ribbon').forEach(layoutRibbon);
  }

  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(layoutAll, 80);
  });
  document.addEventListener('click', event => {
    if (event.target.closest?.('.rtab, .seg')) setTimeout(layoutAll, 0);
  }, true);

  window.TimingChartResponsiveRibbon = { layoutAll, layoutRibbon, currentBand, BREAKPOINTS };

  const start = () => { layoutAll(); setTimeout(layoutAll, 60); setTimeout(layoutAll, 200); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
