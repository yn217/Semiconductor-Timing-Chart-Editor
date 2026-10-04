import { expect, test } from "@playwright/test";
import { startInCycleSample } from "./cycle-startup.js";

startInCycleSample(test);

test("Signal Tree creates a Group from multi-selection and moves selected Signals atomically", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");

  const leftRow = (id: string) => host.locator(`[data-role='left-row'][data-row-id='${id}']`);
  const clockGroupId = await host.locator("[data-role='left-row'][data-row-id='sig_cycle_clock']").getAttribute("data-group-id");
  expect(clockGroupId).toBeTruthy();
  const previousGroups = new Set(await host.locator("[data-role='left-group-header'][data-group-id]").evaluateAll((items) => items.map((item) => (item as HTMLElement).dataset.groupId ?? "")));

  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_ready']").click({ modifiers: ["Control"] });
  await expect(page.getByTestId("selection-status")).toHaveText("2 signals");
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");

  await page.getByRole("button", { name: "More tree actions" }).click();
  await page.getByTestId("create-group-from-selection").click();
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await expect(page.getByTestId("selection-status")).toHaveText("2 signals");
  await expect.poll(async () => {
    const ids = await host.locator("[data-role='left-group-header'][data-group-id]").evaluateAll((items) => items.map((item) => (item as HTMLElement).dataset.groupId ?? ""));
    return ids.find((id) => !previousGroups.has(id));
  }).toBeTruthy();
  const currentGroupIds = await host.locator("[data-role='left-group-header'][data-group-id]").evaluateAll((items) => items.map((item) => (item as HTMLElement).dataset.groupId ?? ""));
  const createdGroupIds = currentGroupIds.filter((id) => id.length > 0 && !previousGroups.has(id));
  expect(createdGroupIds).toHaveLength(1);
  const createdGroupId = createdGroupIds[0]!;
  await expect(leftRow("sig_cycle_request")).toHaveAttribute("data-group-id", createdGroupId);
  await expect(leftRow("sig_cycle_ready")).toHaveAttribute("data-group-id", createdGroupId);

  await page.getByRole("button", { name: "More tree actions" }).click();
  await page.getByTestId(`move-selected-to-group-${clockGroupId}`).click();
  await expect(page.getByTestId("history-status")).toHaveText("History 2 / Redo 0");
  await expect(leftRow("sig_cycle_request")).toHaveAttribute("data-group-id", clockGroupId!);
  await expect(leftRow("sig_cycle_ready")).toHaveAttribute("data-group-id", clockGroupId!);

  await page.getByTestId("ribbon").getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 1");
  await expect(leftRow("sig_cycle_request")).toHaveAttribute("data-group-id", createdGroupId);
  await expect(leftRow("sig_cycle_ready")).toHaveAttribute("data-group-id", createdGroupId);
  await page.getByTestId("ribbon").getByRole("button", { name: "Redo", exact: true }).click();
  await expect(page.getByTestId("history-status")).toHaveText("History 2 / Redo 0");
  await expect(leftRow("sig_cycle_request")).toHaveAttribute("data-group-id", clockGroupId!);
  await expect(leftRow("sig_cycle_ready")).toHaveAttribute("data-group-id", clockGroupId!);
});
