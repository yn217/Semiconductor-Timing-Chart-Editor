import { expect, test } from "@playwright/test";

test("dropping a .tcd file on the window opens it and does not navigate away", async ({ page }) => {
  await page.setViewportSize({ width: 1500, height: 900 });
  await page.goto("/?transaction-demo");
  await expect(page.locator(".view-mode")).toBeVisible();
  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  const [download] = await Promise.all([page.waitForEvent("download"), page.locator(".ribbon").getByRole("button", { name: "Save", exact: true }).first().click()]);
  const text = (await (await import("node:fs/promises")).readFile((await download.path())!, "utf8"));
  const url = page.url();

  await page.evaluate((contents) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([contents], "dropped.tcd", { type: "application/json" }));
    const over = new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: transfer });
    document.body.dispatchEvent(over);
    const drop = new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: transfer });
    document.body.dispatchEvent(drop);
    (window as unknown as { __dropPrevented: boolean[] }).__dropPrevented = [over.defaultPrevented, drop.defaultPrevented];
  }, text);

  expect(await page.evaluate(() => (window as unknown as { __dropPrevented: boolean[] }).__dropPrevented)).toEqual([true, true]);
  await expect(page.getByTestId("titlebar-document-title")).toContainText("Sample");
  expect(page.url()).toBe(url);
});

test("dropping a non-tcd file reports a failed Open instead of leaving the page", async ({ page }) => {
  await page.setViewportSize({ width: 1500, height: 900 });
  await page.goto("/?transaction-demo");
  await expect(page.locator(".view-mode")).toBeVisible();
  const url = page.url();
  await page.evaluate(() => {
    const transfer = new DataTransfer();
    transfer.items.add(new File(["not json"], "notes.txt", { type: "text/plain" }));
    document.body.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: transfer }));
  });
  await expect(page.getByText(/Open document/)).toBeVisible();
  expect(page.url()).toBe(url);
});
