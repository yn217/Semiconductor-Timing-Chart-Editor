import { generatePerformanceDocument } from "@timing-chart-v2/testing";
import { hoverTimelineArea, timelineOwner } from "./timeline-scroll.js";
import { expect, test } from "@playwright/test";

const viewports = [{ width: 1672, height: 941 }, { width: 1280, height: 720 }] as const;

for (const viewportSize of viewports) test(`Cycle/Transaction/Combined presentation state stays isolated at ${viewportSize.width}x${viewportSize.height}`, async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize(viewportSize);
  await page.goto("/");
  const document = generatePerformanceDocument({ signalCount: 24, cycleCount: 256, profile: "transaction-heavy" });
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "mode-isolation.tcd", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(document)) });
  const discard = page.getByTestId("unsaved-discard");
  if (await discard.isVisible().catch(() => false)) await discard.click();

  const host = page.getByTestId("cycle-surface");
  const shell = page.locator(".editor-shell");
  const modes = page.locator(".view-mode");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await expect(page.getByTestId("transaction-lanes")).toBeVisible();
  const cycleViewport = page.getByTestId("cycle-viewport");
  await expect.poll(() => cycleViewport.evaluate((element) => element.scrollWidth - element.clientWidth), { timeout: 5_000, message: "Cycle viewport must have real horizontal overflow before the mode-isolation journey" }).toBeGreaterThan(0);
  const before = {
    revision: await host.getAttribute("data-canonical-revision"),
    history: await host.getAttribute("data-history-depth"),
    dirty: await page.getByTestId("dirty-status").textContent(),
  };
  const assertViewOnly = async () => {
    await expect(host).toHaveAttribute("data-canonical-revision", before.revision!);
    await expect(host).toHaveAttribute("data-history-depth", before.history!);
    await expect(page.getByTestId("dirty-status")).toHaveText(before.dirty!);
  };

  await modes.getByRole("button", { name: "Cycle", exact: true }).click();
  await expect(page.getByTestId("view-mode-status")).toHaveText("Mode: Cycle", { timeout: 5_000 });
  const cycleTimeOrigin = await page.getByTestId("geometry-grid").evaluate((element) => Number.parseFloat(getComputedStyle(element).left));
  expect(cycleTimeOrigin).toBe(Number(await shell.getAttribute("data-left-pane-width")) + Number(await shell.getAttribute("data-frozen-pane-width")));
  // #765: standalone Transaction no longer inherits the hidden Cycle rows' height, so the large-document precondition is checked where the rows are shown.
  await expect.poll(() => cycleViewport.evaluate((element) => element.scrollHeight - element.clientHeight), { timeout: 5_000, message: "Cycle viewport must have real vertical overflow before the mode-isolation journey" }).toBeGreaterThan(0);
  const cycleRow = host.locator("[data-role='frozen-row'][data-row-id='sig_perf_1']");
  await cycleRow.click();
  await cycleRow.focus();
  await expect(cycleRow).toHaveAttribute("data-selected", "true");
  await expect(page.getByTestId("selection-status")).toContainText("SIG_1");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
  await page.getByLabel("Zoom preset").selectOption("150");
  await expect(page.getByTestId("zoom-status")).toHaveText("150%", { timeout: 5_000 });
  const cycleZoom = await page.getByTestId("zoom-status").textContent();
  const cycleLeft = Number(await shell.getAttribute("data-left-pane-width"));
  const cycleFrozen = Number(await shell.getAttribute("data-frozen-pane-width"));
  await page.getByTestId("left-pane-resizer").press("ArrowRight");
  await page.getByTestId("left-pane-resizer").press("ArrowRight");
  await page.getByTestId("frozen-pane-resizer").press("ArrowRight");
  await expect.poll(() => shell.getAttribute("data-left-pane-width").then(Number), { timeout: 5_000, message: "Cycle left-pane resize must settle before capturing its mode-local value" }).toBeGreaterThan(cycleLeft);
  await expect.poll(() => shell.getAttribute("data-frozen-pane-width").then(Number), { timeout: 5_000, message: "Cycle frozen-pane resize must settle before capturing its mode-local value" }).toBeGreaterThan(cycleFrozen);
  const cycleLeftAfter = Number(await shell.getAttribute("data-left-pane-width"));
  const cycleFrozenAfter = Number(await shell.getAttribute("data-frozen-pane-width"));
  expect(cycleLeftAfter).toBeGreaterThan(cycleLeft);
  expect(cycleFrozenAfter).toBeGreaterThan(cycleFrozen);
  const cycleBottomBefore = Number(await shell.getAttribute("data-bottom-height"));
  await page.getByTestId("bottom-resizer").press("ArrowUp");
  await expect.poll(() => shell.getAttribute("data-bottom-height").then(Number), { timeout: 5_000, message: "Cycle Bottom resize must settle before capturing its mode-local value" }).toBeGreaterThan(cycleBottomBefore);
  const cycleBottomAfter = Number(await shell.getAttribute("data-bottom-height"));
  expect(cycleBottomAfter).toBeGreaterThan(cycleBottomBefore);
  await page.getByTestId("ribbon").getByRole("button", { name: "Inspector", exact: true }).click();
  await expect(shell).toHaveAttribute("data-inspector-visible", "false");
  await hoverTimelineArea(page);
  await page.mouse.wheel(500, 0);
  await expect.poll(() => timelineOwner(page).evaluate((element) => element.scrollLeft), { timeout: 5_000, message: "Cycle horizontal wheel must change the real viewport scroll position" }).toBeGreaterThan(0);
  const cycleScroll = await timelineOwner(page).evaluate((element) => element.scrollLeft);
  await assertViewOnly();

  await modes.getByRole("button", { name: "Transaction", exact: true }).click();
  await expect(page.getByTestId("view-mode-status")).toHaveText("Mode: Transaction", { timeout: 5_000 });
  await expect.poll(() => page.getByTestId("geometry-grid").evaluate((element) => Number.parseFloat(getComputedStyle(element).left))).toBe(0);
  await expect(shell).toHaveAttribute("data-inspector-visible", "true");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
  await page.getByLabel("Zoom preset").selectOption("200");
  await expect(page.getByTestId("zoom-status")).toHaveText("200%", { timeout: 5_000 });
  const transactionZoom = await page.getByTestId("zoom-status").textContent();
  expect(transactionZoom).not.toBe(cycleZoom);
  const transactionLeft = Number(await shell.getAttribute("data-left-pane-width"));
  // Transaction Mode uses a fixed-width tree (composeMode.fixedLeftWidth) and has no left-pane resizer.
  await expect(page.getByTestId("left-pane-resizer")).toHaveCount(0);
  const transactionLeftAfter = transactionLeft;
  await page.getByTestId("ribbon").getByRole("button", { name: "Bottom Editor", exact: true }).click();
  await expect(shell).toHaveAttribute("data-bottom-visible", "false");
  await assertViewOnly();

  await modes.getByRole("button", { name: "Combined", exact: true }).click();
  await expect(page.getByTestId("view-mode-status")).toHaveText("Mode: Combined", { timeout: 5_000 });
  await expect.poll(() => page.getByTestId("geometry-grid").evaluate((element) => Number.parseFloat(getComputedStyle(element).left))).toBe(Number(await shell.getAttribute("data-left-pane-width")) + Number(await shell.getAttribute("data-frozen-pane-width")));
  await expect(page.locator(".split-transaction-pane")).toBeVisible();
  await expect(page.getByTestId("combined-split-divider")).toBeVisible();
  const combinedViewport = page.getByTestId("cycle-viewport");
  // Drive the Combined viewport's own horizontal scroll (the shared owner in Combined) to prove its position is mode-local.
  await combinedViewport.evaluate((element) => { element.scrollLeft = 300; element.dispatchEvent(new Event("scroll", { bubbles: true })); });
  await expect.poll(() => combinedViewport.evaluate((element) => element.scrollLeft), { timeout: 5_000, message: "Combined horizontal wheel must change the real viewport scroll position" }).toBeGreaterThan(0);
  const combinedScroll = await combinedViewport.evaluate((element) => element.scrollLeft);
  const combinedDividerBefore = Number(await page.getByTestId("combined-split-divider").getAttribute("aria-valuenow"));
  await page.getByTestId("combined-split-divider").press("ArrowDown");
  await expect.poll(() => page.getByTestId("combined-split-divider").getAttribute("aria-valuenow").then(Number), { timeout: 5_000, message: "Combined splitter ArrowDown must change the persisted split ratio" }).toBeGreaterThan(combinedDividerBefore);
  const combinedDivider = Number(await page.getByTestId("combined-split-divider").getAttribute("aria-valuenow"));
  const combinedTransactionPane = page.locator(".split-transaction-pane");
  const combinedCyclePane = page.locator(".split-signal-content");
  await combinedTransactionPane.hover();
  await page.mouse.wheel(0, 250);
  const transactionVerticalScroll = await combinedTransactionPane.evaluate((element) => element.scrollTop);
  await combinedCyclePane.hover();
  await page.mouse.wheel(0, 250);
  const cycleVerticalScroll = await combinedCyclePane.evaluate((element) => element.scrollTop);
  expect(transactionVerticalScroll).toBeGreaterThan(0);
  expect(cycleVerticalScroll).toBeGreaterThan(0);
  expect(await combinedTransactionPane.evaluate((element) => element.scrollTop)).toBe(transactionVerticalScroll);
  await assertViewOnly();

  await modes.getByRole("button", { name: "Transaction", exact: true }).click();
  await expect(page.getByTestId("view-mode-status")).toHaveText("Mode: Transaction", { timeout: 5_000 });
  await expect(page.getByTestId("zoom-status")).toHaveText(transactionZoom!);
  await expect(shell).toHaveAttribute("data-left-pane-width", String(transactionLeftAfter));
  await expect(shell).toHaveAttribute("data-bottom-visible", "false");
  await assertViewOnly();
  await modes.getByRole("button", { name: "Cycle", exact: true }).click();
  await expect(page.getByTestId("view-mode-status")).toHaveText("Mode: Cycle", { timeout: 5_000 });
  await expect(page.getByTestId("zoom-status")).toHaveText(cycleZoom!);
  await expect(shell).toHaveAttribute("data-left-pane-width", String(cycleLeftAfter));
  await expect(shell).toHaveAttribute("data-frozen-pane-width", String(cycleFrozenAfter));
  await expect(shell).toHaveAttribute("data-inspector-visible", "false");
  await expect(cycleRow).toHaveAttribute("data-selected", "true");
  await expect(page.getByTestId("selection-status")).toContainText("SIG_1");
  await assertViewOnly();
  console.log(JSON.stringify({ viewportSize, before, cycle: { zoom: cycleZoom, left: cycleLeftAfter, frozen: cycleFrozenAfter, bottom: cycleBottomAfter, inspectorVisible: false, scrollLeft: cycleScroll }, transaction: { zoom: transactionZoom, left: transactionLeftAfter, bottomVisible: false }, combined: { scrollLeft: combinedScroll, divider: combinedDivider, transactionScrollTop: transactionVerticalScroll, cycleScrollTop: cycleVerticalScroll } }));
});
