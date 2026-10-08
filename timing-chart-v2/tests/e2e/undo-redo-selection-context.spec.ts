import { expect, test } from "@playwright/test";
import { startInCycleSample } from "./cycle-startup.js";
import { cycleDocument } from "../../apps/editor/src/fixtures-cycle-reference-documents.js";

startInCycleSample(test);

test("compatible Bottom row selection and dirty draft survive metadata Undo/Redo", async ({ page }) => {
  await ready(page);
  const host = page.getByTestId("cycle-surface");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  const ribbon = page.getByTestId("ribbon");
  await ribbon.getByRole("button", { name: "More", exact: true }).click();
  await page.getByRole("menu", { name: "More Home Commands" }).getByRole("menuitem", { name: "Rename", exact: true }).click();
  const dialog = page.getByTestId("rename-dialog");
  await dialog.getByRole("textbox").fill("RENAMED_REQUEST");
  await dialog.getByRole("button", { name: "Apply", exact: true }).click();
  const editor = page.getByTestId("signal-editor");
  const row = editor.locator("form.event-row[data-event-start='0']");
  await row.getByLabel("Select transition 1").check();
  await row.getByLabel("Comment 0").fill("Unapplied compatible draft");
  await expect(editor.getByTestId("event-selected-count")).toHaveText("1 row selected");
  await ribbon.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 1");
  await expect(page.getByTestId("dirty-status")).toHaveText("Clean");
  await expect(page.getByTestId("selection-status")).toHaveText("REQUEST");
  await expect(row.getByLabel("Comment 0")).toHaveValue("Unapplied compatible draft");
  await expect(row.getByLabel("Select transition 1")).toBeChecked();
  await expect(editor.getByTestId("event-selected-count")).toHaveText("1 row selected");
  await ribbon.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await expect(page.getByTestId("selection-status")).toHaveText("RENAMED_REQUEST");
  await expect(row.getByLabel("Comment 0")).toHaveValue("Unapplied compatible draft");
  await expect(row.getByLabel("Select transition 1")).toBeChecked();
  await row.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.getByTestId("history-status")).toHaveText("History 2 / Redo 0");
});

test("Hierarchy modal Scope remains stable and owns keyboard history shortcuts", async ({ page }) => {
  await ready(page);
  const host = page.getByTestId("cycle-surface");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  await page.getByTestId("signal-visibility").click();
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await page.getByRole("button", { name: "More tree actions", exact: true }).click();
  await page.getByTestId("hierarchy-open").click();
  const hierarchy = page.getByTestId("hierarchy-browser");
  await hierarchy.getByLabel("Hierarchy scope", { exact: true }).selectOption("dut");
  await hierarchy.getByTestId("hierarchy-path-search").fill("request");
  await hierarchy.getByTestId("hierarchy-path-view").click();
  await page.keyboard.press("Control+z");
  await page.keyboard.press("Control+Shift+z");
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await expect(hierarchy.getByLabel("Hierarchy scope", { exact: true })).toHaveValue("dut");
  await expect(hierarchy.getByTestId("hierarchy-path-search")).toHaveValue("request");
  await expect(hierarchy.getByTestId("hierarchy-path-view")).toHaveAttribute("aria-pressed", "true");
  await hierarchy.getByRole("button", { name: "Close hierarchy", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 1");
  await expect(page.getByTestId("selection-status")).toHaveText("REQUEST");
});


for (const action of ["open", "new"] as const) {
  test(`document ${action} clears range, selection, filters and fixed Bottom context`, async ({ page }) => {
    await ready(page);
    const host = page.getByTestId("cycle-surface");
    await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
    const bottom = page.getByTestId("bottom-editor");
    await bottom.getByTestId("bottom-settings").click();
    await bottom.getByTestId("bottom-pin").click();
    await bottom.getByTestId("follow-selection").uncheck();
    await expect(bottom.getByTestId("bottom-pin")).toHaveAttribute("aria-pressed", "true");
    await page.getByTestId("signal-tree-search-top").fill("REQUEST");
    await page.getByTestId("signal-tree-type-filter").selectOption("input");
    await page.locator(".ribbon-tabs").getByRole("button", { name: "Timeline", exact: true }).click();
    await page.getByLabel("Timeline range end").fill("4");
    await page.getByLabel("Timeline range start").fill("2");
    if (action === "open") {
      const replacement = structuredClone(cycleDocument);
      replacement.document.title = "Replacement context document";
      await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({
        name: "history-replacement.tcd", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(replacement)),
      });
    } else {
      await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
      await page.getByTestId("ribbon").getByRole("button", { name: "New", exact: true }).click();
    }
    await expect(host).toHaveAttribute("data-editor-idle", "true");
    await expect(page.getByTestId("selection-status")).toHaveText("None");
    await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
    await expect(page.getByTestId("dirty-status")).toHaveText("Clean");
    await expect(page.getByTestId("cycle-status")).toHaveText("Cycle 0");
    await expect(page.getByTestId("signal-tree-search-top")).toHaveValue("");
    await expect(page.getByTestId("signal-tree-type-filter")).toHaveValue("all");
    await expect(bottom.getByTestId("bottom-pin")).toHaveAttribute("aria-pressed", "false");
    await expect(bottom.getByTestId("follow-selection")).toBeChecked();
    await expect(bottom.getByTestId("bottom-target-mode")).toHaveCount(0);
    await page.locator(".ribbon-tabs").getByRole("button", { name: "Timeline", exact: true }).click();
    await expect(page.getByLabel("Timeline range start")).toHaveValue("0");
    await expect(page.getByLabel("Timeline range end")).toHaveValue("1");
  });
}


test("row Reorder Undo/Redo retains stable selection and transient filter", async ({ page }) => {
  await page.setViewportSize({ width: 1672, height: 941 });
  await ready(page);
  const host = page.getByTestId("cycle-surface");
  const rows = host.locator("[data-role='frozen-row'][data-row-id]");
  const request = host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']");
  await request.click();
  await page.getByTestId("signal-tree-search-top").fill("R");
  const order = () => rows.evaluateAll((elements) => elements.map((element) => element.getAttribute("data-row-id")));
  const original = await order();
  expect(original).toHaveLength(cycleDocument.signals.length);
  const expected = [...original];
  const index = expected.indexOf("sig_cycle_request");
  expect(index).toBeGreaterThan(0);
  [expected[index - 1], expected[index]] = [expected[index], expected[index - 1]];
  await request.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Move Up", exact: true }).click();
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await expect.poll(order).toEqual(expected);
  const assertContext = async () => {
    await expect(request).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("selection-status")).toHaveText("REQUEST");
    await expect(page.getByTestId("signal-tree-search-top")).toHaveValue("R");
  };
  await assertContext();
  const ribbon = page.getByTestId("ribbon");
  await ribbon.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 1");
  await expect.poll(order).toEqual(original);
  await assertContext();
  await ribbon.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await expect.poll(order).toEqual(expected);
  await assertContext();
});


test("Group move Undo/Redo preserves real scroll offsets and transient tree filters", async ({ page }) => {
  await page.setViewportSize({ width: 1672, height: 941 });
  await ready(page);
  const fixture = JSON.parse(JSON.stringify(cycleDocument));
  const template = fixture.signals.find((signal: { id: string }) => signal.id === "sig_cycle_request");
  for (let index = 0; index < 40; index++) {
    const signal = structuredClone(template);
    signal.id = `sig_history_row_${index}`;
    signal.name = `REQUEST_COPY_${index}`;
    signal.display.name = signal.name;
    signal.source.signalName = `history_${index}`;
    fixture.signals.push(signal);
    fixture.signalGroups[0].rows.push(signal.id);
  }
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({
    name: "history-scroll.tcd", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(fixture)),
  });
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
  await page.getByLabel("Zoom preset").selectOption("200");
  await page.getByTestId("signal-tree-search-top").fill("REQUEST");
  const viewport = page.getByTestId("cycle-viewport");
  const owner = page.locator(".editor-shell[data-view-mode='Cycle'] [data-role='timeline-viewport']");
  await expect.poll(() => owner.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeGreaterThan(100);
  await expect.poll(() => viewport.evaluate((element) => element.scrollHeight - element.clientHeight)).toBeGreaterThan(100);
  const box = (await owner.boundingBox())!;
  await page.mouse.move(box.x + 120, box.y + 100);
  await page.mouse.wheel(160, 0);
  await expect.poll(() => owner.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
  // Vertical scrolling belongs to the outer Cycle viewport, not its horizontal child.
  await viewport.hover({ position: { x: 10, y: 100 } });
  await page.mouse.wheel(0, 180);
  await expect.poll(() => viewport.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  const readContext = () => page.evaluate(() => ({
    x: document.querySelector(".editor-shell[data-view-mode='Cycle'] [data-role='timeline-viewport']")!.scrollLeft,
    y: document.querySelector("[data-testid='cycle-viewport']")!.scrollTop,
    filter: (document.querySelector("[data-testid='signal-tree-search-top']") as HTMLInputElement).value,
    zoom: document.querySelector("[data-testid='zoom-status-bar']")!.textContent,
    selected: document.querySelector("[data-testid='selection-status']")!.textContent,
  }));
  const before = await readContext();
  const group = page.getByTestId("signal-editor").getByLabel("Signal group");
  await group.selectOption("grp_cycle_payload");
  await page.getByTestId("move-signal-to-group").click();
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await expect(group).toHaveValue("grp_cycle_payload");
  await expect.poll(readContext).toEqual(before);
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Home", exact: true }).click();
  const ribbon = page.getByTestId("ribbon");
  await ribbon.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 1");
  await expect(group).toHaveValue("grp_cycle_control");
  await expect.poll(readContext).toEqual(before);
  await ribbon.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await expect(group).toHaveValue("grp_cycle_payload");
  await expect.poll(readContext).toEqual(before);
});


test("timeline Undo/Redo preserves compatible range, pinned target, zoom and panel geometry", async ({ page }) => {
  await page.setViewportSize({ width: 1672, height: 941 });
  await ready(page);
  const host = page.getByTestId("cycle-surface");
  const row = host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']");
  await row.click();
  await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
  await page.getByLabel("Zoom preset").selectOption("150");
  await expect(page.getByTestId("zoom-status")).toHaveText("150%");
  const splitter = page.getByTestId("bottom-resizer");
  const originalHeight = await splitter.getAttribute("aria-valuenow");
  await splitter.focus();
  await page.keyboard.press("ArrowUp");
  await expect(splitter).not.toHaveAttribute("aria-valuenow", originalHeight!);
  await page.getByTestId("bottom-settings").click();
  await page.getByTestId("bottom-pin").click();
  await expect(page.getByTestId("bottom-pin")).toHaveAttribute("aria-pressed", "true");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Timeline", exact: true }).click();
  const timeline = page.getByTestId("timeline-editor");
  await timeline.getByLabel("Timeline insert count").fill("1");
  await timeline.getByRole("button", { name: "Insert before" }).click();
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await timeline.getByLabel("Timeline range end").fill("4");
  await timeline.getByLabel("Timeline range start").fill("2");
  const snapshot = () => page.evaluate(() => {
    const bottom = document.querySelector("[data-testid='bottom-editor']")!;
    const inspector = document.querySelector("[data-testid='inspector']");
    return {
      cycle: document.querySelector("[data-testid='cycle-status']")?.textContent,
      start: (document.querySelector("[aria-label='Timeline range start']") as HTMLInputElement)?.value,
      end: (document.querySelector("[aria-label='Timeline range end']") as HTMLInputElement)?.value,
      zoom: document.querySelector("[data-testid='zoom-status-bar']")?.textContent,
      height: document.querySelector("[data-testid='bottom-resizer']")?.getAttribute("aria-valuenow"),
      bottomHeight: bottom.getBoundingClientRect().height,
      inspectorWidth: inspector?.getBoundingClientRect().width,
      pin: document.querySelector("[data-testid='bottom-pin']")?.getAttribute("aria-pressed"),
      selection: document.querySelector("[data-testid='selection-status']")?.textContent,
    };
  });
  const before = await snapshot();
  expect(before.start).toBe("2");
  expect(before.end).toBe("4");
  expect(before.cycle).toMatch(/^Cycle \d+$/);
  expect(before.zoom).toBe("Zoom: 150%");
  expect(before.pin).toBe("true");
  expect(before.selection).toBe("REQUEST");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Home", exact: true }).click();
  const ribbon = page.getByTestId("ribbon");
  await ribbon.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 1");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Timeline", exact: true }).click();
  await expect.poll(snapshot).toEqual(before);
  await expect(row).toHaveAttribute("aria-selected", "true");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Home", exact: true }).click();
  await ribbon.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Timeline", exact: true }).click();
  await expect.poll(snapshot).toEqual(before);
});


async function ready(page: import("@playwright/test").Page) {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
}

// #211: Undo/Redo must preserve compatible transient editing context --
// specifically, selected stable object ID(s) across a Delete/Undo/Redo
// cycle. Canonical restoration alone (the row comes back) is not
// sufficient UX parity if the selection doesn't follow it.
test("Delete Undo restores selection to the recreated Signal; Redo clears it again without a stale reference", async ({ page }) => {
  await ready(page);
  const host = page.getByTestId("cycle-surface");
  const row = host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']");
  await row.click();
  await expect(page.getByTestId("selection-status")).toHaveText("REQUEST");
  const ribbon = page.getByTestId("ribbon");
  await ribbon.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByTestId("selection-status")).toHaveText("None");
  await expect(row).toHaveCount(0);
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");

  await ribbon.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 1");
  await expect(row).toBeVisible();
  await expect(page.getByTestId("selection-status")).toHaveText("REQUEST");

  await ribbon.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await expect(row).toHaveCount(0);
  // No stale reference to the just-redeleted signal.
  await expect(page.getByTestId("selection-status")).toHaveText("None");
});

for (const viewport of [{ width: 1280, height: 720 }, { width: 1672, height: 941 }]) test(`Rename Undo keeps the same Signal selected (name reverts, selection does not move) at ${viewport.width}x${viewport.height}`, async ({ page }) => {
  await page.setViewportSize(viewport);
  await ready(page);
  const host = page.getByTestId("cycle-surface");
  const row = host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']");
  await row.click();
  await expect(page.getByTestId("selection-status")).toHaveText("REQUEST");
  const ribbon = page.getByTestId("ribbon");
  await ribbon.getByRole("button", { name: "More", exact: true }).click();
  await page.getByRole("menu", { name: "More Home Commands" }).getByRole("menuitem", { name: "Rename", exact: true }).click();
  const dialog = page.getByTestId("rename-dialog");
  await dialog.getByRole("textbox").fill("RENAMED_REQUEST");
  await dialog.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.getByTestId("selection-status")).toHaveText("RENAMED_REQUEST");
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");

  await ribbon.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 1");
  await expect(page.getByTestId("selection-status")).toHaveText("REQUEST");
  await expect(row).toBeVisible();
  await ribbon.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await expect(page.getByTestId("selection-status")).toHaveText("RENAMED_REQUEST");
  await expect(row).toBeVisible();
});

test("an unrelated Undo/Redo does not touch a selection it has nothing to do with", async ({ page }) => {
  await ready(page);
  const host = page.getByTestId("cycle-surface");
  const ribbon = page.getByTestId("ribbon");
  // Perform an edit unrelated to selection (insert a cycle), then select a
  // signal, then Undo the timeline edit -- the signal selection must survive
  // since the undone command never touched that signal.
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Timeline", exact: true }).click();
  const timeline = page.getByTestId("timeline-editor");
  await timeline.getByLabel("Timeline insert count").fill("1");
  await timeline.getByRole("button", { name: "Insert before" }).click();
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Home", exact: true }).click();
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_ready']").click();
  await expect(page.getByTestId("selection-status")).toHaveText("READY");
  await ribbon.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 1");
  await expect(page.getByTestId("selection-status")).toHaveText("READY");
});
