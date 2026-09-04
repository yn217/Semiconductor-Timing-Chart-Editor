import { expect, test } from "@playwright/test";

for (const viewport of [{ width: 1672, height: 941 }, { width: 1280, height: 720 }]) {
  test(`keeps Insert and Timeline groups usable at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
    const tabs = page.locator(".ribbon-tabs");
    const ribbon = page.getByTestId("ribbon");
    await tabs.getByRole("button", { name: "Home", exact: true }).click();
    const homeBefore = await ribbon.evaluate((root) => ({
      groups: [...root.querySelectorAll<HTMLElement>("[data-major-group]")].map((group) => ({
        name: group.dataset.majorGroup,
        rect: [group.offsetLeft, group.offsetTop, group.offsetWidth, group.offsetHeight],
      })),
    }));

    await tabs.getByRole("button", { name: "Insert", exact: true }).click();
    const insert = page.getByTestId("insert-ribbon");
    await expect(insert.locator("[data-major-group]").first()).toHaveAttribute("data-major-group", "Signals");
    await expect(insert.locator("[data-major-group]")).toHaveCount(4);
    await expect(insert.getByRole("button", { name: "Signal", exact: true })).toBeVisible();
    await expect(insert.getByRole("button", { name: "Clock", exact: true })).toBeVisible();
    await expect(insert.getByRole("button", { name: "Bus", exact: true })).toBeVisible();
    await expect(insert.getByRole("button", { name: "State", exact: true })).toBeVisible();
    await expect(insert.getByRole("button", { name: "Spacer", exact: true })).toBeVisible();
    await expect(insert.getByRole("button", { name: "Measurement", exact: true })).toBeVisible();

    const insertGeometry = await insert.evaluate((root) => {
      const box = root.getBoundingClientRect();
      const groups = [...root.querySelectorAll<HTMLElement>("[data-major-group]")].map((element) => element.getBoundingClientRect());
      const buttons = [...root.querySelectorAll<HTMLButtonElement>("button")];
      const overlaps = (a: DOMRect, b: DOMRect) => a.left < b.right - 0.5 && a.right > b.left + 0.5 && a.top < b.bottom - 0.5 && a.bottom > b.top + 0.5;
      const buttonBoxes = buttons.map((button) => ({ button, box: button.getBoundingClientRect() }));
      const pairOverlap = buttonBoxes.some(({ box }, index) => buttonBoxes.slice(index + 1).some((other) => overlaps(box, other.box)));
      return { overflow: root.scrollWidth > root.clientWidth, groupsInside: groups.every((group) => group.left >= box.left - 1 && group.right <= box.right + 1), pairOverlap };
    });
    expect(insertGeometry).toEqual({ overflow: false, groupsInside: true, pairOverlap: false });
    const revisionBefore = await page.getByTestId("revision-status").textContent();
    await insert.getByRole("button", { name: "Signal", exact: true }).click();
    await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true");
    await expect(page.getByTestId("revision-status")).not.toHaveText(revisionBefore!);
    await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");

    await tabs.getByRole("button", { name: "Timeline", exact: true }).click();
    const timeline = page.getByTestId("timeline-editor");
    await expect(timeline.locator("[data-timeline-group='Range']")).toBeVisible();
    await expect(timeline.locator("[data-timeline-group='Insert']")).toBeVisible();
    await expect(timeline.locator("[data-timeline-group='Range Edit']")).toBeVisible();
    await expect(timeline.locator("[data-timeline-group='Bookmark']")).toBeVisible();
    await expect(timeline.locator("[data-timeline-group='Fold / Break']")).toBeVisible();
    await expect(timeline.getByLabel("Timeline range start")).toBeVisible();
    await expect(timeline.getByLabel("Timeline insert count")).toBeVisible();
    await expect(timeline.getByLabel("Timeline destination")).toBeVisible();
    await expect(timeline.getByTestId("timeline-selected-length")).toHaveText("Length 2");
    await expect(timeline.getByLabel("Range edit from")).toHaveText("2");
    await expect(timeline.getByRole("button", { name: "Axis Break", exact: true })).toBeVisible();
    await expect(timeline.getByRole("button", { name: "Previous bookmark", exact: true })).toBeVisible();
    await expect(timeline.getByRole("button", { name: "Next bookmark", exact: true })).toBeVisible();
    await expect(timeline.getByRole("button", { name: "List bookmarks", exact: true })).toBeVisible();
    const timelineGeometry = await timeline.evaluate((root) => {
      const box = root.getBoundingClientRect();
      const groups = [...root.querySelectorAll<HTMLElement>("[data-timeline-group]")].map((element) => element.getBoundingClientRect());
      return { overflow: root.scrollWidth > root.clientWidth, groupsInside: groups.every((group) => group.left >= box.left - 1 && group.right <= box.right + 1) };
    });
    expect(timelineGeometry).toEqual({ overflow: false, groupsInside: true });

    const cycleCountBeforeTimelineInsert = Number(await page.locator(".editor-shell").getAttribute("data-cycle-count"));
    await timeline.getByRole("button", { name: "Insert before", exact: true }).click();
    await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true");
    await expect(page.locator(".editor-shell")).toHaveAttribute("data-cycle-count", String(cycleCountBeforeTimelineInsert + 1));
    await expect(page.getByTestId("history-status")).toHaveText("History 2 / Redo 0");

    await tabs.getByRole("button", { name: "Home", exact: true }).click();
    await expect(ribbon).toHaveAttribute("aria-label", "Home Ribbon");
    expect(await ribbon.evaluate((root) => ({
      groups: [...root.querySelectorAll<HTMLElement>("[data-major-group]")].map((group) => ({
        name: group.dataset.majorGroup,
        rect: [group.offsetLeft, group.offsetTop, group.offsetWidth, group.offsetHeight],
      })),
    }))).toEqual(homeBefore);
  });
}

test("Tree Add and Insert Ribbon share the selected row and group insertion target", async ({ page }) => {
  await page.goto("/?visual-reference");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const payloadRows = host.locator("[data-role='left-row'][data-group-id='grp_cycle_payload']");
  const ready = host.locator("[data-role='left-row'][data-row-id='sig_cycle_ready']");
  await ready.click();
  const beforeRowIds = await payloadRows.evaluateAll((rows) => rows.map((row) => (row as HTMLElement).dataset.rowId));

  await page.getByRole("button", { name: "Add signal or group", exact: true }).click();
  await page.getByRole("menu", { name: "Add signal or group" }).getByRole("menuitem", { name: "Signal", exact: true }).click();
  await expect.poll(async () => payloadRows.count()).toBe(beforeRowIds.length + 1);
  const afterTreeIds = await payloadRows.evaluateAll((rows) => rows.map((row) => (row as HTMLElement).dataset.rowId));
  const treeInserted = afterTreeIds.find((id) => id !== undefined && !beforeRowIds.includes(id));
  expect(treeInserted).toBeDefined();
  expect(afterTreeIds[afterTreeIds.indexOf("sig_cycle_ready") + 1]).toBe(treeInserted);
  await page.getByLabel("Ribbon tabs").getByRole("button", { name: "Home", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Undo", exact: true }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect.poll(async () => payloadRows.count()).toBe(beforeRowIds.length);
  expect(await payloadRows.evaluateAll((rows) => rows.map((row) => (row as HTMLElement).dataset.rowId))).toEqual(beforeRowIds);

  await ready.click();
  await page.getByLabel("Ribbon tabs").getByRole("button", { name: "Insert", exact: true }).click();
  await page.getByTestId("insert-ribbon").getByRole("button", { name: "Signal", exact: true }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect.poll(async () => payloadRows.count()).toBe(beforeRowIds.length + 1);
  const afterRibbonIds = await payloadRows.evaluateAll((rows) => rows.map((row) => (row as HTMLElement).dataset.rowId));
  const ribbonInserted = afterRibbonIds.find((id) => id !== undefined && !beforeRowIds.includes(id));
  expect(ribbonInserted).toBeDefined();
  expect(afterRibbonIds[afterRibbonIds.indexOf("sig_cycle_ready") + 1]).toBe(ribbonInserted);
  await page.getByLabel("Ribbon tabs").getByRole("button", { name: "Home", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Undo", exact: true }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect.poll(async () => payloadRows.count()).toBe(beforeRowIds.length);

  const group = host.locator("[data-role='left-group-header'][data-group-name='Input'] [data-role='tree-branch']");
  await group.click();
  const internalRows = host.locator("[data-role='left-row'][data-group-id='grp_cycle_control']");
  const beforeGroupCount = await internalRows.count();
  await page.getByLabel("Ribbon tabs").getByRole("button", { name: "Insert", exact: true }).click();
  await page.getByTestId("insert-ribbon").getByRole("button", { name: "Signal", exact: true }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect.poll(async () => internalRows.count()).toBe(beforeGroupCount + 1);
  await page.getByLabel("Ribbon tabs").getByRole("button", { name: "Home", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Undo", exact: true }).click();
  await expect.poll(async () => internalRows.count()).toBe(beforeGroupCount);
});
