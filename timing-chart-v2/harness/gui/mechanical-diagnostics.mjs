/** Reusable, DOM-independent visual diagnostics for browser harnesses. */
export function runMechanicalDiagnostics({ scenario, elements, evidence = [] }) {
  const findings = [];
  const add = (severity, category, target, actual) => findings.push({ severity, category, scenario, target, actual, evidence });
  for (const item of elements) {
    if (item.visible !== false && item.clientWidth !== undefined && item.scrollWidth > item.clientWidth) add("MAJOR", "TEXT_CLIPPING", item.target, { clientWidth: item.clientWidth, scrollWidth: item.scrollWidth });
    if (item.visible !== false && item.clientHeight !== undefined && item.scrollHeight > item.clientHeight) add("MAJOR", "TEXT_CLIPPING", item.target, { clientHeight: item.clientHeight, scrollHeight: item.scrollHeight });
    if (item.visible !== false && item.text && item.width === 0) add("MAJOR", "HITBOX", item.target, { width: item.width, height: item.height });
    if (item.viewport && item.rect && (item.rect.left < 0 || item.rect.top < 0 || item.rect.right > item.viewport.width || item.rect.bottom > item.viewport.height)) add("MAJOR", "VIEWPORT_OVERFLOW", item.target, { rect: item.rect, viewport: item.viewport });
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
  for (const group of new Set(elements.flatMap((item) => item.baselineGroup ? [item.baselineGroup] : []))) {
    const members = elements.filter((item) => item.baselineGroup === group && item.baselineY !== undefined);
    const baseline = members[0]?.baselineY;
    for (const item of members) if (baseline !== undefined && Math.abs(item.baselineY - baseline) > (item.maxDeltaPx ?? 2)) add("MAJOR", "BASELINE", item.target, { baselineY: item.baselineY, expected: baseline, delta: Math.abs(item.baselineY - baseline) });
  }
  for (const group of new Set(elements.flatMap((item) => item.alignmentGroup ? [item.alignmentGroup] : []))) {
    const members = elements.filter((item) => item.alignmentGroup === group && item.alignX !== undefined);
    const expected = members[0]?.alignX;
    for (const item of members) if (expected !== undefined && Math.abs(item.alignX - expected) > (item.maxDeltaPx ?? 2)) add("MAJOR", "ALIGNMENT", item.target, { alignX: item.alignX, expected, delta: Math.abs(item.alignX - expected) });
  }
  return { scenario, findings };
}

/** Collect the minimal metrics needed by runMechanicalDiagnostics from a real document. */
export function collectDomMetrics(document, rules) {
  return rules.flatMap((rule) => [...document.querySelectorAll(rule.selector)].map((node, index) => {
    const rect = node.getBoundingClientRect();
    const icon = rule.iconSelector ? node.querySelector(rule.iconSelector)?.getBoundingClientRect() : undefined;
    const button = rule.buttonSelector ? node.querySelector(rule.buttonSelector)?.getBoundingClientRect() : undefined;
    return {
      target: rule.target ?? `${rule.selector}[${index}]`, text: node.textContent?.trim() ?? "",
      visible: typeof HTMLElement !== "undefined" && node instanceof HTMLElement ? getComputedStyle(node).visibility !== "hidden" && getComputedStyle(node).display !== "none" : true,
      clientWidth: node.clientWidth, scrollWidth: node.scrollWidth, clientHeight: node.clientHeight, scrollHeight: node.scrollHeight,
      width: rect.width, height: rect.height,
      rect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom },
      ...(icon ? { iconRect: { left: icon.left, right: icon.right, top: icon.top, bottom: icon.bottom } } : {}),
      ...(button ? { buttonRect: { left: button.left, right: button.right, top: button.top, bottom: button.bottom } } : {}),
      ...(rule.allowOverlap ? { allowOverlap: true } : {}), ...(rule.maxDeltaPx === undefined ? {} : { maxDeltaPx: rule.maxDeltaPx }),
    };
  }));
}
