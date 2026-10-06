import { expect, test } from "@playwright/test";
import { generatePerformanceDocument } from "@timing-chart-v2/testing";
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

test("Signal Tree organizes a 10-Signal selection as one undoable operation", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");

  const base = generatePerformanceDocument({ signalCount: 16, cycleCount: 24, profile: "standard" });
  const ids = base.signals.slice(0, 10).map((signal) => signal.id);
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "issue-431-ten-signal-group.tcd.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(base)) });
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  const rows = ids.map((id) => host.locator(`[data-role='frozen-row'][data-row-id='${id}']`));
  for (let index = 0; index < 5; index += 1) await rows[index]!.click(index === 0 ? undefined : { modifiers: ["Control"] });
  const viewport = page.getByTestId("cycle-viewport");
  const viewportBox = await viewport.boundingBox();
  expect(viewportBox).not.toBeNull();
  await page.mouse.move(viewportBox!.x + 80, viewportBox!.y + viewportBox!.height / 2);
  await page.mouse.wheel(0, 180);
  await expect.poll(() => viewport.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  for (let index = 5; index < rows.length; index += 1) {
    await expect(rows[index]!).toBeInViewport();
    await rows[index]!.click({ modifiers: ["Control"] });
  }
  await expect(page.getByTestId("selection-status")).toHaveText("10 signals");
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");

  const existingGroups = new Set(await host.locator("[data-role='left-group-header'][data-group-id]").evaluateAll((items) => items.map((item) => (item as HTMLElement).dataset.groupId ?? "")));
  await page.getByRole("button", { name: "More tree actions" }).click();
  await page.getByTestId("create-group-from-selection").click();
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await expect.poll(async () => {
    const idsNow = await host.locator("[data-role='left-group-header'][data-group-id]").evaluateAll((items) => items.map((item) => (item as HTMLElement).dataset.groupId ?? ""));
    return idsNow.some((id) => id.length > 0 && !existingGroups.has(id));
  }).toBe(true);
  const groupIds = await host.locator("[data-role='left-group-header'][data-group-id]").evaluateAll((items) => items.map((item) => (item as HTMLElement).dataset.groupId ?? ""));
  const newGroupId = groupIds.find((id) => id.length > 0 && !existingGroups.has(id));
  expect(newGroupId).toBeTruthy();
  for (const id of ids) await expect(host.locator(`[data-role='left-row'][data-row-id='${id}']`)).toHaveAttribute("data-group-id", newGroupId!);

  await page.getByTestId("ribbon").getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 1");
  for (const id of ids) await expect(host.locator(`[data-role='left-row'][data-row-id='${id}']`)).not.toHaveAttribute("data-group-id", newGroupId!);
  await page.getByTestId("ribbon").getByRole("button", { name: "Redo", exact: true }).click();
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  for (const id of ids) await expect(host.locator(`[data-role='left-row'][data-row-id='${id}']`)).toHaveAttribute("data-group-id", newGroupId!);
});
