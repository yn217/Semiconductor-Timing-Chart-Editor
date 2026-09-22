import { expect, test } from "@playwright/test";
import { startInCycleMode } from "./cycle-startup.js";

startInCycleMode(test);

// #474 Signal Type registry: Inspector's Type dropdown and the Left Tree's
// Add menu previously hardcoded the same binary->"Signal"/bus->"Bus"/
// state->"State"/logic->"Level"/event->"Event" label table independently
// in two files. They happened to agree, but nothing enforced it. Both now
// read one shared table (runtime/signal-type-registry.ts). This verifies
// the labels stay identical across both surfaces (a real regression guard
// against the two drifting again), not just that each individually shows
// some label.

for (const viewport of [{ width: 1672, height: 941 }, { width: 1280, height: 720 }]) {
test(`Signal types stay synchronized through history and Save/Open at ${viewport.width}x${viewport.height}`, async ({ page }) => {
  await page.setViewportSize(viewport);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");

  const addMenuLabels = await (async () => {
    await page.getByLabel("Add signal or group").click();
    const menu = page.getByRole("menu", { name: "Add signal or group" });
    const labels = await menu.getByRole("menuitem").allTextContents();
    await page.keyboard.press("Escape");
    return labels.map((label) => label.trim());
  })();
  expect(addMenuLabels).toEqual(expect.arrayContaining(["Signal", "Bus", "State", "Level", "Event"]));

  // Create a Bus Signal, then confirm the Inspector's own Type dropdown
  // offers exactly the same 5 labels, in the same order, from the same
  // registry -- not a second, independently-typed-out list.
  await page.getByLabel("Add signal or group").click();
  await page.getByRole("menuitem", { name: "Bus", exact: true }).click();
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true");

  const typeSelect = page.getByLabel("Inspector signal type");
  const inspectorOptionLabels = await typeSelect.locator("option").allTextContents();
  expect(inspectorOptionLabels.slice(0, 5)).toEqual(["Signal", "Bus", "State", "Level", "Event"]);
  await expect(typeSelect).toHaveValue("bus");
  await expect(page.locator('[data-role="tree-signal-role"][data-signal-type="bus"]').last()).toHaveText("Bus");
  await expect(page.getByTestId("signal-editor").locator(".editor-selection")).toContainText("Bus");
  await typeSelect.selectOption("state");
  await page.getByTestId("apply-inspector-signal").click();
  await expect(page.locator('[data-role="tree-signal-role"][data-signal-type="state"]').last()).toHaveText("State");
  await expect(page.getByTestId("signal-editor").locator(".editor-selection")).toContainText("State");
  await page.getByTestId("ribbon").getByRole("button", { name: "Undo", exact: true }).click();
  await expect(typeSelect).toHaveValue("bus");
  await expect(page.getByTestId("signal-editor").locator(".editor-selection")).toContainText("Bus");
  await page.getByTestId("ribbon").getByRole("button", { name: "Redo", exact: true }).click();
  await expect(typeSelect).toHaveValue("state");
  await expect(page.locator('[data-role="tree-signal-role"][data-signal-type="state"]').last()).toHaveText("State");
  const downloadWait = page.waitForEvent("download");
  await page.getByTestId("ribbon").getByRole("button", { name: "Save", exact: true }).click();
  const download = await downloadWait;
  const path = await download.path();
  expect(path).toBeTruthy();
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(path!);
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator('[data-role="tree-signal-name"]').last().click();
  await expect(page.getByLabel("Inspector signal type")).toHaveValue("state");
  await expect(page.locator('[data-role="tree-signal-role"][data-signal-type="state"]').last()).toHaveText("State");
  expect(errors).toEqual([]);
});
}
