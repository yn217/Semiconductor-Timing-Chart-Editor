(() => {
  'use strict';

  // #105 responsive Ribbon overflow: at compact desktop widths (<1600px), keep
  // Home's File/Edit/Zoom groups directly reachable and move every other
  // Ribbon group into a named overflow trigger instead of relying on
  // horizontal Ribbon scrolling. Groups are relocated (not cloned), so their
  // existing click handlers, disabled state, and tooltip metadata travel with
  // them unchanged.

  const BREAKPOINT_FULL = 1600;
  const HOME_ALWAYS_VISIBLE = new Set(['ファイル', '編集', 'ズーム']);
  const norm = value => String(value || '').replace(/[\s\n]+/g, '').trim();

  const groupState = new WeakMap(); // .rgroup element -> overflow entry
  const ribbonGroupsCache = new WeakMap(); // .ribbon element -> discovered .rgroup[]

  const currentBand = () => (window.innerWidth >= BREAKPOINT_FULL ? 'full' : 'compact');

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

  function collapseGroup(group) {
    let entry = groupState.get(group);
    if (entry?.collapsed) return;
    const title = norm(group.querySelector('.rgroup-title')?.textContent) || 'その他';
    if (!entry) {
      const trigger = document.createElement('button');
      trigger.type = 'button';
      trigger.className = 'ribbon-overflow-trigger';
      trigger.dataset.controlStatus = 'implemented';
      trigger.dataset.ribbonOverflowTrigger = title;
      trigger.innerHTML = `<span class="tool-label">${title}<br>▾</span>`;
      trigger.setAttribute('aria-haspopup', 'true');
      trigger.setAttribute('aria-expanded', 'false');
      trigger.title = `${title} の追加コマンド`;

      const menu = document.createElement('div');
      menu.className = 'ribbon-overflow-menu';
      menu.setAttribute('role', 'menu');

      const placeholder = document.createComment(`ribbon-overflow:${title}`);
      entry = { trigger, menu, placeholder, group, collapsed: false };
      menu.__ribbonEntry = entry;
      document.body.appendChild(menu);

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
      groupState.set(group, entry);
    }
    group.parentNode.insertBefore(entry.placeholder, group);
    group.parentNode.insertBefore(entry.trigger, entry.placeholder);
    entry.menu.appendChild(group);
    entry.collapsed = true;
  }

  function restoreGroup(group) {
    const entry = groupState.get(group);
    if (!entry || !entry.collapsed) return;
    closeMenu(entry);
    entry.placeholder.parentNode.insertBefore(group, entry.placeholder);
    entry.trigger.remove();
    entry.placeholder.remove();
    entry.collapsed = false;
  }

  function layoutRibbon(ribbon) {
    if (!ribbon || ribbon.hidden || ribbon.style.display === 'none') return;
    let groups = ribbonGroupsCache.get(ribbon);
    if (!groups) {
      groups = [...ribbon.querySelectorAll('.rgroup')];
      ribbonGroupsCache.set(ribbon, groups);
    }
    const band = currentBand();
    const visible = groups.filter(group => !group.classList.contains('hidden'));
    visible.forEach((group, index) => {
      const alwaysVisible = ribbon.id === 'ribbonHome'
        ? HOME_ALWAYS_VISIBLE.has(norm(group.querySelector('.rgroup-title')?.textContent))
        : index === 0;
      if (band === 'compact' && !alwaysVisible) collapseGroup(group); else restoreGroup(group);
    });
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

  window.TimingChartResponsiveRibbon = { layoutAll, layoutRibbon, currentBand, BREAKPOINT_FULL };

  const start = () => { layoutAll(); setTimeout(layoutAll, 60); setTimeout(layoutAll, 200); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
