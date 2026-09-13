import { expect, test } from "@playwright/test";

for (const viewport of [{ width: 1672, height: 941 }, { width: 1280, height: 720 }]) {
  test(`Cycle, Transaction and Combined remain usable at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    const host = page.getByTestId("cycle-surface");
    const workspace = page.locator("[data-view-mode]");
    await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
    const before = await host.evaluate((element) => ({
      revision: element.getAttribute("data-canonical-revision"),
      history: document.querySelector("[data-testid='history-status']")?.textContent,
      dirty: document.querySelector("[data-testid='dirty-status']")?.textContent,
      session: element.getAttribute("data-session-counters"),
    }));

    const modes = page.locator(".view-mode");
    await modes.getByRole("button", { name: "Cycle", exact: true }).click();
    await expect(workspace).toHaveAttribute("data-view-mode", "Cycle");
    await expect(page.getByTestId("bottom-editor").getByRole("tab", { name: "Signal", exact: true })).toBeVisible();

    await modes.getByRole("button", { name: "Transaction", exact: true }).click();
    await expect(workspace).toHaveAttribute("data-view-mode", "Transaction");
    await expect(page.getByTestId("transaction-editor")).toBeVisible();

    await modes.getByRole("button", { name: "Combined", exact: true }).click();
    await expect(workspace).toHaveAttribute("data-view-mode", "Split");
    await expect(page.locator(".split-transaction-pane")).toBeVisible();
    await expect(page.locator(".split-signal-content")).toBeVisible();
    await expect(page.getByTestId("combined-split-divider")).toBeVisible();
    await page.screenshot({
      path: `artifacts/qa-cross-mode-${viewport.width}x${viewport.height}.png`,
      fullPage: true,
    });

    await expect.poll(() => host.getAttribute("data-canonical-revision")).toBe(before.revision);
    await expect(page.getByTestId("history-status")).toHaveText(before.history!);
    await expect(page.getByTestId("dirty-status")).toHaveText(before.dirty!);
    await expect(host).toHaveAttribute("data-session-counters", before.session!);
  });
}
