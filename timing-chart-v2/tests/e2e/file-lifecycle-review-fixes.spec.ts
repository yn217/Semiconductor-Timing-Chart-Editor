import { expect, test, type Page } from "@playwright/test";
import { canonicalFixture } from "../fixtures/canonical";
import { startInCycleSample } from "./cycle-startup.js";

startInCycleSample(test);

async function saveAsFromRibbon(page: Page, name: string) {
  // Exercise Save As through the production ribbon entry point; the assertion below covers the subsequent Ctrl+S shortcut.
  await page.getByTestId("ribbon").getByRole("button", { name: "Save As", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Save As" });
  await dialog.getByLabel("Save As filename").fill(name);
  const downloadPromise = page.waitForEvent("download");
  await dialog.getByTestId("save-as-submit").click();
  return downloadPromise;
}

async function openFileFromRibbon(page: Page, fileName: string, title: string) {
  await page.getByRole("button", { name: "File", exact: true }).click();
  const chooserPromise = page.waitForEvent("filechooser");
  await page.getByTestId("ribbon").getByRole("button", { name: "Open", exact: true }).click();
  const chooser = await chooserPromise;
  const replacement = canonicalFixture();
  replacement.document.title = title;
  await chooser.setFiles({ name: fileName, mimeType: "application/json", buffer: Buffer.from(JSON.stringify(replacement)) });
}

test("Ctrl+S after Save As reuses the chosen name until a new document replaces it", async ({ page }) => {
  await page.goto("/");
  const saveAs = await saveAsFromRibbon(page, "Foo");
  expect((await saveAs).suggestedFilename()).toBe("Foo.tcd");

  const saved = page.waitForEvent("download");
  await page.keyboard.press("Control+s");
  expect((await saved).suggestedFilename()).toBe("Foo.tcd");

  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "New", exact: true }).click();
  await expect(page.locator(".app-titlebar h1")).toHaveText("Untitled Timing Chart");

  const fresh = page.waitForEvent("download");
  await page.keyboard.press("Control+s");
  expect((await fresh).suggestedFilename()).toBe("Untitled Timing Chart.tcd");
});

test("Ctrl+S after opening a file saves under the opened file's name, not the document title", async ({ page }) => {
  await page.goto("/");
  await openFileFromRibbon(page, "Foo.tcd", "Bar Title");
  await expect(page.locator(".app-titlebar h1")).toHaveText("Bar Title");

  const saved = page.waitForEvent("download");
  await page.keyboard.press("Control+s");
  expect((await saved).suggestedFilename()).toBe("Foo.tcd");
});

test("a file dropped while the Unsaved Changes prompt is open does not replace the pending Open", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  const name = page.getByTestId("inspector").getByLabel("Inspector signal name", { exact: true });
  await name.fill("EDITED_BEFORE_OPEN");
  await name.press("Enter");
  await expect(page.getByTestId("dirty-status")).toHaveText("Modified");

  await openFileFromRibbon(page, "Picked A.tcd", "Picked A");
  const dialog = page.getByTestId("unsaved-file-dialog");
  await expect(dialog).toBeVisible();

  // One byte over the open budget: before the fix this drop claimed a new request and invalidated the prompt's Open.
  await page.evaluate(() => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([new Uint8Array(32 * 1024 * 1024 + 1)], "too-large.tcd", { type: "application/json" }));
    document.body.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: transfer }));
  });
  await expect(dialog).toBeVisible();

  await dialog.getByTestId("unsaved-discard").click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(".app-titlebar h1")).toHaveText("Picked A");
});
