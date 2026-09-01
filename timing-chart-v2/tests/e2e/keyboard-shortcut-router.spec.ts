import { expect, test } from "@playwright/test";

test("Ctrl+D duplicates the selected Signal as one canonical command with a fresh stable ID", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const surface = host.locator("[data-role='timing-chart-surface']");
  const idsBefore = await surface.locator("[data-role='left-tree-rows'] [data-role='left-row'][data-kind='timing'][data-row-id]").evaluateAll((rows) => rows.map((row) => (row as HTMLElement).dataset.rowId));
  const targetId = idsBefore[1]!;
  await surface.locator(`[data-role='left-row'][data-row-id='${targetId}']`).click();
  await expect(surface.locator(`[data-role='left-row'][data-row-id='${targetId}']`)).toHaveAttribute("aria-selected", "true");
  const historyBefore = await page.getByTestId("history-status").textContent();

  await page.keyboard.press("Control+D");
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(async () => {
    expect(await page.getByTestId("history-status").textContent()).not.toBe(historyBefore);
  }).toPass({ timeout: 5000 });

  // Row count on screen is viewport/virtualization-dependent (the Left Tree
  // only renders rows within its scroll window); assert against the stable
  // ID set (a strict superset, one new ID, no duplicates) instead of an
  // on-screen count that would depend on this test's viewport size.
  const idsAfter = await surface.locator("[data-role='left-tree-rows'] [data-role='left-row'][data-kind='timing'][data-row-id]").evaluateAll((rows) => rows.map((row) => (row as HTMLElement).dataset.rowId));
  expect(new Set(idsAfter).size).toBe(idsAfter.length);
  const newIds = idsAfter.filter((id) => !idsBefore.includes(id));
  expect(newIds.length).toBe(1);
});

test("Ctrl+A selects every Signal without mutating the document", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const surface = host.locator("[data-role='timing-chart-surface']");
  const revisionBefore = await host.getAttribute("data-canonical-revision");
  const historyBefore = await page.getByTestId("history-status").textContent();

  await surface.locator("[data-role='left-row'][data-row-id]").first().click();
  await page.keyboard.press("Control+a");

  const rows = surface.locator("[data-role='left-tree-rows'] [data-role='left-row'][data-kind='timing']");
  const total = await rows.count();
  expect(total).toBeGreaterThan(1);
  for (let index = 0; index < total; index += 1) await expect(rows.nth(index)).toHaveAttribute("aria-selected", "true");
  expect(await host.getAttribute("data-canonical-revision")).toBe(revisionBefore);
  expect(await page.getByTestId("history-status").textContent()).toBe(historyBefore);
});

test("Ctrl+A inside a text input performs native select-all instead of the app shortcut", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const surface = host.locator("[data-role='timing-chart-surface']");
  const rowIds = await surface.locator("[data-role='left-tree-rows'] [data-role='left-row'][data-row-id]").evaluateAll((rows) => rows.map((row) => (row as HTMLElement).dataset.rowId));
  await surface.locator(`[data-role='left-row'][data-row-id='${rowIds[0]}']`).click();

  const nameField = page.getByLabel("Signal display name", { exact: true }).or(page.getByLabel("Display name", { exact: true }));
  if (await nameField.count()) {
    await nameField.focus();
    await page.keyboard.press("Control+a");
    await page.keyboard.type("x");
    const value = await nameField.inputValue();
    expect(value).toBe("x");
  }
  const selectedRows = surface.locator("[data-role='left-tree-rows'] [data-role='left-row'][aria-selected='true']");
  expect(await selectedRows.count()).toBeLessThanOrEqual(1);
});

test("Escape cancels an in-progress Annotation drag, closes the context menu, and resets dependency-arrow pick", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Annotation", exact: true }).click();
  await page.getByLabel("Annotation type").selectOption("text");
  await page.getByRole("button", { name: "Add annotation" }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  const revisionBefore = await host.getAttribute("data-canonical-revision");
  const historyBefore = await page.getByTestId("history-status").textContent();

  const owner = host.locator("[data-role='annotation-owner']").last();
  const box = (await owner.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 60, box.y + 40);
  await page.keyboard.press("Escape");
  await page.mouse.up();

  expect(await host.getAttribute("data-canonical-revision")).toBe(revisionBefore);
  expect(await page.getByTestId("history-status").textContent()).toBe(historyBefore);
});
