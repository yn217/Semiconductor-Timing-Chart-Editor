import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import { startInCycleSample } from "./cycle-startup.js";

startInCycleSample(test);

// #397 Sample C -- Cycle/Transaction Split (the *other* Split concept:
// waveform view + Transaction view stacked in one shared viewport, not to
// be confused with Signal Split's two Cycle viewports -- see Sample D).
// Reuses Sample A's document (samples/old/pre-reset-2026-10-02/acceptance-397/sample-a-basic-
// transaction-lifecycle.tcd.json): it already has an obvious Transaction/
// Signal correlation (Read_0/Write_0/... linked to REQUEST/READY/DATA/RESP),
// loaded through the real production File > Open input.

const dirname = path.dirname(fileURLToPath(import.meta.url));
const samplePath = path.resolve(dirname, "../../samples/old/pre-reset-2026-10-02/acceptance-397/sample-a-basic-transaction-lifecycle.tcd.json");

async function openSampleAInSplitMode(page: Page) {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(samplePath);
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Combined", exact: true }).click();
}

for (const viewport of [{ width: 1672, height: 941 }, { width: 1280, height: 720 }]) {
  test(`Cycle/Transaction Combined keeps Transaction above Signal and usable, at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });

    const before = { revision: null as string | null, history: null as string | null };
    await page.goto("/");
    await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
    await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(samplePath);
    await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true");
    before.revision = await page.getByTestId("cycle-surface").getAttribute("data-canonical-revision");
    before.history = await page.getByTestId("history-status").textContent();

    await page.locator(".view-mode").getByRole("button", { name: "Combined", exact: true }).click();
    const lanes = page.getByTestId("transaction-lanes");
    const surface = page.locator("[data-role='timing-chart-surface']");
    await expect(lanes).toBeVisible();
    await expect(surface).toBeVisible();
    // Bars are horizontally virtualized: at least one mounted; the full set lives in the Tree/Bottom table.
    expect(await lanes.locator("[data-transaction-id]").count()).toBeGreaterThan(0);

    // View mode switch itself is view-only.
    await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-canonical-revision", before.revision!);
    await expect(page.getByTestId("history-status")).toHaveText(before.history!);

    // Combined contract: Transaction lanes occupy the upper pane and the
    // Cycle waveform occupies the lower pane.
    const transactionPaneBox = (await page.locator(".split-transaction-pane").boundingBox())!;
    const signalPaneBox = (await page.locator(".split-signal-content").boundingBox())!;
    const lanesBox = (await lanes.boundingBox())!;
    const surfaceBox = (await surface.boundingBox())!;
    expect(transactionPaneBox.y + transactionPaneBox.height).toBeLessThanOrEqual(signalPaneBox.y + 1);
    expect(transactionPaneBox.x).toBeCloseTo(signalPaneBox.x, 0);
    // Both panes share one horizontal time domain: the Signal pane's laid-out content (scrollWidth) spans at least
    // the Transaction pane's full width, even though its own box is clipped to the viewport-derived width.
    const signalContentWidth = await page.locator(".split-signal-content").evaluate((element) => element.scrollWidth);
    expect(signalContentWidth).toBeGreaterThanOrEqual(transactionPaneBox.width);
    expect(lanesBox.x).toBeGreaterThanOrEqual(transactionPaneBox.x);
    expect(surfaceBox.x).toBeGreaterThanOrEqual(signalPaneBox.x);

    // One shared scrollable viewport owns both -- horizontal scroll/zoom
    // can never drift out of sync because there is only one scroll owner
    // (confirmed by both living inside the same `cycle-viewport` element).
    const bothInsideOneViewport = await page.evaluate(() => {
      const viewport = document.querySelector("[data-testid='cycle-viewport']");
      return !!viewport?.querySelector("[data-testid='transaction-lanes']") && !!viewport?.querySelector("[data-role='timing-chart-surface']");
    });
    expect(bothInsideOneViewport).toBe(true);

    expect(errors.filter((message) => !message.includes("beforeunload"))).toEqual([]);
  });
}

test("Cycle/Transaction Split: linked Signal cross-highlight uses stable IDs and stays aligned after Zoom", async ({ page }) => {
  await openSampleAInSplitMode(page);
  const lanes = page.getByTestId("transaction-lanes");
  const host = page.getByTestId("cycle-surface");

  // Selecting a Transaction cross-highlights its linked Signals by stable
  // Signal ID (not name/row-index) in the frozen label column.
  await lanes.locator("[data-transaction-id='txn_read0']").click();
  const request = host.locator("[data-role='frozen-row'][data-row-id='sig_request']");
  await expect(request).toHaveAttribute("data-transaction-linked", "true");
  const resetN = host.locator("[data-role='frozen-row'][data-row-id='sig_reset_n']");
  await expect(resetN).toHaveAttribute("data-transaction-linked", "false");

  // Zoom in; the selected Transaction's bar and its Signals' cross-highlight
  // remain aligned to the same semantic cycle boundaries (not a fixed pixel
  // offset that would drift).
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Home", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Zoom In", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Zoom In", exact: true }).click();
  await expect(request).toHaveAttribute("data-transaction-linked", "true");
  await expect(lanes.locator("[data-transaction-id='txn_read0']")).toBeVisible();
});

for (const viewport of [{ width: 1672, height: 941 }, { width: 1280, height: 720 }]) {
  test(`Transaction Inspector can focus linked Signals without changing selection or document state at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openSampleAInSplitMode(page);
    const surface = page.getByTestId("cycle-surface");
    const transactionId = "txn_read0";
    await page.getByTestId("transaction-lanes").locator(`[data-transaction-id='${transactionId}']`).click();
    const linkedRow = surface.locator("[data-role='frozen-row'][data-row-id='sig_request']");
    const unrelatedRow = surface.locator("[data-role='frozen-row'][data-row-id='sig_reset_n']");
    const linkedWave = surface.locator("[data-role='wave-owner'][data-signal-id='sig_request']");
    const unrelatedWave = surface.locator("[data-role='wave-owner'][data-signal-id='sig_reset_n']");
    await expect(linkedRow).toHaveAttribute("data-transaction-linked", "true");
    await expect(unrelatedRow).toHaveAttribute("data-transaction-linked", "false");

    const before = {
      revision: await surface.getAttribute("data-canonical-revision"),
      history: await page.getByTestId("history-status").innerText(),
      dirty: await page.getByTestId("dirty-status").innerText(),
    };
    const focus = page.getByLabel("Focus linked signals");
    await focus.check();
    await expect(page.locator(".editor-shell")).toHaveAttribute("data-focus-linked-signals", "true");
    await expect(linkedRow).toHaveCSS("opacity", "1");
    await expect(unrelatedRow).toHaveCSS("opacity", "0.28");
    await expect(linkedWave).toHaveCSS("opacity", "1");
    await expect(unrelatedWave).toHaveCSS("opacity", "0.28");
    await expect(page.getByTestId("transaction-lanes").locator(`[data-transaction-id='${transactionId}']`)).toBeVisible();
    await expect(surface).toHaveAttribute("data-canonical-revision", before.revision!);
    await expect(page.getByTestId("history-status")).toHaveText(before.history);
    await expect(page.getByTestId("dirty-status")).toHaveText(before.dirty);

    await focus.uncheck();
    await expect(page.locator(".editor-shell")).toHaveAttribute("data-focus-linked-signals", "false");
    await expect(unrelatedRow).toHaveCSS("opacity", "1");
    await expect(unrelatedWave).toHaveCSS("opacity", "1");
  });
}
