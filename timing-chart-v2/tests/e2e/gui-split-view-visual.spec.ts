import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

test("captures the stacked Combined composition with both contexts and zero view mutation", async ({ page }) => {
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto("/");
  const surface = page.getByTestId("cycle-surface");
  await expect(surface).toHaveAttribute("data-cycle-view-ready", "true");
  await page.getByRole("button", { name: "Transaction", exact: true }).click();
  await page.locator(".bottom-tabs").getByRole("tab", { name: "Transaction", exact: true }).click();
  await page.getByLabel("New Transaction name").fill("Split View Read");
  await page.getByLabel("New Transaction start").fill("2");
  await page.getByLabel("New Transaction end").fill("7");
  // Scoped to the transaction editor's own submit button -- an unscoped
  // page-wide "Create Transaction" is now ambiguous against the Ribbon's
  // "Create Transaction" button, which shares the same accessible name.
  await page.getByTestId("transaction-editor").getByRole("button", { name: "Create Transaction", exact: true }).click();
  await expect(surface).toHaveAttribute("data-editor-idle", "true");

  const before = {
    revision: await surface.getAttribute("data-canonical-revision"),
    history: await surface.getAttribute("data-history-depth"),
    dirty: await page.getByTestId("dirty-status").textContent(),
    counters: await surface.locator("[data-role='timing-chart-surface']").getAttribute("data-render-counters"),
  };
  await page.getByRole("button", { name: "Combined", exact: true }).click();
  await expect(page.locator(".cycle-panel")).toHaveAttribute("data-view-mode", "Split");
  await expect(page.getByTestId("transaction-lanes")).toBeVisible();
  await expect(surface).toBeVisible();
  const transactionPane = page.locator(".split-transaction-pane");
  const signalPane = page.locator(".split-signal-content");
  const transactionBox = await transactionPane.boundingBox();
  const signalBox = await signalPane.boundingBox();
  expect(transactionBox).not.toBeNull();
  expect(signalBox).not.toBeNull();
  expect(transactionBox!.y).toBeLessThan(signalBox!.y);
  expect(transactionBox!.x).toBeCloseTo(signalBox!.x, 0);
  // The Transaction pane also contains the sticky label gutter (left + frozen columns); the shared
  // time axis is the track, which must be exactly as wide as the Cycle signal content.
  const trackBox = await page.locator(".transaction-track").first().boundingBox();
  expect(trackBox).not.toBeNull();
  expect(trackBox!.width).toBeCloseTo(signalBox!.width, 0);
  const divider = page.getByTestId("combined-split-divider");
  await expect(divider).toBeVisible();
  const beforeResizeHeight = transactionBox!.height;
  const dividerBox = (await divider.boundingBox())!;
  await page.mouse.move(dividerBox.x + dividerBox.width / 2, dividerBox.y + dividerBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(dividerBox.x + dividerBox.width / 2, dividerBox.y + dividerBox.height / 2 + 48);
  await page.mouse.up();
  await expect.poll(async () => (await page.locator(".split-transaction-pane").boundingBox())!.height).not.toBe(beforeResizeHeight);
  await transactionPane.click({ position: { x: 40, y: 40 } });
  await expect(page.getByTestId("active-pane-status")).toHaveText("Active Pane: Transaction");
  await signalPane.click({ position: { x: 40, y: 100 } });
  await expect(page.getByTestId("active-pane-status")).toHaveText("Active Pane: Signal");
  await expect(page.locator("[data-major-group='Layout']")).toHaveCount(1);
  await transactionPane.click({ position: { x: 40, y: 40 } });
  await expect(page.getByTestId("active-pane-status")).toHaveText("Active Pane: Transaction");
  await expect(page.locator("[data-major-group='Layout']")).toHaveCount(0);
  await expect(page.locator("[data-major-group='Group']")).toHaveCount(1);
  await expect(page.locator("[data-major-group='Transaction Time']")).toHaveCount(1);
  const viewport = page.getByTestId("cycle-viewport");
  const scrollMetrics = await viewport.evaluate((element) => ({ clientWidth: element.clientWidth, scrollWidth: element.scrollWidth }));
  expect(scrollMetrics.scrollWidth).toBeGreaterThanOrEqual(scrollMetrics.clientWidth);
  await expect(viewport).toHaveAttribute("data-pane", "signal");
  await expect(page.locator(".bottom-tabs").getByRole("tab", { name: "Signal", exact: true })).toBeVisible();
  await expect(page.locator(".bottom-tabs").getByRole("tab", { name: "Transaction", exact: true })).toBeVisible();
  await mkdir(resolve(process.cwd(), "artifacts", "gui-split-view"), { recursive: true });
  await page.screenshot({ path: resolve(process.cwd(), "artifacts", "gui-split-view", "split-1672x941.png"), animations: "disabled" });

  await expect(surface).toHaveAttribute("data-canonical-revision", before.revision!);
  await expect(surface).toHaveAttribute("data-history-depth", before.history!);
  await expect(page.getByTestId("dirty-status")).toHaveText(before.dirty!);
  // Transaction mode defers non-reference waves, so the first reveal (Combined) paints them once;
  // that is a presentation paint, not a document change. A further round trip must add none.
  const counters = surface.locator("[data-role='timing-chart-surface']");
  await expect(surface).toHaveAttribute("data-editor-idle", "true");
  const afterReveal = await counters.getAttribute("data-render-counters");
  expect(JSON.parse(afterReveal!).waveDromRenders).toBeGreaterThanOrEqual(JSON.parse(before.counters!).waveDromRenders);
  await page.getByRole("button", { name: "Transaction", exact: true }).click();
  await page.getByRole("button", { name: "Combined", exact: true }).click();
  await expect(surface).toHaveAttribute("data-editor-idle", "true");
  expect(JSON.parse((await counters.getAttribute("data-render-counters"))!).waveDromRenders).toBe(JSON.parse(afterReveal!).waveDromRenders);
});
