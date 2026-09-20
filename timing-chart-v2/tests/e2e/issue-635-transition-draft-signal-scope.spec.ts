import { expect, test } from "@playwright/test";

test("switching Signals discards the previous Signal's Add Transition draft", async ({ page }) => {
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto("/");
  const surface = page.getByTestId("cycle-surface");
  await expect(surface).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();

  await page.getByRole("treeitem", { name: /REQUEST/ }).first().click();
  await page.getByRole("tab", { name: "Signal", exact: true }).click();
  const start = page.getByLabel("New event start");
  const comment = page.getByLabel("New event comment");
  await start.fill("7");
  await comment.fill("belongs only to REQUEST");
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");

  await page.getByRole("treeitem", { name: /READY/ }).first().click();
  await expect(page.locator(".editor-selection")).toHaveText("READY · Signal");
  await expect(start).toHaveValue("0");
  await expect(comment).toHaveValue("");
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
});
