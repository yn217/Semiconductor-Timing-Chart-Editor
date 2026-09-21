import { expect, test } from "@playwright/test";

// #720: Ctrl+Z / Ctrl+Shift+Z mean the same in Cycle, Transaction and Combined: one command edit is undone and redone, no mode-specific meaning.
for (const mode of ["Cycle", "Transaction", "Combined"] as const) {
  test(`Ctrl+Z / Ctrl+Shift+Z are consistent in ${mode}`, async ({ page }) => {
    await page.goto("/?transaction-demo");
    await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
    await page.locator(".view-mode").getByRole("button", { name: mode, exact: true }).click();
    const revision = () => page.getByTestId("cycle-surface").getAttribute("data-canonical-revision");
    const history = () => page.getByTestId("history-status").innerText().then((text) => text.split(" / ")[0]!);
    const r0 = await revision(); const h0 = await history();
    // A real edit through the shared Home Undo/Redo-covered path: rename via Ribbon Add marker is mode independent, so use Timeline > Add marker.
    await page.locator(".ribbon-tabs").getByRole("button", { name: "Timeline", exact: true }).click();
    await page.getByRole("button", { name: "Add marker" }).click();
    await expect.poll(history).not.toBe(h0);
    const r1 = await revision(); const h1 = await history();
    await page.locator("main.editor-shell").click({ position: { x: 5, y: 5 }, force: true });
    await page.keyboard.press("Control+z");
    await expect.poll(history).toBe(h0);
    await page.keyboard.press("Control+Shift+z");
    await expect.poll(history).toBe(h1);
    expect(r0).not.toBeNull();
  });
}
