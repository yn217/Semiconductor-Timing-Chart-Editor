import { expect, test } from "@playwright/test";
import { generatePerformanceDocument } from "@timing-chart-v2/testing";

/**
 * #856 evidence + loose guard: scrolling the Bottom Transaction table over 8,000 Transactions must stay virtualized (bounded DOM) and
 * each scroll step must not do collection-sized work. Frame time and Long Tasks are sampled across a full top-to-bottom traversal; the
 * assertions are deliberately generous (machine independent). The measured numbers are logged as a single JSON line for the Issue.
 * Regression: the virtualization spacers were flex items of a column flex container and shrank to 0, collapsing the scroll extent to
 * ~30 rows (scrollHeight 686px for 8,000 rows), so rows past the first window were unreachable.
 */
test("Bottom Transaction table scroll over 8,000 Transactions stays virtualized and responsive", async ({ page }) => {
  test.setTimeout(240_000);
  await page.addInitScript(() => { try { window.localStorage.setItem("timing-chart-v2.view-mode", "Transaction"); } catch { /* best effort */ } });
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto("/");
  const surface = page.getByTestId("cycle-surface");
  await expect(surface).toHaveAttribute("data-cycle-view-ready", "true");
  const document = generatePerformanceDocument({ signalCount: 8_000, cycleCount: 100, profile: "transaction-heavy" });
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "b856.tcd", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(document)) });
  await expect(page.locator(".editor-shell")).toHaveAttribute("data-signal-count", "8000", { timeout: 180_000 });
  await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 180_000 });
  await expect(page.getByText("All Transactions")).toBeVisible();
  const list = page.locator(".transaction-list");
  await expect(list).toBeVisible({ timeout: 60_000 });

  const result = await list.evaluate(async (element) => {
    const rowsMounted = () => element.querySelectorAll("[data-transaction-row-id], [data-transaction-phase-row-id]").length;
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
  console.log("E856", JSON.stringify(result));
  expect(result.scrollHeight, "the table really holds the large collection").toBeGreaterThan(result.clientHeight * 20);
  expect(result.maxRows, "DOM rows stay bounded by the virtual window").toBeLessThan(200);
  expect(result.p95, "p95 frame time of a scroll step").toBeLessThan(250);
});
