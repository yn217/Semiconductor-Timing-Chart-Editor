import { expect, test } from "@playwright/test";
import { startInCycleSample } from "./cycle-startup.js";

startInCycleSample(test);

test("Cycle Transition row selection keeps the editor mounted and view-only at supported desktop sizes", async ({ page }) => {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const mainFrameNavigations: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) mainFrameNavigations.push(frame.url());
  });

  for (const viewport of [{ width: 1280, height: 720 }, { width: 1672, height: 941 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    const host = page.getByTestId("cycle-surface");
    await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
    await page.getByRole("tab", { name: "Signal", exact: true }).click();
    await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();

    const editor = page.getByTestId("signal-editor");
    const rows = editor.locator("form.event-row");
    await expect(rows).toHaveCount(3);
    const selectAll = editor.getByLabel("Select all transitions", { exact: true });
    const rowOne = editor.getByLabel("Select transition 1", { exact: true });
    const rowTwo = editor.getByLabel("Select transition 2", { exact: true });
    const selectedCount = editor.getByTestId("event-selected-count");
    const deleteSelected = editor.getByTestId("event-delete-selected");
    const baseline = await host.evaluate((element) => ({
      revision: element.getAttribute("data-canonical-revision"),
      history: document.querySelector("[data-testid='history-status']")?.textContent,
      dirty: document.querySelector("[data-testid='dirty-status']")?.textContent,
      href: location.href,
    }));
    const navigationCount = mainFrameNavigations.length;

    await rowOne.check();
    await expect(selectedCount).toHaveText("1 row selected");
    await expect(deleteSelected).toBeEnabled();
    await expect(rowTwo).not.toBeChecked();
    await expect(selectAll).not.toBeChecked();
    await rowTwo.check();
    await expect(selectedCount).toHaveText("2 rows selected");
    await expect(deleteSelected).toBeEnabled();
    await rowOne.uncheck();
    await expect(selectedCount).toHaveText("1 row selected");
    await selectAll.check();
    await expect(selectedCount).toHaveText("3 rows selected");
    await expect(deleteSelected).toBeDisabled();
    await selectAll.uncheck();
    await expect(selectedCount).toHaveText("0 rows selected");

    await expect(host).toBeVisible();
    await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
    await expect(editor).toBeVisible();
    await expect(rows).toHaveCount(3);
    await expect(page.locator("[data-role='wave-owner']").first()).toBeVisible();
    expect(await host.getAttribute("data-canonical-revision")).toBe(baseline.revision);
    expect(await page.getByTestId("history-status").textContent()).toBe(baseline.history);
    expect(await page.getByTestId("dirty-status").textContent()).toBe(baseline.dirty);
    expect(page.url()).toBe(baseline.href);
    expect(mainFrameNavigations).toHaveLength(navigationCount);
    expect(pageErrors, `${viewport.width}x${viewport.height} page errors`).toEqual([]);
    expect(consoleErrors, `${viewport.width}x${viewport.height} console errors`).toEqual([]);
  }
});
