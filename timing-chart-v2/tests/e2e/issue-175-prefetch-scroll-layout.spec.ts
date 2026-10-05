import { expect, test } from "@playwright/test";
import { generatePerformanceDocument } from "@timing-chart-v2/testing";

test("10k vertical scroll does not force layout in post-reconciliation prefetch planning", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1_672, height: 941 });
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const document = generatePerformanceDocument({ signalCount: 10_000, cycleCount: 32, profile: "standard" });
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({
    name: document.document.id + ".tcd",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(document)),
  });
  await expect(host).toHaveAttribute("data-editor-idle", "true", { timeout: 90_000 });
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect.poll(() => host.locator("[data-role='wave-owner']").evaluateAll((owners) =>
    owners.length > 0 && owners.every((owner) => (owner as HTMLElement).dataset.waveState === "ready"),
  ), { timeout: 90_000 }).toBe(true);

  const viewport = page.getByTestId("cycle-viewport");
  const cdp = await page.context().newCDPSession(page);
  const events: Array<{ name?: string; cat?: string; ph?: string; dur?: number; args?: { data?: Record<string, unknown> } }> = [];
  cdp.on("Tracing.dataCollected", ({ value }: { value: typeof events }) => events.push(...value));
  const completed = new Promise<void>((resolve) => cdp.once("Tracing.tracingComplete", () => resolve()));
  await cdp.send("Tracing.start", { categories: "devtools.timeline,disabled-by-default-devtools.timeline,disabled-by-default-devtools.timeline.invalidationTracking", transferMode: "ReportEvents" });
  const start = await viewport.evaluate((element) => element.scrollTop);
  const box = (await viewport.boundingBox())!;
  await page.mouse.move(box.x + 80, box.y + 80);
  await page.mouse.wheel(0, 80);
  await expect.poll(() => viewport.evaluate((element) => element.scrollTop)).toBeGreaterThan(start);
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await cdp.send("Tracing.end");
  await completed;
  const prefetchLayoutReads = events.filter((event) => {
    if (event.name !== "LayoutInvalidationTracking" || event.args?.data?.reason !== "Added to layout") return false;
    const stack = event.args.data.stackTrace;
    return Array.isArray(stack) && stack.some((frame) => (frame as { functionName?: string }).functionName === "#updateWavePrefetchPlan");
  });
  expect(prefetchLayoutReads, "prefetch planning must use viewport geometry captured before row DOM reconciliation").toHaveLength(0);
  const canvasLayoutReads = events.filter((event) => {
    if (event.name !== "LayoutInvalidationTracking" || !["Added to layout", "Size changed"].includes(String(event.args?.data?.reason))) return false;
    const stack = event.args?.data?.stackTrace;
    return Array.isArray(stack) && stack.some((frame) => (frame as { functionName?: string }).functionName === "drawVisible");
  });
  expect(canvasLayoutReads, "new Canvas owners must read viewport geometry before installing their canvas node").toHaveLength(0);
  await cdp.detach();
});
