import { expect, test } from "@playwright/test";
import { generatePerformanceDocument } from "@timing-chart-v2/testing";

/**
 * #863 closure-matrix slice: with 20,000 Annotations in the document, a full horizontal traversal of the Cycle timeline keeps the number
 * of mounted Annotation owners bounded by the viewport (not the document) and the frame time loose-bounded. p50/p95/Long Tasks are logged
 * as one JSON line for the Issue. Annotations are spread over 1,000 cycles (20 per cycle), anchored to Signals.
 */
test("horizontal scroll over 20,000 Annotations keeps mounted Annotation owners bounded and frames responsive", async ({ page }) => {
  test.setTimeout(300_000);
  await page.addInitScript(() => { try { window.localStorage.setItem("timing-chart-v2.view-mode", "Cycle"); } catch { /* best effort */ } });
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto("/");
  const surface = page.getByTestId("cycle-surface");
  await expect(surface).toHaveAttribute("data-cycle-view-ready", "true");
  const base = generatePerformanceDocument({ signalCount: 100, cycleCount: 1000, profile: "standard" });
  const annotations = Array.from({ length: 20_000 }, (_, index) => ({ id: `ann_863_${index}`, type: "verticalLine", label: `A${index}`, visible: true, anchor: { signalId: base.signals[1 + (index % 50)]!.id, cycle: index % 1000, point: "cycle-start" } }));
  const document = { ...base, annotations };
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "b863.tcd", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(document)) });
  await expect(page.locator(".editor-shell")).toHaveAttribute("data-signal-count", "100", { timeout: 180_000 });
  await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 180_000 });
  await expect.poll(() => page.locator("[data-role='annotation-owner']").count(), { timeout: 60_000 }).toBeGreaterThan(0);

  const owner = page.locator("[data-role='timeline-viewport']");
  const result = await owner.evaluate(async (element) => {
    const mounted = () => element.ownerDocument.querySelectorAll("[data-role='annotation-owner']").length;
    const longTasks: number[] = [];
    const observer = new PerformanceObserver((entries) => { for (const entry of entries.getEntries()) longTasks.push(entry.duration); });
    try { observer.observe({ entryTypes: ["longtask"] }); } catch { /* unsupported */ }
    const frames: number[] = [];
    const total = element.scrollWidth - element.clientWidth;
    const steps = 150;
    let maxMounted = mounted();
    let previous = performance.now();
    for (let step = 1; step <= steps; step += 1) {
      element.scrollLeft = Math.round((total * step) / steps);
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const now = performance.now(); frames.push(now - previous); previous = now;
      maxMounted = Math.max(maxMounted, mounted());
    }
    observer.disconnect();
    const sorted = [...frames].sort((a, b) => a - b);
    const pick = (q: number) => sorted[Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1)]!;
    return { scrollWidth: element.scrollWidth, clientWidth: element.clientWidth, maxMounted, steps, p50: pick(0.5), p95: pick(0.95), max: sorted.at(-1)!, longTasks: longTasks.length, longTaskMax: Math.max(0, ...longTasks) };
  });
  console.log("E863", JSON.stringify(result));

  const selectionSync = await owner.evaluate(async (element) => {
    const viewport = element as HTMLElement;
    const host = document.querySelector<HTMLElement>("[data-annotation-projection-duration-ms]");
    if (!host) throw new Error("annotation projection host is not mounted");
    const existingOwners = new Set(host.querySelectorAll<HTMLElement>("[data-annotation-id]"));
    if (existingOwners.size === 0) throw new Error("expected mounted Annotation owners before the scroll");
    const identityAttributes = new Set(["data-annotation-id", "role", "tabindex", "data-annotation-type", "data-annotation-shape", "data-visible", "data-line-type", "data-arrowhead", "data-measurement-lane", "data-measurement-arrow-layout", "data-source-signal-id", "data-trace-offset-cycles", "data-locked", "aria-label"]);
    const destination = Math.max(0, viewport.scrollLeft - 1);
    const scrollSeen = new Promise<void>((resolve) => viewport.addEventListener("scroll", () => resolve(), { once: true }));
    const projectionPromise = new Promise<MutationRecord[]>((resolve, reject) => {
      const records: MutationRecord[] = [];
      const observer = new MutationObserver((batch) => {
        records.push(...batch);
        if (batch.some((record) => record.target === host && record.attributeName === "data-annotation-projection-duration-ms")) {
          observer.disconnect();
          window.clearTimeout(timeout);
          resolve(records);
        }
      });
      observer.observe(host, { subtree: true, attributes: true, attributeFilter: ["data-selected", "data-annotation-projection-duration-ms", ...identityAttributes] });
      const timeout = window.setTimeout(() => { observer.disconnect(); reject(new Error("scroll Annotation projection did not publish")); }, 10_000);
    });
    viewport.scrollLeft = destination;
    await scrollSeen;
    const projectionRecords = await projectionPromise;
    const unchangedOwnerWrites = projectionRecords.filter((record) => record.attributeName === "data-selected" && existingOwners.has(record.target as HTMLElement)).length;
    const unchangedIdentityWrites = projectionRecords.filter((record) => identityAttributes.has(record.attributeName ?? "") && existingOwners.has(record.target as HTMLElement)).length;
    return { unchangedOwnerWrites, unchangedIdentityWrites, selectedOwnerCount: host.querySelectorAll("[data-annotation-id][data-selected='true']").length };
  });
  console.log("E863_SELECTION_SYNC", JSON.stringify(selectionSync));
  expect(result.scrollWidth, "the timeline really spans many viewports").toBeGreaterThan(result.clientWidth * 3);
  expect(result.maxMounted, "mounted Annotation owners are bounded by the viewport window, not the 20,000").toBeLessThan(4000);
  expect(result.p95, "p95 frame time of a scroll step (loose, machine independent)").toBeLessThan(500);
  expect(selectionSync.unchangedOwnerWrites, "scrolling without a selection change does not rewrite selection state on preexisting overlays").toBe(0);
  expect(selectionSync.unchangedIdentityWrites, "scrolling without semantic changes does not rewrite identity/accessibility metadata on preexisting overlays").toBe(0);
  expect(selectionSync.selectedOwnerCount, "no Annotation is selected during this scroll-only pass").toBe(0);
});
