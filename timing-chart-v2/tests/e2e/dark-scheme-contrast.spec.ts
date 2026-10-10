import { expect, test, type Page } from "@playwright/test";

// Under the OS dark preference the UI must stay readable: unstyled native controls used to resolve to white text on the UI's light surfaces.
const audit = (page: Page) => page.evaluate(() => {
  const parse = (c: string): [number, number, number, number] => { const m = /rgba?\(([^)]+)\)/.exec(c); if (!m) return [0, 0, 0, 0]; const p = m[1]!.split(/[ ,\/]+/).filter(Boolean).map(Number); return [p[0]!, p[1]!, p[2]!, p[3] ?? 1]; };
  const lum = (r: number, g: number, b: number) => { const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const bgOf = (el: Element): [number, number, number] => {
    let r = 255, g = 255, b = 255; const stack: Array<[number, number, number, number]> = [];
    for (let e: Element | null = el; e; e = e.parentElement) { const bg = parse(getComputedStyle(e).backgroundColor); if (bg[3] > 0) { stack.push(bg); if (bg[3] >= 1) break; } }
    for (const [sr, sg, sb, sa] of stack.reverse()) { r = sr * sa + r * (1 - sa); g = sg * sa + g * (1 - sa); b = sb * sa + b * (1 - sa); }
    return [r, g, b];
  };
  const bad = new Map<string, string>();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = (n.textContent ?? "").trim();
    if (!text || text.length < 1) continue;
    const el = n.parentElement; if (!el) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none" || parseFloat(cs.opacity) === 0) continue;
    const rect = el.getBoundingClientRect(); if (rect.width < 2 || rect.height < 2 || rect.bottom < 0 || rect.top > innerHeight) continue;
    if (el.closest("svg, canvas, [aria-hidden='true'], script, style, pre")) continue;
    const fg = parse(cs.color); if (fg[3] === 0) continue;
    const bg = bgOf(el);
    const l1 = lum(fg[0], fg[1], fg[2]), l2 = lum(bg[0], bg[1], bg[2]);
    const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    const disabled = (el as HTMLButtonElement).disabled || el.closest("[disabled], [aria-disabled='true']");
    if (ratio < (disabled ? 1.6 : 2.4)) bad.set(`${el.tagName.toLowerCase()}.${(el.getAttribute("class") ?? "").split(" ")[0]}|${text.slice(0, 24)}`, `ratio=${ratio.toFixed(2)} fg=${cs.color} bg=rgb(${bg.map(Math.round).join(",")})${disabled ? " disabled" : ""}`);
  }
  return [...bad.entries()].map(([k, v]) => `${k} ${v}`);
});

test("no unreadable text under the OS dark colour scheme (ribbon tabs and every Bottom tab)", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.setViewportSize({ width: 1700, height: 950 });
  await page.goto("/?transaction-demo");
  await page.waitForTimeout(1500);
  await page.locator("[data-role='frozen-row'], [data-transaction-id]").first().click({ timeout: 3000, position: { x: 12, y: 4 } }).catch(() => undefined);
  const unreadable: string[] = [];
  for (const tab of ["File", "Home", "Insert", "Timeline", "Annotation", "View", "Check", "AI"]) {
    await page.locator(".ribbon-tabs").getByRole("button", { name: tab, exact: true }).click();
    unreadable.push(...(await audit(page)).map((x) => `ribbon ${tab}: ${x}`));
  }
  const tabs = page.locator(".bottom-tabs [role=tab]");
  const n = await tabs.count();
  for (let i = 0; i < n; i += 1) { await tabs.nth(i).click(); unreadable.push(...(await audit(page)).map((x) => `bottom tab ${i}: ${x}`)); }
  expect(unreadable).toEqual([]);
});
