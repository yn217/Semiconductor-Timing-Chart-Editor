import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

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

test("keeps an empty group consistent across Left Tree, Bottom targets, Undo/Redo, and Save/Open", async ({ page }) => {
  await ready(page);
  const host = page.getByTestId("cycle-surface");
  const surface = host.locator("[data-role='timing-chart-surface']");
  const leftGroups = surface.locator("[data-role='left-group-header'][data-group-id]");
  const bottomGroups = page.locator("[data-group-target]");
  const initialGroupCount = await bottomGroups.count();
  expect(initialGroupCount).toBeGreaterThan(0);
  const initialGroupIds = await bottomGroups.evaluateAll((targets) => targets.map((target) => (target as HTMLElement).dataset.groupTarget).filter((id): id is string => Boolean(id)));
  expect((await allTreeGroupIds(page)).sort()).toEqual([...initialGroupIds].sort());

  await page.getByTestId("create-group").click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(bottomGroups).toHaveCount(initialGroupCount + 1);
  const groupId = await bottomGroups.last().getAttribute("data-group-target");
  expect(groupId).toBeTruthy();
  await revealTreeBottom(page);
  expect(await allTreeGroupIds(page)).toContain(groupId);
  await expect(surface.locator(`[data-role='left-group-header'][data-group-id='${groupId}']`)).toHaveCount(1);
  await expect(page.locator(`[data-group-target='${groupId}']`)).toHaveCount(1);
  await expect(page.getByTestId("inspector").getByLabel("Inspector group name")).toHaveValue("Group 4");

  const groupName = page.getByTestId("inspector").getByLabel("Inspector group name");
  await groupName.fill("Empty Review Group");
  await page.getByTestId("inspector").getByTestId("apply-group-properties").click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(surface.locator(`[data-role='left-group-header'][data-group-id='${groupId}']`)).toContainText("Empty Review Group");
  await expect(page.locator(`[data-group-target='${groupId}']`)).toContainText("Empty Review Group");

  const downloadPromise = page.waitForEvent("download");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Save", exact: true }).click();
  const saved = await downloadPromise;
  const savedPath = await saved.path();
  expect(savedPath).toBeTruthy();
  const savedDocument = JSON.parse(await readFile(savedPath!, "utf8")) as { signalGroups: Array<{ id: string; name: string; rows: string[] }> };
  const savedGroup = savedDocument.signalGroups.find((group) => group.id === groupId);
  expect(savedGroup).toMatchObject({ id: groupId, name: "Empty Review Group", rows: [] });

  await page.locator(".ribbon-tabs").getByRole("button", { name: "Home", exact: true }).click();
  await page.getByTestId("ribbon").locator(".home-edit-group").getByRole("button", { name: "Delete", exact: true }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(bottomGroups).toHaveCount(initialGroupCount);
  expect((await allTreeGroupIds(page)).sort()).toEqual([...initialGroupIds].sort());

  await page.getByTestId("ribbon").locator(".home-edit-group").getByRole("button", { name: "Undo", exact: true }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  expect(await allTreeGroupIds(page)).toContain(groupId);
  await expect(page.locator(`[data-group-target='${groupId}']`)).toContainText("Empty Review Group");
  await page.getByTestId("ribbon").locator(".home-edit-group").getByRole("button", { name: "Redo", exact: true }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(bottomGroups).toHaveCount(initialGroupCount);
  expect((await allTreeGroupIds(page)).sort()).toEqual([...initialGroupIds].sort());

  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({
    name: "empty-group-roundtrip.tcd.json",
    mimeType: "application/json",
    buffer: await readFile(savedPath!),
  });
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(bottomGroups).toHaveCount(initialGroupCount + 1);
  expect(await allTreeGroupIds(page)).toContain(groupId);
  await expect(surface.locator(`[data-role='left-group-header'][data-group-id='${groupId}']`)).toContainText("Empty Review Group");
  await expect(page.locator(`[data-group-target='${groupId}']`)).toContainText("Empty Review Group");
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
});

test("creates three distinct empty groups without omissions or duplicates", async ({ page }) => {
  await ready(page);
  const host = page.getByTestId("cycle-surface");
  const surface = host.locator("[data-role='timing-chart-surface']");
  const leftGroups = surface.locator("[data-role='left-group-header'][data-group-id]");
  const bottomGroups = page.locator("[data-group-target]");
  const initialGroupCount = await bottomGroups.count();
  for (let index = 0; index < 3; index += 1) {
    await page.getByTestId("create-group").click();
    await expect(host).toHaveAttribute("data-editor-idle", "true");
  }
  await expect(bottomGroups).toHaveCount(initialGroupCount + 3);
  const ids = await allTreeGroupIds(page);
  expect(ids).toHaveLength(initialGroupCount + 3);
  expect(new Set(ids).size).toBe(initialGroupCount + 3);
  const targetIds = await bottomGroups.evaluateAll((targets) => targets.map((target) => (target as HTMLElement).dataset.groupTarget));
  expect(targetIds.sort()).toEqual([...ids].sort());
});
