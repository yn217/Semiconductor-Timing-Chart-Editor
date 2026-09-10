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
    // "From" was a read-only duplicate of Range's own "Start cycle" value --
    // removed rather than shown twice under two different names.
    await expect(timeline.getByRole("button", { name: "Axis Break", exact: true })).toBeVisible();
    await expect(timeline.getByRole("button", { name: "Previous bookmark", exact: true })).toBeVisible();
    await expect(timeline.getByRole("button", { name: "Next bookmark", exact: true })).toBeVisible();
    await expect(timeline.getByRole("button", { name: "Open Bookmarks panel", exact: true })).toBeVisible();
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

test("Timeline exposes shared N-cycle and Time Group presentation commands", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Timeline", exact: true }).click();
  const timeline = page.getByTestId("timeline-editor");

  await expect(timeline.getByRole("button", { name: "Add one cycle", exact: true })).toBeVisible();
  await expect(timeline.getByRole("button", { name: "Add N cycles", exact: true })).toBeVisible();
  await expect(timeline.getByRole("button", { name: "Create Time Group", exact: true })).toBeVisible();
  await expect(timeline.locator('[data-timeline-group="Outline"]')).toHaveAttribute("aria-label", "Outline commands");
  await expect(timeline.getByRole("button", { name: "Axis Break", exact: true })).toBeVisible();
  await expect(timeline.getByRole("button", { name: "Expand All", exact: true })).toBeDisabled();

  await timeline.getByTestId("time-group-create").click();
  await expect(timeline.getByRole("button", { name: "Collapse Group 2-4", exact: true })).toBeVisible();
  await timeline.getByRole("button", { name: "Collapse Group 2-4", exact: true }).click();
  await expect(timeline.getByRole("button", { name: "Expand Group 2-4", exact: true })).toBeVisible();
  await expect(timeline.getByRole("button", { name: "Expand All", exact: true })).toBeEnabled();
  await timeline.getByRole("button", { name: "Expand All", exact: true }).click();
  await expect(timeline.getByRole("button", { name: "Collapse Group 2-4", exact: true })).toBeVisible();
  await expect(timeline.getByRole("button", { name: "Expand All", exact: true })).toBeDisabled();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
});

test("Time Group outline rows expose mapped spans and shared collapse controls above the ruler", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Timeline", exact: true }).click();
  const timeline = page.getByTestId("timeline-editor");
  await timeline.getByTestId("time-group-create").click();
  const ruler = page.getByTestId("cycle-ruler");
  const outline = ruler.locator(".time-outline-row");
  await expect(outline).toHaveCount(1);
  await expect(outline.getByRole("button", { name: "Show outline level 1", exact: true })).toBeVisible();
  const item = outline.locator("[data-outline-time-group-id]");
  await expect(item).toHaveCount(1);
  await expect(item.getByRole("button", { name: "Collapse Group 2-4", exact: true })).toBeVisible();
  await item.getByRole("button", { name: "Collapse Group 2-4", exact: true }).click();
  await expect(timeline.getByRole("button", { name: "Expand Group 2-4", exact: true })).toBeVisible();
  await expect(ruler.locator("[data-outline-time-group-id]").getByRole("button", { name: "Expand Group 2-4", exact: true })).toBeVisible();
});

test("Time Group outline exposes Ungroup through the semantic timeline command", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Timeline", exact: true }).click();
  await page.getByLabel("Timeline range start").fill("2");
  await page.getByLabel("Timeline range end").fill("5");
  await page.getByRole("button", { name: "Create Time Group", exact: true }).click();
  const group = page.getByTestId(/time-group-edit-/).last();
  await expect(group).toBeVisible();
  const groupId = await group.getAttribute("data-testid");
  const id = groupId?.replace("time-group-edit-", "");
  await expect(page.getByTestId(`time-group-ungroup-${id}`)).toBeVisible();
  await page.getByTestId(`time-group-ungroup-${id}`).click();
  await expect(page.locator("[data-time-group-id]")).toHaveCount(0);
  await expect(page.getByTestId("history-status")).toContainText("History");
});

test("Timeline workflow groups keep explicit cycle semantics and aligned controls", async ({ page }) => {
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto("/");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Timeline", exact: true }).click();
  const timeline = page.getByTestId("timeline-editor");
  const groups = timeline.locator("[data-timeline-group]");
  await expect(groups).toHaveCount(7);
  await expect(timeline.locator("[data-timeline-group='Range']")).toContainText("Start cycle");
  await expect(timeline.locator("[data-timeline-group='Range']")).toContainText("End cycle");
  await expect(timeline.getByTestId("timeline-selected-length")).toHaveText("Length 2");
  await expect(timeline.locator("[data-timeline-group='Insert']")).toContainText("Count");
  for (const label of ["Undo", "Redo", "Insert before", "Insert after", "Delete range", "Duplicate to", "Move to", "Previous bookmark", "Next bookmark", "Open Bookmarks panel", "Axis Break"]) {
    await expect(timeline.getByRole("button", { name: label, exact: true })).toBeVisible();
  }
  const metrics = await timeline.evaluate((root) => {
    const rootBox = root.getBoundingClientRect();
    const groupBoxes = [...root.querySelectorAll<HTMLElement>("[data-timeline-group]")].map((group) => {
      const box = group.getBoundingClientRect();
      const children = [...group.querySelectorAll<HTMLElement>("input, output, button, label")].filter((item) => getComputedStyle(item).display !== "none");
      return { top: box.top, bottom: box.bottom, overflow: children.some((child) => { const childBox = child.getBoundingClientRect(); return childBox.left < box.left - 1 || childBox.right > box.right + 1 || childBox.top < box.top - 1 || childBox.bottom > box.bottom + 1; }) };
    });
    return { root: { top: rootBox.top, bottom: rootBox.bottom }, groups: groupBoxes };
  });
  expect(metrics.groups.every((group) => !group.overflow), JSON.stringify(metrics)).toBe(true);
  expect(new Set(metrics.groups.map((group) => group.top)).size).toBe(1);
  expect(new Set(metrics.groups.map((group) => group.bottom)).size).toBe(1);
});

// Timeline Ribbon group-boundary visual clarity: a shared vertical separator
// must appear between every pair of adjacent Timeline groups (never after the
// last group), with 12-16px group spacing around it, never overlapping any
// button/input/select/output/label/span in either neighboring group, and
// every group's footer caption baseline must align within 1px across the
// whole Ribbon. Verified at the acceptance viewport (1672x941) and re-checked
// at a narrower/responsive width for the same no-overlap guarantee.
for (const viewport of [{ width: 1672, height: 941 }, { width: 1280, height: 720 }]) {
  test(`Timeline group boundaries show a non-overlapping separator with aligned captions at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await page.locator(".ribbon-tabs").getByRole("button", { name: "Timeline", exact: true }).click();
    const timeline = page.getByTestId("timeline-editor");
    const groups = timeline.locator("[data-timeline-group]");
    await expect(groups).toHaveCount(7);

    const report = await timeline.evaluate((root) => {
      const slots = [...root.querySelectorAll<HTMLElement>(".timeline-slot-group")];
      const overlaps = (a: DOMRect, b: DOMRect) => a.left < b.right - 0.5 && a.right > b.left + 0.5 && a.top < b.bottom - 0.5 && a.bottom > b.top + 0.5;
      const captionBottoms: number[] = [];
      const gaps: number[] = [];
      const separatorOverlaps: boolean[] = [];
      const separatorPresent: boolean[] = [];
      for (let index = 0; index < slots.length; index += 1) {
        const slot = slots[index];
        const caption = slot.querySelector<HTMLElement>(".ds-ribbon-group > b");
        if (caption) captionBottoms.push(caption.getBoundingClientRect().bottom);
        const style = getComputedStyle(slot, "::after");
        const hasSeparator = style.content !== "none" && style.content !== "";
        separatorPresent.push(hasSeparator);
        if (index < slots.length - 1) {
          const box = slot.getBoundingClientRect();
          const nextBox = slots[index + 1].getBoundingClientRect();
          gaps.push(nextBox.left - box.right);
          const interactive = [...slot.querySelectorAll<HTMLElement>("input, output, button, select, label, span")].filter((el) => getComputedStyle(el).display !== "none");
          const nextInteractive = [...slots[index + 1].querySelectorAll<HTMLElement>("input, output, button, select, label, span")].filter((el) => getComputedStyle(el).display !== "none");
          // Separator band: `right:-7px; width:1px` relative to the slot box -- approximate its screen rect directly.
          const sepRect = new DOMRect(box.right + 6.5, box.top, 1.5, box.height);
          const overlapsAny = [...interactive, ...nextInteractive].some((el) => overlaps(sepRect, el.getBoundingClientRect()));
          separatorOverlaps.push(overlapsAny);
        }
      }
      return { captionBottoms, gaps, separatorOverlaps, separatorPresent };
    });

    // Separator present after every group except the last (Fold / Break).
    expect(report.separatorPresent.slice(0, -1).every(Boolean), JSON.stringify(report.separatorPresent)).toBe(true);
    expect(report.separatorPresent[report.separatorPresent.length - 1]).toBe(false);

    // 12-16px group spacing between adjacent groups at the acceptance
    // viewport. Narrower widths fall under the pre-existing `.ribbon { zoom:
    // .8 }` responsive breakpoint (responsive.css), which uniformly shrinks
    // the whole Ribbon including this gap -- the acceptance criterion there
    // is "no separator overlap", not an absolute pixel range, so the gap
    // range is only enforced at the unzoomed 1672px width.
    if (viewport.width === 1672) {
      for (const gap of report.gaps) expect(gap, JSON.stringify(report.gaps)).toBeGreaterThanOrEqual(12);
      for (const gap of report.gaps) expect(gap, JSON.stringify(report.gaps)).toBeLessThanOrEqual(16);
    } else {
      for (const gap of report.gaps) expect(gap, JSON.stringify(report.gaps)).toBeGreaterThan(0);
    }

    // Separator band never overlaps any button/icon/text in either neighbor.
    expect(report.separatorOverlaps.every((overlap) => !overlap), JSON.stringify(report.separatorOverlaps)).toBe(true);

    // Footer caption baselines align within 1px across the whole Ribbon.
    const baselineSpread = Math.max(...report.captionBottoms) - Math.min(...report.captionBottoms);
    expect(baselineSpread, JSON.stringify(report.captionBottoms)).toBeLessThanOrEqual(1);
  });
}

// #262 (GUI/UX closure gate, Interaction/State-feedback axes): creating a new
// row must select it, the same way Group/Spacer already did from the Left
// Tree's own +Add button -- otherwise the newly added row isn't immediately
// reachable for rename/edit without an extra manual click, and the two
// "add a row" entry points (Tree +Add, Ribbon Insert) behave inconsistently
// for the exact same mutation.
test("Left Tree +Add and Ribbon Insert both select the row they just created (#262)", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const status = page.getByTestId("selection-status");
  const ribbon = page.getByTestId("ribbon");
  const tabs = page.locator(".ribbon-tabs");

  // Establish an unrelated prior selection so a false pass (status just
  // happens to already show the right value) is impossible.
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_clock']").click();
  await expect(status).toHaveText("CLOCK");

  // Tree +Add -> Signal.
  await page.getByRole("button", { name: "Add signal or group", exact: true }).click();
  await page.getByRole("menu", { name: "Add signal or group" }).getByRole("menuitem", { name: "Signal", exact: true }).click();
  await expect(status).toHaveText(/^SIGNAL_\d+$/);

  // Ribbon Insert -> Group selects the new Group.
  await tabs.getByRole("button", { name: "Insert", exact: true }).click();
  await ribbon.getByRole("button", { name: "Group", exact: true }).click();
  await expect(status).toHaveText(/^Group \d+$/);
  const groupName = await status.textContent();

  // Ribbon Insert -> Comment selects the new Comment row (inserted into the
  // still-selected, still-empty Group above).
  await ribbon.getByRole("button", { name: "Comment", exact: true }).click();
  await expect(status).toHaveText(/^Comment \d+$/);

  // Ribbon Insert -> Spacer: spacers have no name of their own, so the
  // status bar truthfully falls back to the owning Group's name (the same
  // fallback selecting a Spacer from the Tree already used) -- assert the
  // spacer itself carries the actual selection rather than expecting its
  // own name in the status text.
  await ribbon.getByRole("button", { name: "Spacer", exact: true }).click();
  await expect(status).toHaveText(groupName ?? "");
  await expect(host.locator("[data-role='frozen-row'][data-kind='spacer']").last()).toHaveAttribute("aria-selected", "true");
});
