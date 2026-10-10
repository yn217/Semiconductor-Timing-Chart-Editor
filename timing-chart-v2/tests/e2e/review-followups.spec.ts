import { expect, test } from "@playwright/test";

test("dismissing a popover with a right-click does not swallow the next left click", async ({ page }) => {
  await page.setViewportSize({ width: 1500, height: 900 });
  await page.goto("/?transaction-demo");
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Home", exact: true }).click();
  await page.getByTestId("find-replace-trigger").click();
  await expect(page.getByTestId("find-replace-panel")).toBeVisible();
  const row = page.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").first();
  const box = (await row.boundingBox())!;
  await page.mouse.click(box.x + 30, box.y + 10, { button: "right" });
  await expect(page.getByTestId("find-replace-panel")).toBeHidden();
  await page.keyboard.press("Escape");
  await row.click({ position: { x: 30, y: 10 } });
  await expect(page.getByTestId("selection-status")).toHaveText("REQUEST");
});

test("Undo with nothing to undo keeps an earlier failed Open message", async ({ page }) => {
  await page.setViewportSize({ width: 1500, height: 900 });
  await page.goto("/?transaction-demo");
  await expect(page.locator(".view-mode")).toBeVisible();
  await page.locator("input[type=file]").first().setInputFiles({ name: "broken.tcd", mimeType: "application/json", buffer: Buffer.from("not json") });
  const message = page.getByText("Open document: Expected a JSON value.").first();
  await expect(message).toBeVisible();
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("Control+z");
  await expect(message).toBeVisible();
});

test("Paste with a Group header selected puts the copied Signal into that Group", async ({ page }) => {
  await page.setViewportSize({ width: 1500, height: 900 });
  await page.goto("/?transaction-demo");
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  await page.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click({ position: { x: 30, y: 10 } });
  await page.keyboard.press("Control+c");
  await page.locator("[data-role='left-group-header'][data-group-id='grp_cycle_payload'] [data-role='tree-branch']").first().click();
  await page.keyboard.press("Control+v");
  await expect(page.getByTestId("selection-status")).toHaveText("REQUEST_copy");
  const lastPayloadRow = await page.evaluate(() => {
    const rows = [...document.querySelectorAll<HTMLElement>("[data-role='frozen-row'][data-group-id='grp_cycle_payload']")];
    return rows.at(-1)?.textContent ?? "";
  });
  expect(lastPayloadRow).toContain("REQUEST_copy");
});
