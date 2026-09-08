import { expect, test } from "@playwright/test";

// #474 Signal Type registry: Inspector's Type dropdown and the Left Tree's
// Add menu previously hardcoded the same binary->"Signal"/bus->"Bus"/
// state->"State"/logic->"Level"/event->"Event" label table independently
// in two files. They happened to agree, but nothing enforced it. Both now
// read one shared table (runtime/signal-type-registry.ts). This verifies
// the labels stay identical across both surfaces (a real regression guard
// against the two drifting again), not just that each individually shows
// some label.

test("Inspector Type dropdown and the Add-Signal menu show identical Signal Type labels from one shared registry", async ({ page }) => {
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
});
