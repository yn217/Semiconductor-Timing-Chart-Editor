(() => {
  'use strict';

  const controller = window.TimingChartProductionController;
  if (!controller?.model) return;
  const model = controller.model;
  const icon = id => `<svg aria-hidden="true"><use href="icons.svg#${id}"></use></svg>`;
  const normalize = value => String(value || '').replace(/[\s\n]+/g, '').trim();
  const view = model.view;
  view.guides ??= { grid: true, snap: true, ruler: true, minimap: true };
  view.columns ??= { signalName: true, role: true, busWidth: true, instancePath: true };
  view.overlays ??= { comment: true, annotation: true, edgeCounter: true };
  view.panels ??= { inspector: true, left: true, bottom: true, waveformOnly: false };

  const button = (id, label, iconId, description, handler) => {
    const node = document.createElement('button');
    node.type = 'button'; node.className = 'tool'; node.dataset.viewCommand = id;
    node.dataset.tooltipMeta = JSON.stringify({ id, label, description, affects: 'view presentation only' });
    node.title = description; node.innerHTML = `${icon(iconId)}<span class="tool-label">${label}</span>`;
    node.dataset.controlStatus = 'implemented';
    node.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); handler(event); });
    return node;
  };
  const toggle = (id, label, iconId, group, key, description) => {
    const node = button(id, label, iconId, description, () => {
      if (group === 'guides') return controller.actions.toggleGuide(key);
      if (group === 'columns') view.columns[key] = !view.columns[key];
      if (group === 'overlays') view.overlays[key] = !view.overlays[key];
      apply(); refresh();
    });
    node.dataset.viewGroup = group; node.dataset.viewKey = key;
    return node;
  };
  const group = (title, children) => {
    const node = document.createElement('div'); node.className = 'rgroup'; children.forEach(child => node.appendChild(child));
    const caption = document.createElement('div'); caption.className = 'rgroup-title'; caption.textContent = title; node.appendChild(caption); return node;
  };

  const ribbon = document.createElement('div');
  ribbon.id = 'ribbonView'; ribbon.className = 'ribbon'; ribbon.hidden = true; ribbon.style.display = 'none';
  ribbon.dataset.ribbonPanel = 'view';
  ribbon.append(
    group('ガイド', [
      toggle('grid', 'グリッド', 'i-spacing', 'guides', 'grid', 'Grid overlayを表示/非表示'),
      toggle('snap', 'スナップ', 'i-spacing', 'guides', 'snap', 'Snap interactionを有効/無効'),
      toggle('ruler', 'ルーラー', 'i-spacing', 'guides', 'ruler', 'Rulerを表示/非表示'),
      toggle('minimap', 'ミニマップ', 'i-eye', 'guides', 'minimap', 'MiniMapを表示/非表示')
    ]),
    group('信号表示', [
      toggle('signal-name', '信号名', 'i-search', 'columns', 'signalName', 'Signal name columnを表示/非表示'),
      toggle('role', 'Role', 'i-comment', 'columns', 'role', 'Role icon columnを表示/非表示'),
      toggle('bus-width', 'Bus幅', 'i-spacing', 'columns', 'busWidth', 'Bus width columnを表示/非表示'),
      toggle('instance-path', 'Instance Path', 'i-search', 'columns', 'instancePath', 'Instance path columnを表示/非表示')
    ]),
    group('オーバーレイ', [
      toggle('comment-overlay', 'Comment', 'i-comment', 'overlays', 'comment', 'Comment Row overlayを表示/非表示'),
      toggle('annotation-overlay', 'Annotation', 'i-comment', 'overlays', 'annotation', 'Annotation overlayを表示/非表示'),
      toggle('edge-counter', 'Edge Counter', 'i-spacing', 'overlays', 'edgeCounter', 'Edge counter overlayを表示/非表示')
    ]),
    group('階層', [
      button('signal-only', 'Signal only', 'i-search', 'Signal only表示', () => setPath(PATH.SIGNAL_ONLY)),
      button('relative', 'Relative', 'i-search', 'Relative path表示', () => setPath(PATH.RELATIVE)),
      button('full-path', 'Full Path', 'i-search', 'Full path表示', () => setPath(PATH.FULL)),
      button('split-columns', 'Split Columns', 'i-search', 'Instance / signal / bus幅を分割表示', () => setPath(PATH.SPLIT_COLUMNS)),
      button('scope', 'Scope', 'i-search', '現在の文書階層からScopeを選択', () => controller.viewRibbon?.openScopeMenu?.())
    ]),
    group('パネル', [
      button('inspector', 'Inspector', 'i-settings', 'Inspectorを表示/非表示', () => { view.panels.inspector = !view.panels.inspector; apply(); refresh(); }),
      button('left-panel', '左パネル', 'i-settings', '左パネルを表示/非表示', () => { view.panels.left = !view.panels.left; apply(); refresh(); }),
      button('bottom-panel', '下パネル', 'i-settings', '下パネルを表示/非表示', () => { view.panels.bottom = !view.panels.bottom; apply(); refresh(); }),
      button('waveform-only', 'Waveform only', 'i-fit', '他パネルを一時的に隠し、再度押すと復元', () => toggleWaveformOnly())
    ]),
    group('ズーム', [
      button('zoom-minus', 'Zoom\n−', 'i-zoom-out', 'Timing geometryだけを縮小', () => controller.actions.setZoom(Math.max(25, Math.round(view.zoom * 100) - 10))),
      button('zoom-reset', '100%', 'i-fit', 'Timing geometryを100%へ戻す', () => controller.actions.setZoom(100)),
      button('zoom-plus', 'Zoom\n＋', 'i-zoom-in', 'Timing geometryだけを拡大', () => controller.actions.setZoom(Math.min(400, Math.round(view.zoom * 100) + 10))),
      button('fit-all', '全体\n表示', 'i-fit', '全時間軸を表示', () => controller.actions.fitAll()),
      button('fit-selection', '選択に\n合わせる', 'i-select-fit', '選択範囲へ合わせる', () => controller.actions.fitSelection())
    ])
  );
  document.querySelector('#ribbonHome')?.after(ribbon);

  controller.actions.setGuide = (key, enabled) => {
    if (!Object.prototype.hasOwnProperty.call(view.guides, key)) return false;
    view.guides[key] = Boolean(enabled); apply(); refresh(); return true;
  };
  controller.actions.toggleGuide = key => controller.actions.setGuide(key, !view.guides[key]);

  const PATH = window.TimingChartPathDisplayModes;
  const setPath = mode => controller.actions.setPathDisplayMode?.(mode);
  const openScopeMenu = () => {
    document.querySelector('[data-scope-menu]')?.remove();
    const menu = document.createElement('div'); menu.dataset.scopeMenu = 'true'; menu.style.cssText = 'position:fixed;z-index:2200;min-width:220px;max-height:360px;overflow:auto;padding:6px;background:#fff;border:1px solid #b8c5d4;border-radius:5px;box-shadow:0 8px 24px #0003;font:12px sans-serif;color:#243047;';
    const target = ribbon.querySelector('[data-view-command="scope"]'); const rect = target?.getBoundingClientRect(); menu.style.left = `${Math.max(4, rect?.left || 4)}px`; menu.style.top = `${Math.min(window.innerHeight - 370, (rect?.bottom || 30) + 4)}px`;
    const current = view.scope || []; const currentLabel = current.length ? current.join(' > ') : 'Root / Show All';
    const title = document.createElement('div'); title.textContent = `Current Scope: ${currentLabel}`; title.style.cssText = 'font-weight:600;padding:6px 8px;border-bottom:1px solid #e4e9f0;margin-bottom:4px;'; menu.appendChild(title);
    const add = (label, scope, disabled = false) => { const item = document.createElement('button'); item.type = 'button'; item.textContent = label; item.disabled = disabled; item.dataset.scope = scope.join('.'); item.style.cssText = 'display:block;width:100%;text-align:left;border:0;background:#fff;padding:6px 8px;border-radius:3px;'; if (!disabled) item.addEventListener('mouseenter', () => { item.style.background = '#eef5ff'; }); item.addEventListener('click', () => { if (!disabled) { controller.actions.setScope(scope); menu.remove(); } }); menu.appendChild(item); };
    add('Root / Show All', [], current.length === 0); add('Parent', current.slice(0, -1), current.length === 0);
    const scopes = controller.hierarchy?.getScopePaths?.() || [];
    if (!scopes.some(scope => scope.length)) { const empty = document.createElement('div'); empty.textContent = 'この文書に選択可能な階層はありません'; empty.style.cssText = 'padding:8px;color:#68768a;'; menu.appendChild(empty); }
    for (const scope of scopes.filter(scope => scope.length)) add(scope.join(' > '), scope, scope.join('.') === current.join('.'));
    document.body.appendChild(menu); const close = event => { if (!event.target.closest('[data-scope-menu]')) { menu.remove(); document.removeEventListener('pointerdown', close); } }; setTimeout(() => document.addEventListener('pointerdown', close), 0);
  };
  let savedPanels = null;
  const toggleWaveformOnly = () => {
    if (!view.panels.waveformOnly) {
      savedPanels = { inspector: view.panels.inspector, left: view.panels.left, bottom: view.panels.bottom, bottomHeight: Number(view.bottomHeight || document.querySelector('.bottom')?.getBoundingClientRect().height || 270) };
      view.panels = { ...view.panels, inspector: false, left: false, bottom: false, waveformOnly: true };
    } else {
      view.panels = { ...view.panels, ...(savedPanels || { inspector: true, left: true, bottom: true }), waveformOnly: false };
      if (savedPanels?.bottomHeight) view.bottomHeight = savedPanels.bottomHeight;
      savedPanels = null;
    }
    apply(); refresh();
  };

  const style = document.createElement('style');
  style.dataset.viewRibbonRuntime = 'true';
  style.textContent = `
    #cycleCanvas[data-view-ruler="off"] .ruler{visibility:hidden!important}
    #cycleCanvas[data-view-grid="off"] [data-live-grid]{display:none!important}
    #cycleCanvas[data-view-comments="off"] .comment-body,#cycleCanvas[data-view-comments="off"] .latency{visibility:hidden!important}
    #cycleCanvas[data-view-annotations="off"] svg[data-production-overlay="annotations"]{display:none!important}
    #cycleCanvas[data-view-edge-counter="off"] [data-edge-counter],[data-view-edge-counter="off"] .edge-counter{display:none!important}
  `;
  document.head.appendChild(style);

  const scrollHost = () => window.TimingChartTimingViewport?.getScrollHost?.() || document.querySelector('#cycleCanvas');
  let gridFrame = 0;
  let minimapFrame = 0;
  let minimapViewportFrame = 0;
  const viewMetrics = controller.viewMetrics = controller.viewMetrics || { gridRebuilds: 0, gridBoundaryResolutions: 0, minimapOverviewRebuilds: 0, minimapViewportUpdates: 0 };
  const scheduleGrid = () => { if (gridFrame) return; gridFrame = requestAnimationFrame(() => { gridFrame = 0; renderGrid(); }); };
  const scheduleMinimap = () => { if (minimapFrame) return; minimapFrame = requestAnimationFrame(() => { minimapFrame = 0; renderMinimap(); }); };
  const scheduleMinimapViewport = () => { if (minimapViewportFrame) return; minimapViewportFrame = requestAnimationFrame(() => { minimapViewportFrame = 0; updateMinimapViewport(); }); };
  const boundaryPoints = () => {
    const clock = controller.selectors?.getReferenceClock?.();
    const count = Number(model.document.timeline?.cycleCount || 0);
    if (!clock || !controller.getCycleBoundary) return [];
    viewMetrics.gridBoundaryResolutions += count + 1;
    return Array.from({ length: count + 1 }, (_, cycle) => controller.getCycleBoundary({ signal: clock.id, cycle, coordinateSpace: 'canvas' })).filter(Boolean);
  };
  const renderGrid = () => {
    const host = scrollHost(); if (!host) return;
    viewMetrics.gridRebuilds += 1;
    if (controller.renderMetrics) { controller.renderMetrics.gridRebuilds += 1; controller.renderMetrics.gridBoundaryResolutions += 1; }
    let grid = document.querySelector('#cycleCanvas [data-live-grid]');
    if (!grid) { grid = document.createElement('div'); grid.dataset.liveGrid = 'true'; grid.setAttribute('aria-hidden', 'true'); host.appendChild(grid); }
    if (!view.guides.grid) { grid.hidden = true; return; }
    grid.hidden = false; grid.replaceChildren();
    const hostRect = host.getBoundingClientRect();
    grid.style.cssText = `position:absolute;left:0;top:0;width:${Math.max(host.scrollWidth, host.clientWidth)}px;height:${Math.max(host.scrollHeight, host.clientHeight)}px;pointer-events:none;z-index:1;overflow:hidden;`;
    const top = Math.max(32, document.querySelector('#cycleCanvas .ruler')?.offsetHeight || 34);
    for (const boundary of boundaryPoints()) {
      const line = document.createElement('i');
      line.dataset.gridCycle = String(boundary.cycle);
      line.style.cssText = `position:absolute;left:${boundary.canvasX - hostRect.left + host.scrollLeft}px;top:${top}px;height:${Math.max(0, host.scrollHeight - top)}px;border-left:1px dotted #dde4ed;`;
      grid.appendChild(line);
    }
  };
  const updateMinimapViewport = () => {
    const host = scrollHost(); const mini = document.querySelector('.inspector .mini-canvas'); const windowNode = mini?.querySelector('.mini-window'); if (!host || !mini || !windowNode || !view.guides.minimap) return;
    viewMetrics.minimapViewportUpdates += 1;
    if (controller.renderMetrics) controller.renderMetrics.minimapViewportUpdates += 1;
    const contentWidth = Math.max(host.scrollWidth, host.clientWidth); const contentHeight = Math.max(host.scrollHeight, host.clientHeight);
    windowNode.dataset.viewport = 'true'; windowNode.style.left = `${Math.max(0, host.scrollLeft / contentWidth * 100)}%`; windowNode.style.top = `${Math.max(0, host.scrollTop / contentHeight * 100)}%`; windowNode.style.width = `${Math.min(100, host.clientWidth / contentWidth * 100)}%`; windowNode.style.height = `${Math.min(100, host.clientHeight / contentHeight * 100)}%`; windowNode.title = `Viewport ${Math.round(host.scrollLeft)},${Math.round(host.scrollTop)}`;
  };
  const renderMinimap = () => {
    const host = scrollHost(); const mini = document.querySelector('.inspector .mini-canvas');
    if (!host || !mini) return;
    viewMetrics.minimapOverviewRebuilds += 1;
    if (controller.renderMetrics) controller.renderMetrics.minimapOverviewRebuilds += 1;
    if (!view.guides.minimap) { mini.dataset.live = 'false'; return; }
    mini.dataset.live = 'true'; mini.style.position = 'relative';
    const wave = document.querySelector('#cycleCanvas .wave'); const hostRect = host.getBoundingClientRect();
    if (wave) {
      const rowsForExtent = [...document.querySelectorAll('#cycleCanvas .wave-row')];
      const maxRight = Math.max(wave.getBoundingClientRect().right - hostRect.left + host.scrollLeft, ...rowsForExtent.map(row => row.getBoundingClientRect().right - hostRect.left + host.scrollLeft));
      const maxBottom = Math.max(wave.getBoundingClientRect().bottom - hostRect.top + host.scrollTop, ...rowsForExtent.map(row => row.getBoundingClientRect().bottom - hostRect.top + host.scrollTop));
      wave.style.minWidth = `${Math.max(920, Math.ceil(maxRight + 24))}px`;
      wave.style.minHeight = `${Math.max(0, Math.ceil(maxBottom + 20))}px`;
    }
    let svg = mini.querySelector('[data-live-minimap]');
    if (!svg) { svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.dataset.liveMinimap = 'true'; svg.setAttribute('aria-label', 'Live timing overview'); svg.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;'; mini.appendChild(svg); }
    const width = Math.max(1, mini.clientWidth); const height = Math.max(1, mini.clientHeight); const contentWidth = Math.max(host.scrollWidth, host.clientWidth); const contentHeight = Math.max(host.scrollHeight, host.clientHeight);
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`); svg.replaceChildren();
    const rows = [...document.querySelectorAll('#cycleCanvas .wave-row')];
    rows.forEach((row, index) => { const rect = row.getBoundingClientRect(); const x = Math.max(0, (rect.left - hostRect.left + host.scrollLeft) / contentWidth * width); const y = Math.max(0, (rect.top - hostRect.top + host.scrollTop) / contentHeight * height); const w = Math.max(2, Math.min(width - x, (row.querySelector('.trace')?.getBoundingClientRect().width || contentWidth * 0.7) / contentWidth * width)); const line = document.createElementNS('http://www.w3.org/2000/svg', 'rect'); line.dataset.minimapRow = row.dataset.signalId || row.dataset.signal || String(index); line.setAttribute('x', x); line.setAttribute('y', y); line.setAttribute('width', w); line.setAttribute('height', Math.max(1, Math.min(4, rect.height / contentHeight * height))); line.setAttribute('fill', row.classList.contains('band-output') ? '#b887ee' : row.classList.contains('band-internal') ? '#63b56b' : '#5a99ee'); svg.appendChild(line); });
    updateMinimapViewport();
  };
  const panMiniMap = (clientX, clientY, drag = false) => {
    const host = scrollHost(); const mini = document.querySelector('.inspector .mini-canvas'); if (!host || !mini) return false;
    const rect = mini.getBoundingClientRect(); const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)); const y = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    if (!drag) { host.scrollLeft = Math.max(0, Math.min(host.scrollWidth - host.clientWidth, x * host.scrollWidth - host.clientWidth / 2)); host.scrollTop = Math.max(0, Math.min(host.scrollHeight - host.clientHeight, y * host.scrollHeight - host.clientHeight / 2)); }
    return true;
  };
  const bindMiniMap = () => {
    const mini = document.querySelector('.inspector .mini-canvas'); if (!mini || mini.dataset.liveBound) return;
    mini.dataset.liveBound = 'true'; let drag = null;
    mini.addEventListener('pointerdown', event => { if (!view.guides.minimap) return; event.preventDefault(); const windowNode = event.target.closest('.mini-window'); drag = { x: event.clientX, y: event.clientY, scrollLeft: scrollHost()?.scrollLeft || 0, scrollTop: scrollHost()?.scrollTop || 0, windowNode: Boolean(windowNode) }; mini.setPointerCapture?.(event.pointerId); if (!windowNode) panMiniMap(event.clientX, event.clientY); });
    mini.addEventListener('pointermove', event => { if (!drag || !drag.windowNode) return; const host = scrollHost(); if (!host) return; const rect = mini.getBoundingClientRect(); host.scrollLeft = Math.max(0, Math.min(host.scrollWidth - host.clientWidth, drag.scrollLeft + (event.clientX - drag.x) / rect.width * host.scrollWidth)); host.scrollTop = Math.max(0, Math.min(host.scrollHeight - host.clientHeight, drag.scrollTop + (event.clientY - drag.y) / rect.height * host.scrollHeight)); scheduleMinimap(); });
    const release = event => { if (drag) { drag = null; mini.releasePointerCapture?.(event.pointerId); } }; mini.addEventListener('pointerup', release); mini.addEventListener('pointercancel', release);
  };
  const hostForEvents = scrollHost();
  hostForEvents?.addEventListener('scroll', () => { scheduleMinimapViewport(); }, { passive: true });
  window.addEventListener('resize', () => { scheduleMinimap(); scheduleGrid(); });
  if (hostForEvents && window.MutationObserver) new MutationObserver(mutations => { if (mutations.some(mutation => !mutation.target?.closest?.('[data-live-grid]'))) { scheduleMinimap(); scheduleGrid(); } }).observe(hostForEvents, { childList: true, subtree: true });
  bindMiniMap();

  function applyPanelLayout() {
    const workspace = document.querySelector('.workspace');
    const center = document.querySelector('.center');
    const bottom = document.querySelector('.bottom');
    if (!workspace || !center) return;
    const rootStyle = getComputedStyle(document.documentElement);
    const leftWidth = rootStyle.getPropertyValue('--left').trim() || '330px';
    const rightWidth = rootStyle.getPropertyValue('--right').trim() || '300px';
    const inspectorColumnWidth = !view.panels.inspector ? '0px' : (model.view.inspectorPaneCollapsed ? '36px' : rightWidth);
    workspace.style.gridTemplateColumns = `${view.panels.left ? leftWidth : '0px'} minmax(0,1fr) ${inspectorColumnWidth}`;
    workspace.dataset.panelLayout = 'explicit';
    const left = document.querySelector('.left-panel');
    const inspector = document.querySelector('.inspector');
    if (left) left.style.gridColumn = '1';
    center.style.gridColumn = '2';
    if (inspector) inspector.style.gridColumn = '3';
    center.style.minWidth = '0';
    const centerWidth = `${Math.max(0, center.clientWidth)}px`;
    center.querySelectorAll('.canvas').forEach(canvas => { canvas.style.minWidth = '0'; canvas.style.width = centerWidth; canvas.style.maxWidth = centerWidth; canvas.style.boxSizing = 'border-box'; });
    if (bottom) { bottom.style.minWidth = '0'; bottom.style.width = centerWidth; bottom.style.maxWidth = centerWidth; bottom.style.boxSizing = 'border-box'; }
    if (bottom && view.panels.bottom) {
      const savedHeight = Number(view.bottomHeight || model.view.bottomHeight);
      if (Number.isFinite(savedHeight) && savedHeight >= 150) center.style.setProperty('--bottom-h', `${savedHeight}px`);
      if (model.view.mode === 'split') {
        const splitBottom = Number.parseFloat(getComputedStyle(center).getPropertyValue('--split-bottom-h')) || Number(bottom.getBoundingClientRect().height) || 270;
        const requestedBottom = Number(view.bottomHeight || model.view.bottomHeight || splitBottom);
        const maxBottom = Math.max(150, center.clientHeight - 180);
        const effectiveBottom = Math.max(150, Math.min(requestedBottom, maxBottom));
        center.style.setProperty('--split-bottom-h', `${effectiveBottom}px`);
        center.dataset.splitBottomClamped = effectiveBottom !== requestedBottom ? 'true' : 'false';
        center.style.gridTemplateRows = 'minmax(90px,1fr) minmax(90px,1fr) var(--split-bottom-h)';
      } else center.style.gridTemplateRows = 'minmax(0,1fr) var(--bottom-h)';
    } else if (model.view.mode === 'split') center.style.gridTemplateRows = 'minmax(90px,1fr) minmax(90px,1fr)';
    else center.style.gridTemplateRows = 'minmax(0,1fr)';
    center.dataset.panelLayout = view.panels.bottom ? 'canvas-bottom' : 'canvas-only';
    center.dataset.waveformOnly = view.panels.waveformOnly ? 'true' : 'false';
  }

  function applyInspectorLayout() {
    const inspector = document.querySelector('.inspector');
    const body = document.querySelector('.inspector-body');
    const minimap = document.querySelector('.inspector .minimap');
    if (!inspector || !body || !minimap) return;
    inspector.style.minHeight = '0';
    inspector.style.overflow = 'hidden';
    body.style.flex = '1 1 auto';
    body.style.minHeight = '0';
    body.style.overflow = 'auto';
    minimap.style.flex = '0 0 102px';
    minimap.style.minHeight = '102px';
    minimap.style.overflow = 'hidden';
    if (view.guides.minimap) {
      minimap.hidden = false;
      minimap.style.display = '';
    } else {
      minimap.hidden = true;
      minimap.style.display = 'none';
    }
    inspector.dataset.minimapLayout = view.guides.minimap ? 'pinned' : 'hidden';
  }

  function apply() {
    const canvas = document.querySelector('#cycleCanvas');
    if (canvas) {
      canvas.dataset.viewGrid = view.guides.grid ? 'on' : 'off';
      canvas.dataset.viewRuler = view.guides.ruler ? 'on' : 'off';
      canvas.dataset.viewMinimap = view.guides.minimap ? 'on' : 'off';
      canvas.dataset.viewComments = view.overlays.comment ? 'on' : 'off';
      canvas.dataset.viewAnnotations = view.overlays.annotation ? 'on' : 'off';
      canvas.dataset.viewEdgeCounter = view.overlays.edgeCounter ? 'on' : 'off';
      canvas.dataset.viewSnap = view.guides.snap ? 'on' : 'off';
    }
    document.querySelectorAll('.row .role,.canvas-icon').forEach(node => { node.style.display = view.columns.role ? '' : 'none'; });
    document.querySelectorAll('.row-name .signal-name-part,.signal-label .signal-name-part').forEach(node => { node.style.display = view.columns.signalName ? '' : 'none'; });
    document.querySelectorAll('.bus-width-column,.hierarchy-bus-column,.bus-width-part').forEach(node => { node.style.display = view.columns.busWidth ? '' : 'none'; });
    document.querySelectorAll('.hierarchy-instance-column,.instance-path-part').forEach(node => { node.style.display = view.columns.instancePath ? '' : 'none'; });
    const left = document.querySelector('.left-panel'); const inspector = document.querySelector('.inspector'); const bottom = document.querySelector('.bottom'); const minimap = document.querySelector('.inspector .minimap');
    const ruler = document.querySelector('#cycleCanvas .ruler');
    if (ruler) { ruler.style.visibility = view.guides.ruler ? 'visible' : 'hidden'; ruler.dataset.viewState = view.guides.ruler ? 'on' : 'off'; }
    if (bottom && view.panels.bottom) view.bottomHeight = Number(view.bottomHeight || model.view.bottomHeight || bottom.getBoundingClientRect().height || 270);
    if (left) { left.hidden = !view.panels.left; left.classList.toggle('hidden', !view.panels.left); }
    if (inspector) { inspector.hidden = !view.panels.inspector; inspector.classList.toggle('hidden', !view.panels.inspector); inspector.dataset.inspectorCollapsed = (view.panels.inspector && model.view.inspectorPaneCollapsed) ? 'true' : 'false'; }
    if (bottom) { bottom.hidden = !view.panels.bottom; bottom.classList.toggle('hidden', !view.panels.bottom); }
    if (inspector) inspector.dataset.viewMinimap = view.guides.minimap ? 'on' : 'off';
    if (minimap) { minimap.hidden = !view.guides.minimap; minimap.dataset.viewState = view.guides.minimap ? 'on' : 'off'; }
    applyInspectorLayout();
    applyPanelLayout();
    bindMiniMap(); renderGrid(); renderMinimap();
    ribbon.dataset.viewState = JSON.stringify({ guides: view.guides, columns: view.columns, overlays: view.overlays, panels: view.panels });
  }
  function refresh() {
    ribbon.querySelectorAll('[data-view-group]').forEach(node => {
      const value = view[node.dataset.viewGroup]?.[node.dataset.viewKey];
      node.dataset.state = value ? 'on' : 'off'; node.title = `${node.dataset.tooltipMeta ? JSON.parse(node.dataset.tooltipMeta).description : ''} (${value ? 'ON' : 'OFF'})`;
    });
    for (const [id, value] of [['inspector', view.panels.inspector], ['left-panel', view.panels.left], ['bottom-panel', view.panels.bottom], ['waveform-only', view.panels.waveformOnly]]) {
      const node = ribbon.querySelector(`[data-view-command="${id}"]`); if (node) node.dataset.state = value ? 'on' : 'off';
    }
    const pathMode = model.document.layout.pathDisplayMode || PATH.SIGNAL_ONLY;
    for (const [id, mode] of [['signal-only', PATH.SIGNAL_ONLY], ['relative', PATH.RELATIVE], ['full-path', PATH.FULL], ['split-columns', PATH.SPLIT_COLUMNS]]) {
      const node = ribbon.querySelector(`[data-view-command="${id}"]`); if (node) { node.dataset.state = pathMode === mode ? 'on' : 'off'; node.setAttribute('aria-pressed', pathMode === mode ? 'true' : 'false'); }
    }
    const scopeButton = ribbon.querySelector('[data-view-command="scope"]'); const scopes = controller.hierarchy?.getScopePaths?.() || []; const hasHierarchy = scopes.some(scope => scope.length); const scopeLabel = model.view.scope?.length ? `Scope: ${model.view.scope.join('.')}` : 'Scope: Root'; if (scopeButton) { const label = scopeButton.querySelector('.tool-label'); if (label) label.textContent = scopeLabel; scopeButton.disabled = !hasHierarchy; scopeButton.dataset.disabledReason = hasHierarchy ? '' : 'Current document has no instance hierarchy'; scopeButton.title = hasHierarchy ? `Current Scope: ${scopeLabel}` : 'Scope unavailable: current document has no instance hierarchy'; }
    const homeGuideKeys = [['グリッド', 'grid'], ['スナップ', 'snap'], ['ルーラー', 'ruler'], ['ミニマップ', 'minimap']];
    document.querySelectorAll('#ribbonHome .toggles label').forEach(labelNode => { const key = homeGuideKeys.find(([label]) => normalize(labelNode.textContent).includes(normalize(label)))?.[1]; const input = labelNode.querySelector('input'); if (!key || !input) return; input.checked = Boolean(view.guides[key]); input.dataset.viewGuide = key; input.dataset.controlStatus = 'implemented'; });
  }

  const home = document.querySelector('#ribbonHome'); const insert = document.querySelector('#ribbonInsert'); const annotation = document.querySelector('#ribbonAnnotation');
  const tabs = [...document.querySelectorAll('.ribbon-tabs .rtab')]; const viewTab = tabs.find(tab => normalize(tab.textContent) === '表示');
  const setRibbon = active => {
    const showing = active === viewTab;
    if (showing) {
      if (home) { home.hidden = true; home.style.display = 'none'; }
      if (insert) { insert.hidden = true; insert.style.display = 'none'; }
      if (annotation) { annotation.hidden = true; annotation.style.display = 'none'; }
      ribbon.hidden = false; ribbon.style.display = 'flex';
    } else {
      ribbon.hidden = true; ribbon.style.display = 'none';
      if (home && normalize(active?.textContent) !== '挿入' && normalize(active?.textContent) !== '注釈') { home.hidden = false; home.style.display = 'flex'; }
    }
    viewTab?.classList.toggle('active', showing);
    if (showing) { refresh(); apply(); }
  };
  viewTab?.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); setRibbon(viewTab); });
  tabs.filter(tab => tab !== viewTab).forEach(tab => tab.addEventListener('click', () => setRibbon(tab)));

  controller.registerRenderHook?.('view-ribbon', () => { apply(); refresh(); });
  document.querySelectorAll('#ribbonHome .toggles label input').forEach(input => { if (input.dataset.viewGuideBound) return; input.dataset.viewGuideBound = 'true'; input.addEventListener('change', () => controller.actions.setGuide(input.dataset.viewGuide, input.checked)); });
  controller.viewRibbon = { ribbon, apply, refresh, setRibbon, applyPanelLayout, openScopeMenu };
  setTimeout(() => { controller.controlAudit?.registerSubtree?.(ribbon); window.TimingChartTooltipContract?.registerSubtree?.(ribbon); }, 0);
  apply(); refresh();
})();
