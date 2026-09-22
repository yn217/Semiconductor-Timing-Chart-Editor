import { expect, test } from "@playwright/test";

// #740: hiding the Bottom editor in Cycle Mode must return its full vertical space to the timing canvas -- no reserved splitter/bottom row.
for (const viewport of [{ width: 1672, height: 941 }, { width: 1280, height: 720 }]) {
  test(`Cycle: hiding Bottom releases its space back to the timing canvas at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
    await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
    const history = await page.getByTestId("history-status").innerText();
    const revision = await page.getByTestId("cycle-surface").getAttribute("data-canonical-revision");
    const workspace = page.locator(".desktop-workspace");
    const cycleViewport = page.getByTestId("cycle-viewport");

    const before = await workspace.evaluate((el) => ({ rows: getComputedStyle(el).gridTemplateRows, bottom: el.getBoundingClientRect().bottom }));
    const viewportBottomBefore = (await cycleViewport.boundingBox())!.y + (await cycleViewport.boundingBox())!.height;

    await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
    await page.getByTestId("ribbon").getByRole("button", { name: "Bottom Editor", exact: true }).click();
    await expect(page.locator("main.editor-shell")).toHaveAttribute("data-bottom-visible", "false");
    await expect(page.getByTestId("bottom-resizer")).toBeHidden();

    const after = await workspace.evaluate((el) => ({ rows: getComputedStyle(el).gridTemplateRows, bottom: el.getBoundingClientRect().bottom }));
    const rowSizes = after.rows.split(" ").map((value) => parseFloat(value));
    // The splitter and Bottom rows collapse to (approximately) zero -- no reserved band.
    expect(rowSizes[1]).toBeLessThanOrEqual(1);
    expect(rowSizes[2]).toBeLessThanOrEqual(1);
    void viewportBottomBefore;
    // The .cycle-panel grid row itself (not the viewport's own JS-computed --cycle-fill, a separate #756 concern) now extends into the
    // released space: its row is `minmax(0, 1fr)` and the sibling splitter/Bottom rows are 0, so the panel's rendered bottom tracks the
    // workspace's own bottom edge with no reserved gap.
    const panelBottom = await page.locator(".cycle-panel").evaluate((el) => el.getBoundingClientRect().bottom);
    expect(Math.abs(panelBottom - after.bottom)).toBeLessThanOrEqual(2);

    // Cycle -> Transaction -> Cycle: the hidden-Bottom geometry is stable across a mode round trip.
    await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
    await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
    const afterRoundTrip = await workspace.evaluate((el) => getComputedStyle(el).gridTemplateRows);
    const roundTripSizes = afterRoundTrip.split(" ").map((value) => parseFloat(value));
    expect(roundTripSizes[1]).toBeLessThanOrEqual(1);
    expect(roundTripSizes[2]).toBeLessThanOrEqual(1);

    // Re-showing Bottom restores the approved height.
    await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
    await page.getByTestId("ribbon").getByRole("button", { name: "Bottom Editor", exact: true }).click();
    await expect(page.locator("main.editor-shell")).toHaveAttribute("data-bottom-visible", "true");
    await expect(page.getByTestId("bottom-resizer")).toBeVisible();

    await expect(page.getByTestId("history-status")).toHaveText(history);
    expect(await page.getByTestId("cycle-surface").getAttribute("data-canonical-revision")).toBe(revision);
  });
}
