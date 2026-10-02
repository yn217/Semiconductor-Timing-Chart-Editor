import { expect, test } from "@playwright/test";
import { generatePerformanceDocument } from "@timing-chart-v2/testing";

/**
 * #856 (Annotation List): a top-to-bottom traversal of the Bottom Annotation List over a large Annotation set keeps the DOM bounded, the
 * scroll extent real (the Transaction table lost its extent to flex-shrinking spacers, so this is asserted explicitly) and the frame time
 * loose-bounded. Numbers are logged as one JSON line for the Issue.
 */
test("Bottom Annotation List scroll over 8,000 Annotations keeps its extent, bounded DOM and responsive frames", async ({ page }) => {
  test.setTimeout(240_000);
  await page.addInitScript(() => { try { window.localStorage.setItem("timing-chart-v2.view-mode", "Cycle"); } catch { /* best effort */ } });
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto("/");
  const surface = page.getByTestId("cycle-surface");
  await expect(surface).toHaveAttribute("data-cycle-view-ready", "true");
  const document = generatePerformanceDocument({ signalCount: 4_000, cycleCount: 100, profile: "annotation-heavy" });
  expect(document.annotations.length).toBe(8_000);
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "b856a.tcd", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(document)) });
  await expect(page.locator(".editor-shell")).toHaveAttribute("data-signal-count", "4000", { timeout: 180_000 });
  await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 180_000 });
  await page.getByRole("tab", { name: /^Annotation/ }).click();
  const list = page.getByTestId("annotation-list");
  await expect(list).toBeVisible({ timeout: 60_000 });

  const result = await list.evaluate(async (element) => {
    const rowsMounted = () => element.querySelectorAll("[role='row']").length;
    const longTasks: number[] = [];
    const observer = new PerformanceObserver((entries) => { for (const entry of entries.getEntries()) longTasks.push(entry.duration); });
    try { observer.observe({ entryTypes: ["longtask"] }); } catch { /* unsupported */ }
    const frames: number[] = [];
    const total = element.scrollHeight - element.clientHeight;
    const steps = 150;
    let maxRows = rowsMounted();
    let previous = performance.now();
    for (let step = 1; step <= steps; step += 1) {
      element.scrollTop = Math.round((total * step) / steps);
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const now = performance.now(); frames.push(now - previous); previous = now;
      maxRows = Math.max(maxRows, rowsMounted());
    }
    observer.disconnect();
    const sorted = [...frames].sort((a, b) => a - b);
    const pick = (q: number) => sorted[Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1)]!;
    return { scrollHeight: element.scrollHeight, clientHeight: element.clientHeight, maxRows, steps, p50: pick(0.5), p95: pick(0.95), max: sorted.at(-1)!, longTasks: longTasks.length, longTaskMax: Math.max(0, ...longTasks) };
  });
  console.log("E856A", JSON.stringify(result));
  expect(result.scrollHeight, "the list really holds the large collection").toBeGreaterThan(result.clientHeight * 20);
  expect(result.maxRows, "DOM rows stay bounded by the virtual window").toBeLessThan(200);
  expect(result.p95, "p95 frame time of a scroll step").toBeLessThan(250);
});
