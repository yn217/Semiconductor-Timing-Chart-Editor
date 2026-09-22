import { expect, test } from "@playwright/test";

test("Signal-wide actions (Group move, Hide, Delete) live in a separate scoped group", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  await page.getByTestId("cycle-surface").locator("[data-role='frozen-row'][data-row-id='sig_cycle_ready']").click();
  const editor = page.getByTestId("signal-editor");
  const scope = editor.getByRole("group", { name: /Signal actions/ });
  await expect(scope).toBeVisible();
  await expect(scope.getByTestId("signal-visibility")).toBeVisible();
  await expect(scope.getByTestId("signal-delete")).toBeVisible();
  await expect(editor.locator(".editor-tabbar-secondary").getByTestId("signal-delete")).toHaveCount(0);
  await expect(editor.locator(".editor-tabbar-secondary").getByTestId("cancel-bottom-draft")).toBeVisible();
  const history = await page.getByTestId("history-status").innerText();
  await scope.getByTestId("signal-visibility").click();
  await expect(page.getByTestId("history-status")).not.toHaveText(history);
});
