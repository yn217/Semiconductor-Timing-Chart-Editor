import { expect, test } from "@playwright/test";

test("Find and Replace treats the replacement text literally ($& and $$ are not expanded)", async ({ page }) => {
  await page.setViewportSize({ width: 1500, height: 900 });
  await page.goto("/?transaction-demo");
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Home", exact: true }).click();
  await page.getByTestId("find-replace-trigger").click();
  await page.getByTestId("find-replace-find").fill("CLOCK");
  for (const replacement of ["a$&b", "$$", "$`z", "x$1y"]) {
    await page.getByTestId("find-replace-replace").fill(replacement);
    await expect(page.locator(".find-replace-preview li").first().locator("span").last()).toHaveText(replacement);
  }
});

test("Replace All still renames the other matches when one match is already the replacement", async ({ page }) => {
  await page.setViewportSize({ width: 1500, height: 900 });
  await page.goto("/?transaction-demo");
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  const rename = async (rowId: string, name: string) => {
    await page.locator(`[data-role='frozen-row'][data-row-id='${rowId}']`).click({ position: { x: 30, y: 10 } });
    const input = page.getByLabel("Inspector signal name", { exact: true }).first();
    await input.fill(name);
    await input.press("Enter");
  };
  await rename("sig_cycle_ready", "ready_x");
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Home", exact: true }).click();
  await page.getByTestId("find-replace-trigger").click();
  // Case-insensitive find: "REQUEST", "READY"-like names already contain "RE" in upper case (unchanged); "ready_x" becomes "REady_x".
  await page.getByTestId("find-replace-find").fill("re");
  await page.getByTestId("find-replace-replace").fill("RE");
  await page.getByTestId("find-replace-apply").click();
  await expect(page.getByTestId("history-status")).toHaveText("History 2 / Redo 0");
  await expect(page.locator("[data-role='frozen-row'][data-row-id='sig_cycle_ready']")).toContainText("REady_x");
});
