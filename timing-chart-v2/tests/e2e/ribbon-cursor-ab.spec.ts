import { expect, test } from "@playwright/test";
import { startInCycleMode } from "./cycle-startup.js";
import { timelineOwner } from "./timeline-scroll.js";

startInCycleMode(test);

// #431/#459: Cursor A/B is source-time workspace state (use-workspace-ui-
// state.ts) that had a fully-built API -- setCursor/clearCursor/moveCursor/
// swapCursors -- with zero GUI anywhere. This adds View Ribbon controls
// (Set A/Set B/Swap/Clear, stamping the currently-selected cycle) and a
// status bar readout. View-only throughout: zero Canonical/History/Dirty
// delta, verified directly against history-status.

test("Cursor A/B Ribbon controls set/swap/clear the status bar readout with zero Canonical/History delta", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();

  const cursorStatus = page.getByTestId("cursor-status");
  await expect(cursorStatus).toHaveCount(0);
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");

  await page.getByTestId("cursor-set-a").click();
  await expect(cursorStatus).toHaveText(/A 2/);
  await expect(cursorStatus).not.toContainText("Δ");
  await expect(page.locator("[data-role='cursor-line'][data-cursor='a']")).toHaveAttribute("data-cycle", "2");
  await page.getByTestId("cycle-viewport").press("Shift+ArrowRight");
  await expect(cursorStatus).toHaveText(/A 3/);
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");

  await page.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  await page.getByTestId("cursor-set-b").click();
  await expect(cursorStatus).toContainText("A 3");
  await expect(cursorStatus).toContainText("B 2");
  await expect(cursorStatus).toContainText("Δ -1 cycles");
  await expect(page.locator("[data-role='cursor-line']")).toHaveCount(2);
  await page.getByTestId("cycle-viewport").press("Alt+ArrowLeft");
  await expect(cursorStatus).toContainText("B 1");
  await expect(cursorStatus).toContainText("Δ -2 cycles");
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");

  await page.getByTestId("cursor-swap").click();
  await expect(cursorStatus).toBeVisible();

  await page.getByTestId("cursor-clear").click();
  await expect(cursorStatus).toHaveCount(0);
  await expect(page.locator("[data-role='cursor-line']")).toHaveCount(0);
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
});

test("Cursor A guide drag updates only workspace cursor state", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
  await page.getByTestId("cursor-set-a").click();
  const line = page.locator("[data-role='cursor-line'][data-cursor='a']:visible").first();
  const targetTick = page.locator("[data-cycle][data-source-cycle='5']").first();
  await expect(line).toBeVisible();
  await expect(targetTick).toBeVisible();
  const lineBox = await line.boundingBox();
  const tickBox = await targetTick.boundingBox();
  expect(lineBox).not.toBeNull();
  expect(tickBox).not.toBeNull();
  const y = lineBox!.y + Math.max(1, lineBox!.height / 2);
  await page.mouse.move(lineBox!.x + 1, y);
  await page.mouse.down();
  await page.mouse.move(tickBox!.x + tickBox!.width / 2, y);
  await page.mouse.up();
  await expect(page.getByTestId("cursor-status")).toContainText("A 5");
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
});

for (const viewportSize of [{ width: 1280, height: 720 }, { width: 1672, height: 941 }]) {
  test(`Cursor A/B keep their source-cycle X through zoom and horizontal scroll at ${viewportSize.width}x${viewportSize.height}`, async ({ page }) => {
    await page.setViewportSize(viewportSize);
    await page.goto("/?transaction-demo");
    const surface = page.getByTestId("cycle-surface");
    await expect(surface).toHaveAttribute("data-cycle-view-ready", "true");
    await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
    const cycleViewport = page.getByTestId("cycle-viewport");
    const cursorStatus = page.getByTestId("cursor-status");
    const before = {
      revision: await surface.getAttribute("data-canonical-revision"),
      history: await page.getByTestId("history-status").innerText(),
      dirty: await page.getByTestId("dirty-status").innerText(),
    };

    await page.getByTestId("cursor-set-a").click();
    await expect(cursorStatus).toContainText("A 2");
    await page.getByTestId("cursor-set-b").click();
    await cycleViewport.press("Alt+ArrowRight");
    await cycleViewport.press("Alt+ArrowRight");
    await expect(cursorStatus).toContainText("B 4");
    await expect(cursorStatus).toContainText("Δ 2 cycles");
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));

    const assertSourceAlignment = async (stage: string) => {
      for (const [key, cycle] of [["a", 2], ["b", 4]] as const) {
        const line = page.locator(`[data-role='cursor-line'][data-cursor='${key}']`);
        const boundary = page.locator(`[data-testid='cycle-ruler'] [data-source-cycle='${cycle}']`).first();
        await expect(line).toHaveAttribute("data-cycle", String(cycle));
        await expect(boundary).toHaveCount(1);
        const lineBox = await line.boundingBox();
        const boundaryBox = await boundary.boundingBox();
        expect(lineBox, `Cursor ${key.toUpperCase()} should remain projected`).not.toBeNull();
        expect(boundaryBox, `source Cycle ${cycle} should remain represented on the ruler`).not.toBeNull();
        const geometry = await page.evaluate(({ cursor, sourceCycle }) => {
          const marker = document.querySelector<HTMLElement>(`[data-role='cursor-line'][data-cursor='${cursor}']`)!;
          const tick = document.querySelector<HTMLElement>(`[data-testid='cycle-ruler'] [data-source-cycle='${sourceCycle}']`)!;
          const overlay = marker.parentElement!;
          const viewport = document.querySelector<HTMLElement>("[data-testid='cycle-viewport']")!;
          const ruler = document.querySelector<HTMLElement>("[data-testid='cycle-ruler'] .cycle-ruler-content")!;
          const box = (element: HTMLElement) => { const rect = element.getBoundingClientRect(); return { left: rect.left, width: rect.width }; };
          return { marker: box(marker), markerStyleLeft: marker.style.left, overlay: box(overlay), viewport: box(viewport), ruler: box(ruler), tick: box(tick), tickStyleLeft: tick.style.left, tickTransform: getComputedStyle(tick).transform };
        }, { cursor: key, sourceCycle: cycle });
        expect(Math.abs(lineBox!.x - boundaryBox!.x), `${stage}: cursor ${key.toUpperCase()} must align to source Cycle ${cycle}; ${JSON.stringify(geometry)}`).toBeLessThanOrEqual(2);
      }
    };
    await assertSourceAlignment("100% before zoom");

    await page.getByRole("combobox", { name: "Zoom preset" }).selectOption("800");
    await expect(page.getByTestId("zoom-status")).toHaveText("800%");
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await assertSourceAlignment("800% before scroll");
    const owner = timelineOwner(page);
    const overflow = await owner.evaluate((element) => element.scrollWidth - element.clientWidth);
    expect(overflow, "high zoom should provide a real horizontal navigation range").toBeGreaterThan(40);
    await owner.evaluate((element) => { element.scrollLeft = Math.min(40, element.scrollWidth - element.clientWidth); });
    await expect.poll(() => owner.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await assertSourceAlignment("800% after scroll");
    await expect(cursorStatus).toContainText("A 2");
    await expect(cursorStatus).toContainText("B 4");
    await expect(cursorStatus).toContainText("Δ 2 cycles");
    await expect(surface).toHaveAttribute("data-canonical-revision", before.revision!);
    await expect(page.getByTestId("history-status")).toHaveText(before.history);
    await expect(page.getByTestId("dirty-status")).toHaveText(before.dirty);
  });
}
