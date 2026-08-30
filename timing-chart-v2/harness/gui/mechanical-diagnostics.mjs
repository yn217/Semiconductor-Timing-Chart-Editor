/** Reusable, DOM-independent visual diagnostics for browser harnesses. */
export function runMechanicalDiagnostics({ scenario, elements, evidence = [] }) {
  const findings = [];
  const add = (severity, category, target, actual) => findings.push({ severity, category, scenario, target, actual, evidence });
  for (const item of elements) {
    if (item.visible !== false && item.clientWidth !== undefined && item.scrollWidth > item.clientWidth) add("MAJOR", "TEXT_CLIPPING", item.target, { clientWidth: item.clientWidth, scrollWidth: item.scrollWidth });
    if (item.visible !== false && item.clientHeight !== undefined && item.scrollHeight > item.clientHeight) add("MAJOR", "TEXT_CLIPPING", item.target, { clientHeight: item.clientHeight, scrollHeight: item.scrollHeight });
    if (item.visible !== false && item.text && item.width === 0) add("MAJOR", "HITBOX", item.target, { width: item.width, height: item.height });
  }
  const visibleText = elements.filter((item) => item.visible !== false && item.text).map((item) => item.text.trim()).filter(Boolean);
  for (const text of new Set(visibleText)) if (visibleText.filter((value) => value === text).length > 1) add("MAJOR", "DUPLICATION", text, { text });
  for (let left = 0; left < elements.length; left += 1) for (let right = left + 1; right < elements.length; right += 1) {
    const a = elements[left]; const b = elements[right];
    if (a.allowOverlap || b.allowOverlap || a.visible === false || b.visible === false) continue;
    if (a.rect && b.rect && a.rect.left < b.rect.right && a.rect.right > b.rect.left && a.rect.top < b.rect.bottom && a.rect.bottom > b.rect.top) add("MAJOR", "OVERLAP", `${a.target} / ${b.target}`, { left: a.rect, right: b.rect });
  }
  for (const item of elements) if (item.iconRect && item.buttonRect) {
    const iconCenter = (item.iconRect.left + item.iconRect.right) / 2;
    const buttonCenter = (item.buttonRect.left + item.buttonRect.right) / 2;
    if (Math.abs(iconCenter - buttonCenter) > (item.maxDeltaPx ?? 2)) add("MAJOR", "ICON_ALIGNMENT", item.target, { iconCenter, buttonCenter, delta: Math.abs(iconCenter - buttonCenter) });
  }
  return { scenario, findings };
}
