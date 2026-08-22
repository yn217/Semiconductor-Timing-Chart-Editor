(() => {
  'use strict';

  const controller = window.TimingChartProductionController;
  if (!controller) return;

  const normalize = value => String(value || '').replace(/[\s\n]+/g, '').trim();
  const textOf = node => normalize(node.querySelector?.('.tool-label')?.textContent || node.textContent || node.getAttribute('aria-label'));
  const descriptions = [
    [/^新規$/, '新しいTiming Documentを作成します。', 'Document state', 'Ctrl+N'],
    [/^開く$/, '保存済みの.tcd Documentを開きます。', 'Document state', 'Ctrl+O'],
    [/保存$/, '現在のDocumentを保存します。', 'Document state', 'Ctrl+S'],
    [/^Undo$/, '直前のDocument commandを取り消します。', 'Semantic document history', 'Ctrl+Z'],
    [/^Redo$/, '取り消したDocument commandを再実行します。', 'Semantic document history', 'Ctrl+Y'],
    [/切取/, '選択中の行をClipboardへ移します。', 'Selected signal/group', ''],
    [/コピー/, '選択中の行をClipboardへコピーします。', 'Selected signal/group', 'Ctrl+C'],
    [/貼付/, 'Clipboardの行を現在のSignal Treeへ貼り付けます。', 'Selected signal/group', 'Ctrl+V'],
    [/^削除$/, '選択中のSignal/Group/Annotationを削除します。', 'Selected semantic object', 'Delete'],
    [/^複製$/, '選択中のSignal/Group/Annotationを複製します。', 'Selected semantic object', ''],
    [/Transaction.*追加/, '現在のTransaction ViewへTransactionを追加します。', 'Transaction model; Undo対応', ''],
    [/順序変更/, '選択中Transactionの表示順を変更します。', 'Transaction View order', ''],
    [/上へ/, '選択行をSignal Tree内で1つ上へ移動します。', 'Signal Tree order', ''],
    [/下へ/, '選択行をSignal Tree内で1つ下へ移動します。', 'Signal Tree order', ''],
    [/Cycle追加|Cycle挿入/, '現在位置に1 Cycleを追加します。', 'Timeline and following semantic time; Undo対応', ''],
    [/N Cycle追加|NCycle挿入/, '指定した数のCycleを現在位置へ追加します。', 'Timeline and following semantic time; Undo対応', ''],
    [/Cycle削除/, '選択Cycleを削除し、後続のsemantic timeを追従させます。', 'Timeline and following semantic time; Undo対応', ''],
    [/範囲削除/, '選択した時間範囲を削除します。', 'Timeline and following semantic time; Undo対応', ''],
    [/行間隔/, '選択行の表示間隔を調整します。', 'Signal layout only', ''],
    [/Group間隔/, '選択Groupの表示間隔を調整します。', 'Group layout only', ''],
    [/自動.*レイアウト/, 'Signal/Group layoutを自動整列します。', 'Presentation layout', ''],
    [/Zoom.*−|Zoom−/, 'Timing geometryだけを縮小します。Signal labels/UIは拡大縮小しません。', 'View only; timing region', ''],
    [/Zoom.*＋|Zoom＋/, 'Timing geometryだけを拡大します。Signal labels/UIは拡大縮小しません。', 'View only; timing region', ''],
    [/^Zoom$/, 'Timing Zoomを指定します。', 'View only; timing region', ''],
    [/全体.*表示/, '全時間軸が見えるようTiming Zoomを調整します。', 'View only', ''],
    [/選択に.*合わせる/, '選択対象が見える範囲へTiming Zoomを調整します。', 'View only', ''],
    [/SVG.*出力|PNG.*出力|PDF.*出力/, '現在のDocumentを指定形式へExportします。', 'Export output; semantic document is unchanged', ''],
    [/グリッド/, 'Timing Canvasのグリッド表示を切り替えます。', 'View only; timing canvas', ''],
    [/スナップ/, 'Annotation操作時のSnap interactionを切り替えます。', 'View interaction only; timing semantics unchanged', ''],
    [/ルーラー/, 'Timing CanvasのRuler表示を切り替えます。', 'View only; timing canvas', ''],
    [/ミニマップ/, '右InspectorのMiniMap表示を切り替えます。', 'View only; Inspector pane', '']
  ];

  const findDescription = label => descriptions.find(([pattern]) => pattern.test(label))?.slice(1) || null;
  const metadataFor = element => {
    if (element.dataset.tooltipMeta) {
      try { return JSON.parse(element.dataset.tooltipMeta); } catch { /* replace malformed metadata below */ }
    }
    const label = textOf(element); const match = findDescription(label);
    if (!match) return null;
    const [description, affects, shortcut] = match;
    return { id: element.dataset.controlKey || label, label, description, affects, ...(shortcut ? { shortcut } : {}) };
  };
  const format = (element, meta) => {
    const status = element.disabled || element.dataset.controlStatus === 'disabled' ? 'Disabled' : '';
    const reason = status ? (element.title || meta.disabledReason || 'この操作は現在利用できません。') : '';
    return [meta.label || textOf(element), meta.description, `Affects: ${meta.affects || 'current view/document selection'}`, meta.shortcut ? `Shortcut: ${meta.shortcut}` : '', reason ? `Reason: ${reason}` : ''].filter(Boolean).join('\n');
  };

  const applyMetadata = () => {
    const candidates = document.querySelectorAll('#ribbonHome .tool, #ribbonHome .toggles label, #ribbonInsert [data-insert-command], #ribbonAnnotation [data-annotation-command], #ribbonView [data-view-command]');
    candidates.forEach(element => {
      const target = element.matches('.toggles label') ? element : element;
      const meta = metadataFor(target);
      if (!meta) return;
      const merged = { ...meta, label: meta.label || textOf(target) };
      target.dataset.tooltipMeta = JSON.stringify(merged);
      target.dataset.tooltipContract = 'true';
      if (!target.disabled && target.title === '') target.title = format(target, merged);
      if (!target.hasAttribute('aria-label') && target.matches('button')) target.setAttribute('aria-label', merged.label);
    });
    document.querySelectorAll('[data-control-status="disabled"]').forEach(element => {
      const meta = metadataFor(element); if (!meta) return;
      if (!element.title) element.title = meta.disabledReason || 'この操作は現在利用できません。';
    });
  };

  const tooltip = document.createElement('div');
  tooltip.id = 'timingChartTooltip'; tooltip.hidden = true; tooltip.setAttribute('role', 'tooltip');
  tooltip.style.cssText = 'position:fixed;z-index:3000;max-width:300px;padding:7px 9px;white-space:pre-line;pointer-events:none;background:#243047;color:#fff;border-radius:4px;box-shadow:0 4px 12px #0004;font:12px/1.35 sans-serif;';
  document.body.appendChild(tooltip);
  let timer = 0; let owner = null;
  const hide = () => { clearTimeout(timer); tooltip.hidden = true; owner = null; };
  const show = element => {
    const meta = metadataFor(element); if (!meta) return;
    clearTimeout(timer); owner = element;
    timer = setTimeout(() => {
      if (owner !== element) return;
      tooltip.textContent = format(element, meta); tooltip.hidden = false;
      const rect = element.getBoundingClientRect(); const width = Math.min(300, window.innerWidth - 16);
      tooltip.style.maxWidth = `${width}px`;
      tooltip.style.left = `${Math.max(8, Math.min(window.innerWidth - width - 8, rect.left))}px`;
      tooltip.style.top = `${Math.min(window.innerHeight - tooltip.offsetHeight - 8, rect.bottom + 6)}px`;
    }, 350);
  };
  document.addEventListener('pointerover', event => { const element = event.target.closest?.('[data-tooltip-contract]'); if (element) show(element); });
  document.addEventListener('pointerout', event => { const element = event.target.closest?.('[data-tooltip-contract]'); if (element && !element.contains(event.relatedTarget)) hide(); });
  document.addEventListener('focusin', event => { const element = event.target.closest?.('[data-tooltip-contract]'); if (element) show(element); });
  document.addEventListener('focusout', event => { if (event.target.closest?.('[data-tooltip-contract]')) hide(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') hide(); });
  new MutationObserver(() => queueMicrotask(applyMetadata)).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['disabled', 'title', 'data-control-status'] });
  applyMetadata();
  window.TimingChartTooltipContract = { applyMetadata, show, hide, metadataFor };
})();
