import { expect, test } from "@playwright/test";

// #720: while a Transaction bar is being dragged the status bar explains the gesture ("... Esc cancels"); it disappears on release and on Escape,
// and the hint never mutates Canonical/History.
for (const viewport of [{ width: 1672, height: 941 }, { width: 1280, height: 720 }]) {
  test(`Transaction drag shows a status hint that clears on Escape and release at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/?transaction-demo");
    await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
    await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
    const tool = page.getByTestId("tool-status");
    const idleText = await tool.innerText();
    const history = await page.getByTestId("history-status").innerText();
    const revision = await page.getByTestId("cycle-surface").getAttribute("data-canonical-revision");
    const bar = page.locator(".transaction-track [data-transaction-id]").first();
    await expect(bar).toBeVisible();
    const box = (await bar.locator("i[data-edge='end']").boundingBox()) ?? (await bar.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 - 20, box.y + box.height / 2);
    await expect(tool).toContainText("Esc cancels");
    await page.keyboard.press("Escape");
    await expect(tool).not.toContainText("Esc cancels");
    await page.mouse.up();
    await expect(tool).toHaveText(idleText);
    await expect(page.getByTestId("history-status")).toHaveText(history);
    await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-canonical-revision", revision!);
    // Release path: drag again, release without Escape.
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 - 1, box.y + box.height / 2);
    await expect(tool).toContainText("Esc cancels");
    await page.mouse.up();
    await expect(tool).not.toContainText("Esc cancels");
  });
}
