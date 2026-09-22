import { expect, test } from "@playwright/test";
import { startInCycleMode } from "./cycle-startup.js";

startInCycleMode(test);

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
  await row.getByRole("button", { name: /Edit transition/ }).click();
  await row.getByLabel("Start 3").fill("1");
  await row.getByRole("button", { name: "Save" }).click();
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
