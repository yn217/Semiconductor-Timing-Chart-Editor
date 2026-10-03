import { expect, test, type Page } from "@playwright/test";
import { generatePerformanceDocument } from "@timing-chart-v2/testing";
import { documentState, expectViewOnly } from "./view-only.js";

/**
 * #593 real-browser acceptance: Cycle and Transaction own separate workspace layout. Changing the other mode's horizontal presentation
 * (Zoom, scroll, left-pane width) and coming back leaves this mode's pitch / left width / scroll exactly as recorded. Combined's shared
 * horizontal axis is covered by issue-573-combined-shared-time-axis.spec.ts at both viewports.
 */
const sizes = [{ width: 1280, height: 720 }, { width: 1672, height: 941 }] as const;

async function openDocument(page: Page): Promise<void> {
  const base = generatePerformanceDocument({ signalCount: 6, cycleCount: 400, profile: "standard" });
  const document = { ...base, transactions: Array.from({ length: 8 }, (_, index) => ({ id: `tx_${index}`, name: `Transfer ${index}`, start: index * 40, end: index * 40 + 20, laneId: `lane_${index % 2}`, linkedSignals: [] })) };
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "p593.tcd", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(document)) });
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true", { timeout: 60_000 });
}

const setMode = async (page: Page, mode: "Cycle" | "Transaction" | "Combined") => {
  await page.locator(".view-mode").getByRole("button", { name: mode, exact: true }).click();
  await expect(page.getByTestId("view-mode-status")).toHaveText(mode === "Combined" ? /Mode: (Combined|Split)/ : `Mode: ${mode}`);
  await expect(page.locator(".cycle-panel")).toHaveAttribute("data-workspace-owner", `${mode}Workspace`);
  await expect(page.locator(".cycle-panel[data-workspace-owner]")).toHaveCount(1);
  await expect(page.locator(".desktop-workspace")).toHaveAttribute("data-workspace-owner", `${mode}Workspace`);
  await expect(page.getByTestId("left-workspace-rail")).toHaveAttribute("data-workspace-owner", `${mode}Workspace`);
  await expect(page.getByTestId("left-workspace-rail")).toHaveCount(1);
  const viewport = page.getByTestId("cycle-viewport");
  await expect(viewport).toHaveAttribute("data-time-viewport-owner", mode === "Cycle" ? "cycle-inner" : mode === "Transaction" ? "transaction-viewport" : "combined-viewport");
  await expect(viewport).toHaveAttribute("data-content-width-owner", mode === "Cycle" ? "cycle-geometry" : mode === "Transaction" ? "transaction-lanes" : "combined-source-time");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true", { timeout: 30_000 });
  await page.waitForTimeout(300);
};

const metrics = (page: Page) => page.evaluate(() => {
  const owner = document.querySelector<HTMLElement>(".editor-shell[data-view-mode='Cycle'] [data-role='timeline-viewport']") ?? document.querySelector<HTMLElement>("[data-testid='cycle-viewport']")!;
  const tick = (cycle: number) => document.querySelector<HTMLElement>(`[data-testid='cycle-ruler'] .cycle-tick[data-source-cycle='${cycle}'], [data-testid='cycle-ruler'] .cycle-tick[data-cycle='${cycle}']`);
  const first = tick(40)?.getBoundingClientRect().left; const second = tick(80)?.getBoundingClientRect().left;
  const shell = document.querySelector<HTMLElement>(".editor-shell")!;
  return { pitch: first !== undefined && second !== undefined ? Math.round((second - first) * 10) / 10 : undefined, leftPane: shell.dataset.leftPaneWidth, scrollLeft: Math.round(owner.scrollLeft), ownerLeft: Math.round(owner.getBoundingClientRect().left), ownerWidth: Math.round(owner.getBoundingClientRect().width) };
});

for (const size of sizes) {
  test(`Combined owns an independent shared zoom across standalone mode round trips at ${size.width}x${size.height}`, async ({ page }) => {
    test.setTimeout(150_000);
    await page.setViewportSize(size);
    await page.goto("/");
    await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
    await openDocument(page);
    await setMode(page, "Cycle");
    const cycleBefore = await metrics(page);

    await setMode(page, "Combined");
    await page.getByTestId("ribbon").getByRole("button", { name: "Zoom In", exact: true }).click();
    await page.waitForTimeout(300);
    const combinedZoom = await metrics(page);
    expect(combinedZoom.pitch).not.toBe(cycleBefore.pitch);

    await setMode(page, "Transaction");
    await page.getByTestId("ribbon").getByRole("button", { name: "Zoom In", exact: true }).click();
    await setMode(page, "Cycle");
    expect(await metrics(page)).toEqual(cycleBefore);
    await setMode(page, "Combined");
    expect(await metrics(page)).toEqual(combinedZoom);
  });

  test(`Cycle layout is untouched by Transaction zoom/scroll and back at ${size.width}x${size.height}`, async ({ page }) => {
    test.setTimeout(150_000);
    await page.setViewportSize(size);
    await page.goto("/");
    await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
    await openDocument(page);
    await setMode(page, "Cycle");
    const recorded = await metrics(page);
    expect(recorded.pitch, "Cycle tick pitch is measurable").toBeDefined();

    await setMode(page, "Transaction");
    const ribbon = page.getByTestId("ribbon");
    await ribbon.getByRole("button", { name: "Zoom In", exact: true }).click();
    await ribbon.getByRole("button", { name: "Zoom In", exact: true }).click();
    await page.getByTestId("cycle-viewport").evaluate((element) => { element.scrollLeft = element.scrollWidth * 0.3; });
    await page.waitForTimeout(300);

    await setMode(page, "Cycle");
    expect(await metrics(page)).toEqual(recorded);
  });

  test(`Transaction layout is untouched by Cycle left-pane resize/zoom and back at ${size.width}x${size.height}`, async ({ page }) => {
    test.setTimeout(150_000);
    await page.setViewportSize(size);
    await page.goto("/");
    await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
    await openDocument(page);
    await setMode(page, "Transaction");
    const recorded = await metrics(page);
    expect(recorded.pitch, "Transaction tick pitch is measurable").toBeDefined();
    const treeWidth = () => page.getByTestId("transaction-tree-header").evaluate((element) => Math.round(element.getBoundingClientRect().width));
    const tree = await treeWidth();

    await setMode(page, "Cycle");
    const resizer = page.getByTestId("left-pane-resizer");
    const box = (await resizer.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + 60, box.y + box.height / 2);
    await page.mouse.up();
    await page.getByTestId("ribbon").getByRole("button", { name: "Zoom In", exact: true }).click();
    await page.waitForTimeout(300);

    await setMode(page, "Transaction");
    const after = await metrics(page);
    expect(after.pitch).toBe(recorded.pitch);
    expect(after.ownerLeft).toBe(recorded.ownerLeft);
    expect(after.ownerWidth).toBe(recorded.ownerWidth);
    expect(await treeWidth()).toBe(tree);
  });
}

for (const size of sizes) {
  test(`Mode switching is view-only and Cycle-only chrome is not mounted in Transaction at ${size.width}x${size.height}`, async ({ page }) => {
    test.setTimeout(150_000);
    await page.setViewportSize(size);
    await page.goto("/");
    await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
    await openDocument(page);
    const host = page.getByTestId("cycle-surface");
    await expect(host).toHaveAttribute("data-canonical-revision", /^\d+$/);
    const viewOnlyBefore = await documentState(page);
    await setMode(page, "Cycle");
    await expect(page.getByTestId("left-pane-resizer")).toHaveCount(1);
    await expect(host.locator("[data-role='frozen-row']")).not.toHaveCount(0);
    await setMode(page, "Transaction");
    await expect(page.getByTestId("left-pane-resizer"), "Signal/Group left-pane splitter is Cycle-only").toHaveCount(0);
    await expect(host.locator("[data-role='frozen-label-rows']"), "Cycle frozen-column layer is not mounted in Transaction").toHaveCount(0);
    await expect(host.locator("[data-role='frozen-row']"), "Cycle frozen Role/Signal rows are not mounted in Transaction").toHaveCount(0);
    await expect(host.locator("[data-role='frozen-group-header']")).toHaveCount(0);
    await setMode(page, "Combined");
    await expect(host.locator("[data-role='frozen-label-rows']")).toHaveCount(1);
    await expect(host.locator("[data-role='frozen-row']")).not.toHaveCount(0);
    await setMode(page, "Cycle");
    await expect(host.locator("[data-role='frozen-row']")).not.toHaveCount(0);
    await expectViewOnly(page, viewOnlyBefore);
  });
}
