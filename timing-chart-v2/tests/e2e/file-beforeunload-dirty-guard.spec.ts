import { expect, test } from "@playwright/test";
import { startInCycleSample } from "./cycle-startup.js";

startInCycleSample(test);

test("dirty tab close requests confirmation and declining retains the page", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.getByTestId("cycle-surface").locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  const name = page.getByTestId("inspector").getByLabel("Inspector signal name", { exact: true });
  await name.fill("KEEP_OPEN_REQUEST");
  await name.press("Enter");
  await expect(page.getByTestId("dirty-status")).toHaveText("Modified");
  const pending = page.waitForEvent("dialog");
  await page.close({ runBeforeUnload: true });
  const dialog = await pending;
  expect(dialog.type()).toBe("beforeunload");
  await dialog.dismiss();
  expect(page.isClosed()).toBe(false);
  await expect(name).toHaveValue("KEEP_OPEN_REQUEST");
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await expect(page.getByTestId("dirty-status")).toHaveText("Modified");
});

const unloadState = (page: import("@playwright/test").Page) => page.evaluate(() => {
  const event = new Event("beforeunload", { cancelable: true }) as BeforeUnloadEvent;
  const dispatchResult = window.dispatchEvent(event);
  return { dispatchResult, defaultPrevented: event.defaultPrevented };
});

test("beforeunload guard follows the History dirty state without mutating it", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await expect(page.getByTestId("dirty-status")).toHaveText("Clean");
  expect(await unloadState(page)).toMatchObject({ dispatchResult: true, defaultPrevented: false });

  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  const editor = page.getByTestId("signal-editor");
  const row = editor.locator("form.event-row").nth(1);
  await row.getByLabel("Start 3").fill("1");
  await row.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByTestId("dirty-status")).toHaveText("Modified");
  const dirtyRevision = await host.getAttribute("data-canonical-revision");
  const dirtyHistory = await page.getByTestId("history-status").textContent();
  expect(await unloadState(page)).toMatchObject({ dispatchResult: false, defaultPrevented: true });
  await expect(host).toHaveAttribute("data-canonical-revision", dirtyRevision!);
  await expect(page.getByTestId("history-status")).toHaveText(dirtyHistory!);

  await page.getByTestId("editor-undo").click();
  await expect(page.getByTestId("dirty-status")).toHaveText("Clean");
  expect(await unloadState(page)).toMatchObject({ dispatchResult: true, defaultPrevented: false });
});

test("successful production Save removes dirty navigation protection", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.getByTestId("cycle-surface").locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  const name = page.getByTestId("inspector").getByLabel("Inspector signal name", { exact: true });
  await name.fill("SAVED_REQUEST");
  await name.press("Enter");
  await expect(page.getByTestId("dirty-status")).toHaveText("Modified");
  expect(await unloadState(page)).toMatchObject({ defaultPrevented: true });
  const history = await page.getByTestId("history-status").textContent();
  // A real reload must prompt; declining it preserves the live document.
  const confirmation = page.waitForEvent("dialog");
  // A dismissed reload never emits load; bound that navigation observation,
  // rather than spending the complete test timeout waiting for a canceled load.
  const reload = page.reload({ timeout: 5000 }).catch(() => null);
  const dialog = await confirmation;
  expect(dialog.type()).toBe("beforeunload");
  await dialog.dismiss();
  await reload;
  await expect(name).toHaveValue("SAVED_REQUEST");
  await expect(page.getByTestId("history-status")).toHaveText(history!);
  const download = page.waitForEvent("download");
  await page.getByTestId("ribbon").getByRole("button", { name: "Save", exact: true }).click();
  expect((await download).suggestedFilename()).toMatch(/\.tcd$/);
  await expect(page.getByTestId("dirty-status")).toHaveText("Clean");
  expect(await unloadState(page)).toMatchObject({ dispatchResult: true, defaultPrevented: false });
  await expect(page.getByTestId("history-status")).toHaveText(history!);
  await expect(name).toHaveValue("SAVED_REQUEST");
  const unexpectedDialogs: string[] = [];
  page.on("dialog", async (event) => { unexpectedDialogs.push(event.type()); await event.dismiss(); });
  await page.reload();
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  expect(unexpectedDialogs).toEqual([]);
});
