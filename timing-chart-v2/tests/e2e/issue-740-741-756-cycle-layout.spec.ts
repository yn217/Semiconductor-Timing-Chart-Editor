import { expect, test, type Page } from "@playwright/test";

const SIZES = [{ width: 1672, height: 941 }, { width: 1280, height: 720 }] as const;

async function toCycle(page: Page) {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true", { timeout: 30_000 });
}
test("#741 Transaction fixed-width sidebar exposes no focusable ghost resizer and hides no width mutation", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  await expect(page.getByTestId("view-mode-status")).toHaveText("Mode: Transaction");
  await expect(page.getByTestId("left-pane-resizer")).toHaveCount(0);
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  const separator = page.getByTestId("left-pane-resizer");
  await expect(separator).toHaveCount(1);
  const before = await separator.getAttribute("aria-valuenow");
  await separator.focus();
  await page.keyboard.press("ArrowRight");
  expect(await separator.getAttribute("aria-valuenow")).not.toBe(before);
});

test("#756 Cycle left rail spans Main + Bottom at both supported viewports", async ({ page }) => {
  await page.setViewportSize(SIZES[0]);
  await toCycle(page);
  const measure = () => page.evaluate(() => {
    const box = (s: string) => { const e = document.querySelector<HTMLElement>(s); if (!e) return null; const b = e.getBoundingClientRect(); return { left: b.left, right: b.right, top: b.top, bottom: b.bottom }; };
    return { tree: box("[data-role='left-tree-rows']"), bottom: box(".bottom-editor"), splitter: box(".bottom-resize-track"), track: box("[data-testid='timeline-hscroll']"), workspace: box(".desktop-workspace"), rail: box(".left-workspace-rail"), panel: box(".cycle-panel") };
  });

  for (const size of SIZES) {
    await page.setViewportSize(size);
    const visible = await measure();
    // The tree column is not clipped at the Main area: it continues under the Bottom row, down to the workspace bottom.
    expect(visible.tree!.bottom).toBeGreaterThanOrEqual(visible.bottom!.bottom - 2);
    expect(visible.tree!.right).toBeLessThanOrEqual(visible.bottom!.left + 1);
    // No detached tinted footer block any more.
    expect(await page.evaluate(() => getComputedStyle(document.querySelector(".desktop-workspace")!, "::after").display)).toBe("none");
    // The Timeline scrollbar stays above Bottom (not beneath it, not under the fixed columns).
    if (visible.track) expect(visible.track.bottom).toBeLessThanOrEqual(visible.splitter!.top + 1);
    await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
    await page.getByTestId("ribbon").getByRole("button", { name: "Bottom Editor", exact: true }).click();
    await expect(page.locator("main.editor-shell")).toHaveAttribute("data-bottom-visible", "false");
    // The surface refills the released rows on the next layout tick.
    await expect.poll(async () => { const m = await measure(); return m.workspace!.bottom - m.tree!.bottom; }).toBeLessThanOrEqual(30);
    const hidden = await measure();
    expect(Math.abs(hidden.panel!.bottom - hidden.workspace!.bottom)).toBeLessThanOrEqual(1);
    await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
    await page.getByTestId("ribbon").getByRole("button", { name: "Bottom Editor", exact: true }).click();
    await expect(page.locator("main.editor-shell")).toHaveAttribute("data-bottom-visible", "true");
  }
});
