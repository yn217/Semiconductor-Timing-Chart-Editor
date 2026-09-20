import { expect, test, type Page } from "@playwright/test";

const SIZES = [{ width: 1672, height: 941 }, { width: 1280, height: 720 }] as const;

async function toCycle(page: Page) {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true", { timeout: 30_000 });
}
const rect = (page: Page, selector: string) => page.evaluate((sel) => { const e = document.querySelector<HTMLElement>(sel); if (!e) return null; const b = e.getBoundingClientRect(); return { top: b.top, bottom: b.bottom, height: b.height, left: b.left, width: b.width }; }, selector);

for (const size of SIZES) {
  test(`#740 Cycle: hiding Bottom returns every Bottom/splitter row to the timing canvas at ${size.width}x${size.height}`, async ({ page }) => {
    await page.setViewportSize(size);
    await toCycle(page);
    const visible = await rect(page, ".cycle-panel");
    const workspace = await rect(page, ".desktop-workspace");
    expect(visible && workspace).toBeTruthy();
    await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
    await page.getByTestId("ribbon").getByRole("button", { name: "Bottom Editor", exact: true }).click();
    await expect(page.locator("main.editor-shell")).toHaveAttribute("data-bottom-visible", "false");
    const hidden = await rect(page, ".cycle-panel");
    // The timing canvas now reaches the workspace bottom: no reserved band the size of Bottom + splitter.
    expect(Math.abs(hidden!.bottom - workspace!.bottom), "cycle panel bottom == workspace bottom").toBeLessThanOrEqual(1);
    expect(hidden!.height).toBeGreaterThan(visible!.height + 100);
    await expect(page.getByTestId("bottom-resizer")).toHaveCount(0);
    // View-only.
    await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
  });
}

test("#741 Transaction fixed-width sidebar exposes no focusable ghost resizer and hides no width mutation", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  await expect(page.getByTestId("view-mode-status")).toHaveText("Mode: Transaction");
  await expect(page.getByTestId("left-pane-resizer")).toHaveCount(0);
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  await expect(page.getByTestId("left-pane-resizer")).toHaveCount(1);
});

for (const size of SIZES) {
  test(`#756 Cycle left rail continues below the tree as one closed footer panel at ${size.width}x${size.height}`, async ({ page }) => {
    await page.setViewportSize(size);
    await toCycle(page);
    const info = await page.evaluate(() => {
      const workspace = document.querySelector<HTMLElement>(".desktop-workspace")!;
      const bottom = document.querySelector<HTMLElement>(".bottom-editor")!.getBoundingClientRect();
      const style = getComputedStyle(workspace, "::after");
      return { content: style.content, bg: style.backgroundColor, height: parseFloat(style.height), width: parseFloat(style.width), bottomHeight: bottom.height, borderTop: style.borderTopWidth, borderRight: style.borderRightWidth };
    });
    expect(info.content).not.toBe("none");
    expect(info.bg).toBe("rgb(249, 251, 253)");
    expect(info.borderRight).toBe("1px");
    // Spans the splitter row + Bottom rows (approved --gui-bottom-height + 10px).
    expect(info.height).toBeGreaterThanOrEqual(info.bottomHeight);
    expect(Math.abs(info.height - (info.bottomHeight + 10))).toBeLessThanOrEqual(2);
    expect(info.width).toBeGreaterThan(200);
  });
}
