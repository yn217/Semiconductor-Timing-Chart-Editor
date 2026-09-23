import { expect, test, type Page } from "@playwright/test";

const viewports = [{ width: 1672, height: 941 }, { width: 1280, height: 720 }];

async function geometry(page: Page) {
  return page.evaluate(() => {
    const ws = document.querySelector(".desktop-workspace")!.getBoundingClientRect();
    const viewport = document.querySelector(".cycle-viewport")!.getBoundingClientRect();
    // #756: the Cycle panel now spans Main + Bottom (the left tree column continues below the timing area); the visible timing
    // canvas ends where the Bottom splitter starts, or at the workspace bottom when Bottom is hidden.
    const splitter = document.querySelector(".bottom-resize-track")?.getBoundingClientRect();
    const tree = document.querySelector("[data-role='left-tree-rows']")!.getBoundingClientRect();
    return { gap: ws.bottom - (splitter ? splitter.top : viewport.bottom), treeGap: ws.bottom - tree.bottom };
  });
}

for (const vp of viewports) {
  test(`Cycle releases Bottom space when hidden at ${vp.width}x${vp.height}`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.goto("/");
    await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
    await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
    const historyBefore = await page.getByTestId("history-status").innerText();
    const dirtyBefore = await page.getByTestId("dirty-status").innerText();
    const revisionBefore = await page.getByTestId("cycle-surface").getAttribute("data-canonical-revision");
    const shell = page.locator(".editor-shell");
    await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
    const toggle = page.getByRole("button", { name: /Bottom Editor/ }).first();
    const visibleGap = (await geometry(page)).gap;
    expect(visibleGap).toBeGreaterThan(150);

    await toggle.click();
    await expect(shell).toHaveAttribute("data-bottom-visible", "false");
    expect((await geometry(page)).gap).toBeLessThan(4);
    await expect(page.getByTestId("bottom-editor")).toBeHidden();

    await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
    await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
    await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
    expect((await geometry(page)).gap).toBeLessThan(4);

    await toggle.click();
    await expect(shell).toHaveAttribute("data-bottom-visible", "true");
    await expect(page.getByTestId("bottom-resizer")).toBeVisible();
    expect((await geometry(page)).gap).toBeGreaterThan(150);
    await expect(page.getByTestId("history-status")).toHaveText(historyBefore);
    await expect(page.getByTestId("dirty-status")).toHaveText(dirtyBefore);
    expect(await page.getByTestId("cycle-surface").getAttribute("data-canonical-revision")).toBe(revisionBefore);
  });
}
