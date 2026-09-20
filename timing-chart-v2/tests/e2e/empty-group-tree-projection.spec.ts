import { expect, test } from "@playwright/test";
import { startInCycleMode } from "./cycle-startup.js";
import { readFile } from "node:fs/promises";

startInCycleMode(test);

async function ready(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
}

async function revealTreeBottom(page: import("@playwright/test").Page): Promise<void> {
  await page.getByTestId("cycle-viewport").evaluate((element) => {
    element.scrollTop = element.scrollHeight;
    element.dispatchEvent(new Event("scroll"));
  });
  await page.waitForTimeout(100);
}

async function mountedTreeGroupIds(page: import("@playwright/test").Page): Promise<string[]> {
  return page.locator("[data-role='left-group-header'][data-group-id]").evaluateAll((headers) => headers.map((header) => (header as HTMLElement).dataset.groupId).filter((id): id is string => Boolean(id)));
}

async function allTreeGroupIds(page: import("@playwright/test").Page): Promise<string[]> {
  const viewport = page.getByTestId("cycle-viewport");
  await viewport.evaluate((element) => { element.scrollTop = 0; element.dispatchEvent(new Event("scroll")); });
  await page.waitForTimeout(100);
  const top = await mountedTreeGroupIds(page);
  await revealTreeBottom(page);
  const bottom = await mountedTreeGroupIds(page);
  return [...new Set([...top, ...bottom])];
}

// Bottom Panel Visual Reference pass (#402/#426): the old always-visible
// "Drop into group" Bottom button row this file used as its independent
// "Bottom side" cross-check is removed (the Issue's own "固定Group button
// 列は禁止"). The Signal editor's Group dropdown replaces it here -- same
// guarantee (it re-derives its candidate list from the live document's
// signalGroups every render, including empty groups), but it only exists
// once a Signal is selected, so every check below selects one stable
// reference Signal (CLOCK) first.
async function selectReferenceSignal(page: import("@playwright/test").Page): Promise<void> {
  await page.locator("[data-role='frozen-row'][data-row-id='sig_cycle_clock']").click();
  // The Group dropdown is part of the Signal editor's own render -- wait
  // for it to actually mount with real options before any caller counts
  // them, so a read racing the just-issued click's re-render can't
  // observe a still-empty dropdown as if it were a real baseline of 0.
  await expect(page.getByTestId("signal-editor").getByLabel("Signal group", { exact: true }).locator("option").first()).toBeAttached();
}

function bottomGroupOptions(page: import("@playwright/test").Page) {
  return page.getByTestId("signal-editor").getByLabel("Signal group", { exact: true }).locator("option");
}

async function bottomGroupIds(page: import("@playwright/test").Page): Promise<string[]> {
  return bottomGroupOptions(page).evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value));
}

test("keeps an empty group consistent across Left Tree, Bottom Group dropdown, Undo/Redo, and Save/Open", async ({ page }) => {
  await ready(page);
  const host = page.getByTestId("cycle-surface");
  const surface = host.locator("[data-role='timing-chart-surface']");
  await selectReferenceSignal(page);
  const initialGroupCount = await bottomGroupOptions(page).count();
  expect(initialGroupCount).toBeGreaterThan(0);
  const initialGroupIds = await bottomGroupIds(page);
  expect((await allTreeGroupIds(page)).sort()).toEqual([...initialGroupIds].sort());

  await page.getByRole("button", { name: "Add signal or group" }).click();
  await page.getByTestId("create-group").click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  // Creating a Group moves selection onto the new Group itself (Inspector
  // now shows it), so the Bottom Signal tab's own "Select a signal to
  // edit" empty state briefly replaces the dropdown -- reselect the
  // reference Signal to read it again.
  await selectReferenceSignal(page);
  await expect(bottomGroupOptions(page)).toHaveCount(initialGroupCount + 1);
  const groupId = (await bottomGroupIds(page)).find((id) => !initialGroupIds.includes(id));
  expect(groupId).toBeTruthy();
  await revealTreeBottom(page);
  expect(await allTreeGroupIds(page)).toContain(groupId);
  await expect(surface.locator(`[data-role='left-group-header'][data-group-id='${groupId}']`)).toHaveCount(1);
  // Reselecting the reference Signal above (to read the dropdown) moved
  // selection off the just-created Group -- reselect it so the Inspector
  // assertions/edits below target the right entity again.
  await surface.locator(`[data-role='left-group-header'][data-group-id='${groupId}']`).click();
  await expect(page.getByTestId("inspector").getByLabel("Inspector group name")).toHaveValue("Group 4");

  const groupName = page.getByTestId("inspector").getByLabel("Inspector group name");
  await groupName.fill("Empty Review Group");
  await groupName.press("Enter");
  await page.getByTestId("inspector").getByTestId("apply-group-properties").click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(surface.locator(`[data-role='left-group-header'][data-group-id='${groupId}']`)).toContainText("Empty Review Group");
  await selectReferenceSignal(page);
  await expect(bottomGroupOptions(page).filter({ hasText: "Empty Review Group" })).toHaveCount(1);

  const downloadPromise = page.waitForEvent("download");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Save", exact: true }).click();
  const saved = await downloadPromise;
  const savedPath = await saved.path();
  expect(savedPath).toBeTruthy();
  const savedDocument = JSON.parse(await readFile(savedPath!, "utf8")) as { signalGroups: Array<{ id: string; name: string; rows: string[] }> };
  const savedGroup = savedDocument.signalGroups.find((group) => group.id === groupId);
  expect(savedGroup).toMatchObject({ id: groupId, name: "Empty Review Group", rows: [] });

  // Reselecting the reference Signal above (to read the dropdown) moved
  // selection off the Group again -- reselect it so Delete below targets
  // the Group, not the Signal.
  await surface.locator(`[data-role='left-group-header'][data-group-id='${groupId}']`).click();
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Home", exact: true }).click();
  await page.getByTestId("ribbon").locator(".home-edit-group").getByRole("button", { name: "Delete", exact: true }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await selectReferenceSignal(page);
  await expect(bottomGroupOptions(page)).toHaveCount(initialGroupCount);
  expect((await allTreeGroupIds(page)).sort()).toEqual([...initialGroupIds].sort());

  await page.getByTestId("ribbon").locator(".home-edit-group").getByRole("button", { name: "Undo", exact: true }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  expect(await allTreeGroupIds(page)).toContain(groupId);
  await selectReferenceSignal(page);
  await expect(bottomGroupOptions(page).filter({ hasText: "Empty Review Group" })).toHaveCount(1);
  await page.getByTestId("ribbon").locator(".home-edit-group").getByRole("button", { name: "Redo", exact: true }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await selectReferenceSignal(page);
  await expect(bottomGroupOptions(page)).toHaveCount(initialGroupCount);
  expect((await allTreeGroupIds(page)).sort()).toEqual([...initialGroupIds].sort());

  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({
    name: "empty-group-roundtrip.tcd.json",
    mimeType: "application/json",
    buffer: await readFile(savedPath!),
  });
  await page.getByTestId("unsaved-discard").click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await selectReferenceSignal(page);
  await expect(bottomGroupOptions(page)).toHaveCount(initialGroupCount + 1);
  expect(await allTreeGroupIds(page)).toContain(groupId);
  await expect(surface.locator(`[data-role='left-group-header'][data-group-id='${groupId}']`)).toContainText("Empty Review Group");
  await expect(bottomGroupOptions(page).filter({ hasText: "Empty Review Group" })).toHaveCount(1);
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
});

test("creates three distinct empty groups without omissions or duplicates", async ({ page }) => {
  await ready(page);
  await selectReferenceSignal(page);
  const initialGroupCount = await bottomGroupOptions(page).count();
  for (let index = 0; index < 3; index += 1) {
    await page.getByRole("button", { name: "Add signal or group" }).click();
    await page.getByTestId("create-group").click();
    await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true");
  }
  await selectReferenceSignal(page);
  await expect(bottomGroupOptions(page)).toHaveCount(initialGroupCount + 3);
  const ids = await allTreeGroupIds(page);
  expect(ids).toHaveLength(initialGroupCount + 3);
  expect(new Set(ids).size).toBe(initialGroupCount + 3);
  const targetIds = await bottomGroupIds(page);
  expect(targetIds.sort()).toEqual([...ids].sort());
});

test("renders the first signal inserted into an initially empty group", async ({ page }) => {
  await ready(page);
  const host = page.getByTestId("cycle-surface");
  const surface = host.locator("[data-role='timing-chart-surface']");
  await page.getByLabel("Ribbon tabs").getByRole("button", { name: "Insert", exact: true }).click();
  await page.getByTestId("insert-ribbon").getByRole("button", { name: "Event", exact: true }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await revealTreeBottom(page);

  const created = surface.locator("[data-role='left-row'][data-group-id='grp_cycle_scratch']").last();
  const createdId = await created.getAttribute("data-row-id");
  expect(createdId).toBeTruthy();
  await expect(surface.locator(`[data-role='left-row'][data-row-id='${createdId}']`)).toHaveCount(1);
  await expect(surface.locator(`[data-role='frozen-row'][data-row-id='${createdId}']`)).toHaveCount(1);
  await expect(surface.locator(`[data-role='timing-row'][data-row-id='${createdId}']`)).toHaveCount(1);
  await expect(surface.locator(`[data-role='wave-owner'][data-signal-id='${createdId}']`)).toHaveCount(1);
});
