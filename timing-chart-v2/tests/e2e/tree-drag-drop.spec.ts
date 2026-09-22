import { expect, test, type Locator } from "@playwright/test";
import { startInCycleSample } from "./cycle-startup.js";

startInCycleSample(test);

const leftRowOrder = async (surface: Locator) =>
  surface.locator("[data-role='left-tree-rows'] [data-role='left-row'][data-row-id]")
    .evaluateAll((rows) => rows.map((row) => (row as HTMLElement).dataset.rowId));

test("reorders a Signal within its Group by drag-and-drop, one command per drop, Undo/Redo restore order", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const surface = host.locator("[data-role='timing-chart-surface']");
  const before = await leftRowOrder(surface);
  expect(before.length).toBeGreaterThan(2);
  const historyBefore = await page.getByTestId("history-status").textContent();

  const source = surface.locator(`[data-role='left-row'][data-row-id='${before[0]}']`);
  const target = surface.locator(`[data-role='left-row'][data-row-id='${before[2]}']`);
  await source.dragTo(target, { targetPosition: { x: 100, y: 2 } });
  await expect(host).toHaveAttribute("data-editor-idle", "true");

  const after = await leftRowOrder(surface);
  expect(after).not.toEqual(before);
  expect(after.length).toBe(before.length);
  expect(new Set(after)).toEqual(new Set(before));
  expect(await page.getByTestId("history-status").textContent()).not.toBe(historyBefore);

  await page.getByTestId("ribbon").getByRole("button", { name: "Undo" }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  expect(await leftRowOrder(surface)).toEqual(before);
  expect(await page.getByTestId("history-status").textContent()).toBe(historyBefore!.replace("Redo 0", "Redo 1"));

  await page.getByTestId("ribbon").getByRole("button", { name: "Redo" }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  expect(await leftRowOrder(surface)).toEqual(after);
});

test("an invalid drop (dropping a Signal on itself) commits no command and leaves the document unchanged", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  const surface = host.locator("[data-role='timing-chart-surface']");
  const before = await leftRowOrder(surface);
  const historyBefore = await page.getByTestId("history-status").textContent();
  const revisionBefore = await host.getAttribute("data-canonical-revision");

  const source = surface.locator(`[data-role='left-row'][data-row-id='${before[0]}']`);
  await source.dragTo(source);

  expect(await leftRowOrder(surface)).toEqual(before);
  expect(await page.getByTestId("history-status").textContent()).toBe(historyBefore);
  expect(await host.getAttribute("data-canonical-revision")).toBe(revisionBefore);
});

test("preserves the selected Signal across a drag-and-drop reorder", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const surface = host.locator("[data-role='timing-chart-surface']");
  const before = await leftRowOrder(surface);
  const selectedId = before[1];
  await surface.locator(`[data-role='left-row'][data-row-id='${selectedId}']`).click();
  await expect(surface.locator(`[data-role='left-row'][data-row-id='${selectedId}']`)).toHaveAttribute("aria-selected", "true");

  const source = surface.locator(`[data-role='left-row'][data-row-id='${before[0]}']`);
  const target = surface.locator(`[data-role='left-row'][data-row-id='${before[3]}']`);
  await source.dragTo(target, { targetPosition: { x: 100, y: 2 } });
  await expect(host).toHaveAttribute("data-editor-idle", "true");

  await expect(surface.locator(`[data-role='left-row'][data-row-id='${selectedId}']`)).toHaveAttribute("aria-selected", "true");
});

test("reorders a Spacer within its owning Group by drag-and-drop, one command per drop, Undo restores order", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const surface = host.locator("[data-role='timing-chart-surface']");
  const branch = surface.locator("[data-role='tree-branch'][data-group-id]").first();
  await branch.click();
  await page.getByTestId("add-spacer").click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  const historyBefore = await page.getByTestId("history-status").textContent();

  const before = await leftRowOrder(surface);
  const spacerId = before.find((id) => id?.startsWith("spacer_"));
  expect(spacerId).toBeDefined();
  const spacerIndex = before.indexOf(spacerId!);
  const target = before[spacerIndex === 0 ? spacerIndex + 2 : spacerIndex - 2] ?? before[0];

  const source = surface.locator(`[data-role='left-row'][data-row-id='${spacerId}']`);
  await source.dragTo(surface.locator(`[data-role='left-row'][data-row-id='${target}']`), { targetPosition: { x: 100, y: 2 } });
  await expect(host).toHaveAttribute("data-editor-idle", "true");

  const after = await leftRowOrder(surface);
  expect(after).not.toEqual(before);
  expect(new Set(after)).toEqual(new Set(before));
  expect(await page.getByTestId("history-status").textContent()).not.toBe(historyBefore);

  await page.getByTestId("ribbon").getByRole("button", { name: "Undo" }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  expect(await leftRowOrder(surface)).toEqual(before);
});

test("collapsing a Group does not break a subsequent drag-and-drop reorder among its visible siblings", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const surface = host.locator("[data-role='timing-chart-surface']");
  const branch = surface.locator("[data-role='tree-branch'][data-group-id]").first();
  const groupId = await branch.getAttribute("data-group-id");
  const collapseToggle = branch.locator("[data-role='tree-collapse'], [data-testid='group-collapse-toggle']").first();
  if (await collapseToggle.count()) {
    await collapseToggle.click();
    await expect(surface.locator(`[data-role='left-row'][data-group-id='${groupId}']`)).toHaveCount(0);
    await collapseToggle.click();
  }
  const before = await leftRowOrder(surface);
  expect(before.length).toBeGreaterThan(2);
  const source = surface.locator(`[data-role='left-row'][data-row-id='${before[0]}']`);
  const target = surface.locator(`[data-role='left-row'][data-row-id='${before[2]}']`);
  await source.dragTo(target, { targetPosition: { x: 100, y: 2 } });
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  const after = await leftRowOrder(surface);
  expect(after).not.toEqual(before);
  expect(new Set(after)).toEqual(new Set(before));
});
