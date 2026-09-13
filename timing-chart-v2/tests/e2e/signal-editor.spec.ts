import { expect, test } from "@playwright/test";

// Bottom Panel Visual Reference pass (#402/#426): Name/Role/Type/Spacing
// moved to Inspector (its sole owner now) -- Bottom's own duplicate
// property form ("Name/Role/Type/Spacing Before/Spacing After/Apply
// properties") was removed. Inspector's Apply carries the same Draft/
// Apply disabled-when-unchanged contract Bottom's form used to have.
test("Inspector applies per-signal vertical spacing through the canonical command", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const surface = host.locator("[data-role='timing-chart-surface']");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  const inspector = page.getByTestId("inspector");
  const nextRow = surface.locator("[data-role='frozen-row'][data-row-id='sig_cycle_ready']");
  const before = await nextRow.boundingBox();
  const countersBefore = JSON.parse(await surface.getAttribute("data-render-counters") ?? "null") as Record<string, number>;
  await inspector.getByLabel("Inspector signal spacing before").fill("3");
  await inspector.getByLabel("Inspector signal spacing after").fill("18");
  await inspector.getByTestId("apply-inspector-signal").click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  const after = await nextRow.boundingBox();
  expect(before).not.toBeNull();
  expect(after).not.toBeNull();
  expect(after!.y - before!.y).toBeGreaterThanOrEqual(18);
  const countersAfter = JSON.parse(await surface.getAttribute("data-render-counters") ?? "null") as Record<string, number>;
  expect(countersAfter.waveDromRenders).toBe(countersBefore.waveDromRenders);
  await page.getByTestId("signal-editor").getByTestId("editor-undo").click();
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 1");
});

test("follows row selection and exposes derived Event Table columns", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await expect(page.getByTestId("signal-editor")).toContainText("Select a signal to edit");

  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  const editor = page.getByTestId("signal-editor");
  await expect(editor).toContainText("REQUEST · Signal");
  await expect(editor.getByRole("table", { name: "Signal events" }).locator("form.event-row")).toHaveCount(3);
  // Visual Quality Closure follow-up, Section 7: a row reads as plain text
  // at rest -- each read-only cell keeps its own stable `data-testid`
  // rather than relying on `.nth()` position (read-only rows now render
  // more <output> elements than an editing one).
  const first = editor.locator("form.event-row").first();
  await expect(first.getByTestId("event-row-start-0")).toHaveText("0");
  await expect(first.getByTestId("event-row-value-0")).toHaveText("0");
  await expect(first.getByTestId("event-row-end-0")).toHaveText("3");
  await expect(first.getByTestId("event-row-duration-0")).toHaveText("3");
  await expect(editor.getByRole("group", { name: "Quick values" }).getByRole("button")).toHaveText(["0", "1", "X", "Z"]);
});

test("commits one event edit once, rerenders only its waveform, and supports Undo", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const surface = host.locator("[data-role='timing-chart-surface']");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  const editor = page.getByTestId("signal-editor");
  const countersBefore = JSON.parse(await surface.getAttribute("data-render-counters") ?? "null") as Record<string, number>;
  const clockSvg = await surface.locator("[data-signal-id='sig_cycle_clock'] > svg").elementHandle();
  const requestSvg = await surface.locator("[data-signal-id='sig_cycle_request'] > svg").elementHandle();

  const row = editor.locator("form.event-row").nth(1);
  await row.getByRole("button", { name: /Edit transition/ }).click();
  await row.getByLabel("Start 3").fill("4");
  await row.getByLabel("Value 3").selectOption("X");
  await row.getByRole("button", { name: "Save" }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(page.getByTestId("revision-status")).toHaveText("Canonical revision 1");
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await expect(editor.getByTestId("event-row-start-4")).toHaveText("4");
  await expect(editor.getByTestId("event-row-value-4")).toHaveText("X");

  const countersAfter = JSON.parse(await surface.getAttribute("data-render-counters") ?? "null") as Record<string, number>;
  expect(countersAfter.waveDromRenders).toBe(countersBefore.waveDromRenders + 1);
  expect(countersAfter.localGeometryBuilds).toBe(countersBefore.localGeometryBuilds + 1);
  expect(countersAfter.rowPositionUpdates).toBe(countersBefore.rowPositionUpdates);
  const currentClockSvg = await surface.locator("[data-signal-id='sig_cycle_clock'] > svg").elementHandle();
  const currentRequestSvg = await surface.locator("[data-signal-id='sig_cycle_request'] > svg").elementHandle();
  expect(await clockSvg!.evaluate((before, after) => before === after, currentClockSvg)).toBe(true);
  expect(await requestSvg!.evaluate((before, after) => before !== after, currentRequestSvg)).toBe(true);

  await page.getByTestId("editor-undo").click();
  await expect(page.getByTestId("revision-status")).toHaveText("Canonical revision 2");
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 1");
  await expect(editor.getByTestId("event-row-start-3")).toHaveText("3");
  await expect(editor.getByTestId("event-row-value-3")).toHaveText("1");
});

// Bottom Panel Visual Reference pass (#402/#426): Name and Role are now
// two independent Inspector-owned commit paths (InlineNameInput's own
// Enter gesture vs Apply Signal Properties) rather than one combined
// Bottom-form submit -- each is its own one-command, one-History-unit
// action, neither regenerating WaveDrom.
test("Inspector Name (Enter) and Role (Apply) each commit independently without WaveDrom regeneration", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const surface = host.locator("[data-role='timing-chart-surface']");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  const countersBefore = await surface.getAttribute("data-render-counters");
  const inspector = page.getByTestId("inspector");
  await inspector.getByLabel("Inspector signal name", { exact: true }).fill("REQ_VALID");
  await inspector.getByLabel("Inspector signal name", { exact: true }).press("Enter");
  await expect(page.getByTestId("revision-status")).toHaveText("Canonical revision 1");
  await expect(page.getByTestId("selection-status")).toHaveText("REQ_VALID");
  await expect(surface.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']")).toContainText("REQ_VALID");
  await inspector.getByLabel("Inspector signal role").selectOption("output");
  await inspector.getByTestId("apply-inspector-signal").click();
  await expect(page.getByTestId("revision-status")).toHaveText("Canonical revision 2");
  await expect(surface.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request'] [data-role='signal-role']")).toHaveText("o");
  expect(await surface.getAttribute("data-render-counters")).toBe(countersBefore);
});

// Bottom Panel Visual Reference pass (#402/#426): Type/Role/Width moved
// to Inspector, the sole owner of `signal.updateProperties` now.
test("Inspector exposes editable type and bus width through one semantic command", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_data']").click();
  const inspector = page.getByTestId("inspector");
  await expect(inspector.getByLabel("Inspector signal type")).toHaveValue("bus");
  const revisionBefore = await page.getByTestId("revision-status").textContent();
  await inspector.getByLabel("Inspector signal role").selectOption("output");
  await inspector.getByLabel("Inspector signal width").fill("16");
  await inspector.getByTestId("apply-inspector-signal").click();
  await expect(page.getByTestId("revision-status")).not.toHaveText(revisionBefore!);
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await expect(inspector.getByLabel("Inspector signal width")).toHaveValue("16");
  await page.getByTestId("ribbon").getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 1");
  await expect(inspector.getByLabel("Inspector signal width")).toHaveValue("8");
});

// Bottom Panel Visual Reference pass (#402/#426): Import/Export moved out
// of the row-operations toolbar into the table footer (alongside the new
// bulk Delete Selected/Move Up/Move Down), matching the Reference's
// header/editor/table/footer information architecture; the toolbar keeps
// only Duplicate/Add Row/Delete (the always-visible Value Helper panel
// replaced the old toggle-hidden "Presets" button).
test("Bottom Signal event toolbar provides command-backed row operations, and the table footer provides export", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  const editor = page.getByTestId("signal-editor");
  const toolbar = page.getByTestId("signal-event-toolbar");
  await expect(toolbar).toBeVisible();
  await expect(toolbar.getByRole("button")).toHaveText(["Duplicate", "Add Row", "Delete"]);
  const revisionBefore = await page.getByTestId("revision-status").textContent();
  const historyBefore = await page.getByTestId("history-status").textContent();
  await expect(page.getByTestId("revision-status")).toHaveText(revisionBefore!);
  await expect(page.getByTestId("history-status")).toHaveText(historyBefore!);
  const download = page.waitForEvent("download");
  await editor.getByTestId("event-export-action").click();
  const exported = await download;
  expect((await exported.createReadStream())?.readable).toBe(true);
  await editor.locator("[data-event-start='0']").click();
  await toolbar.getByTestId("event-duplicate").click();
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await expect(editor.locator("form.event-row")).toHaveCount(4);
});

test("Bottom Signal event Import (table footer) replaces the table in one history entry and Undo restores it", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  const editor = page.getByTestId("signal-editor");
  await editor.getByTestId("event-import-action").click();
  await editor.getByLabel("Import signal events").setInputFiles({ name: "events.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ values: [{ start: 0, value: "0" }, { start: 2, value: "X" }, { start: 5, value: "1" }] })) });
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await expect(editor.locator("form.event-row")).toHaveCount(3);
  await expect(editor.getByTestId("event-row-value-2")).toHaveText("X");
  await editor.getByTestId("editor-undo").click();
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 1");
  await expect(editor.getByTestId("event-row-value-3")).toHaveText("1");
});

test("edits Clock Generator through one semantic history entry", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const surface = host.locator("[data-role='timing-chart-surface']");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_clock']").click();
  const countersBefore = JSON.parse(await surface.getAttribute("data-render-counters") ?? "null") as Record<string, number>;
  const editor = page.getByTestId("signal-editor");
  await expect(editor.getByRole("form", { name: "Clock Generator" })).toBeVisible();
  await editor.getByLabel("Clock period").fill("4");
  await page.getByTestId("apply-clock-generator").click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await expect(editor.getByLabel("Clock period")).toHaveValue("4");
  const countersAfter = JSON.parse(await surface.getAttribute("data-render-counters") ?? "null") as Record<string, number>;
  expect(countersAfter.waveDromRenders).toBe(countersBefore.waveDromRenders + 1);
  expect(countersAfter.localGeometryBuilds).toBe(countersBefore.localGeometryBuilds + 1);
});

test("Bottom Clock editor applies exact non-50% Duty through WaveDrom and preserves Undo/Redo", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const surface = host.locator("[data-role='timing-chart-surface']");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_clock']").click();
  const editor = page.getByTestId("signal-editor");
  const clockOwner = surface.locator("[data-signal-id='sig_cycle_clock']");
  const beforeUses = await clockOwner.locator("svg use").evaluateAll((uses) => uses.map((use) => use.getAttribute("xlink:href") ?? use.getAttribute("href")));
  const beforeCounters = JSON.parse(await surface.getAttribute("data-render-counters") ?? "null") as Record<string, number>;
  const duty = editor.getByLabel("Clock duty");
  await expect(duty).toBeEnabled();
  await duty.fill("0.25");
  await editor.getByTestId("apply-clock-generator").click();
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(clockOwner).not.toHaveAttribute("data-wave-error");
  await expect(clockOwner.locator("svg")).toHaveCount(1);
  await expect(duty).toHaveValue("0.25");
  const afterUses = await clockOwner.locator("svg use").evaluateAll((uses) => uses.map((use) => use.getAttribute("xlink:href") ?? use.getAttribute("href")));
  expect(afterUses).not.toEqual(beforeUses);
  const afterCounters = JSON.parse(await surface.getAttribute("data-render-counters") ?? "null") as Record<string, number>;
  expect(afterCounters.waveDromRenders).toBe(beforeCounters.waveDromRenders + 1);
  expect(afterCounters.localGeometryBuilds).toBe(beforeCounters.localGeometryBuilds + 1);
  await editor.getByTestId("editor-undo").click();
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 1");
  await expect(clockOwner).not.toHaveAttribute("data-wave-error");
  await editor.getByTestId("editor-redo").click();
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await expect(clockOwner).not.toHaveAttribute("data-wave-error");
  const downloadPromise = page.waitForEvent("download");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Save", exact: true }).click();
  const savedPath = await (await downloadPromise).path();
  expect(savedPath).toBeTruthy();
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(savedPath!);
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_clock']").click();
  await expect(page.getByTestId("signal-editor").getByLabel("Clock duty")).toHaveValue("0.25");
});

test("Bottom Clock editor applies suppressed periods and preserves them through Save/Open", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const surface = host.locator("[data-role='timing-chart-surface']");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_clock']").click();
  const editor = page.getByTestId("signal-editor");
  const clockOwner = surface.locator("[data-signal-id='sig_cycle_clock']");
  const beforeUses = await clockOwner.locator("svg use").evaluateAll((uses) => uses.map((use) => use.getAttribute("xlink:href") ?? use.getAttribute("href")));
  await editor.getByLabel("Clock suppressed periods").fill("1, 1");
  await editor.getByTestId("apply-clock-generator").click();
  await expect(page.getByTestId("clock-generator-error")).toContainText("must not contain duplicates");
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
  await editor.getByLabel("Clock suppressed periods").fill("1, 3");
  await editor.getByTestId("apply-clock-generator").click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await expect(clockOwner).not.toHaveAttribute("data-wave-error");
  const afterUses = await clockOwner.locator("svg use").evaluateAll((uses) => uses.map((use) => use.getAttribute("xlink:href") ?? use.getAttribute("href")));
  expect(afterUses).not.toEqual(beforeUses);
  await editor.getByTestId("editor-undo").click();
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 1");
  await editor.getByTestId("editor-redo").click();
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  const downloadPromise = page.waitForEvent("download");
  await page.getByTestId("ribbon").getByRole("button", { name: "Save", exact: true }).click();
  const savedPath = await (await downloadPromise).path();
  expect(savedPath).toBeTruthy();
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(savedPath!);
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_clock']").click();
  await expect(page.getByTestId("signal-editor").getByLabel("Clock suppressed periods")).toHaveValue("1, 3");
});

test("Bottom Clock editor exposes Edge Counter settings through its own semantic command", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_clock']").click();
  const editor = page.getByTestId("signal-editor");
  const surface = host.locator("[data-role='timing-chart-surface']");
  const before = JSON.parse(await surface.getAttribute("data-render-counters") ?? "null") as Record<string, number>;
  await editor.getByLabel("Clock edge counter show").check();
  await editor.getByLabel("Clock edge counter mode").selectOption("falling");
  await editor.getByLabel("Clock edge counter count from").selectOption("visible-range-start");
  await editor.getByTestId("apply-clock-edge-counter").click();
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await expect(editor.getByLabel("Clock edge counter mode")).toHaveValue("falling");
  await expect(surface.locator("[data-role='clock-edge-number'][data-edge-counter-id]").first()).toBeVisible();
  const after = JSON.parse(await surface.getAttribute("data-render-counters") ?? "null") as Record<string, number>;
  expect(after.waveDromRenders).toBe(before.waveDromRenders);
  expect(after.localGeometryBuilds).toBe(before.localGeometryBuilds);
  await editor.getByTestId("editor-undo").click();
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 1");
  await expect(editor.getByLabel("Clock edge counter show")).not.toBeChecked();
});

test("Bottom Clock context toolbar exposes real preset, duplicate, import, export and preview actions", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  const host = page.getByTestId("cycle-surface");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_clock']").click();
  const toolbar = page.getByTestId("clock-context-toolbar");
  await expect(toolbar.getByRole("button")).toHaveText(["Presets", "Duplicate", "Import...", "Export...", "Preview"]);
  const revision = await page.getByTestId("revision-status").textContent();
  const history = await page.getByTestId("history-status").textContent();
  await toolbar.getByTestId("clock-preview").click();
  await expect(page.getByTestId("clock-preview-status")).toContainText("canonical data unchanged");
  await expect(page.getByTestId("revision-status")).toHaveText(revision!);
  await expect(page.getByTestId("history-status")).toHaveText(history!);
  await toolbar.getByTestId("clock-presets").click();
  await toolbar.getByRole("button", { name: "50% duty", exact: true }).click();
  await toolbar.getByTestId("clock-duplicate").click();
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await expect(page.getByTestId("selection-status")).toHaveText("CLOCK_duplicate");
});

test("moves the rendered waveform transition to the edited Start cycle, not just the DOM identity", async ({ page }) => {
  await page.goto("/");
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const surface = host.locator("[data-role='timing-chart-surface']");
  const wave = surface.locator("[data-signal-id='sig_cycle_request'] > svg");
  const ruler = page.getByTestId("cycle-ruler");

  const transitionXs = async () => {
    // WaveDrom keeps a large hidden symbol pool in each SVG. Restrict the
    // geometry probe to visible uses so the acceptance check does not spend
    // a timeout asking Chromium for boxes of hidden template nodes.
    return wave.locator("use").evaluateAll((nodes) => nodes.flatMap((node) => {
      const element = node as SVGGraphicsElement;
      const box = element.getBoundingClientRect();
      const shape = node.getAttribute("xlink:href") ?? node.getAttribute("href");
      return box.width > 0 && box.height > 0 && shape?.includes("m") ? [box.x] : [];
    }));
  };

  const beforeXs = await transitionXs();
  expect(beforeXs.length).toBeGreaterThan(0);
  const cycle4X = (await ruler.locator("[data-cycle='4']").boundingBox())!.x;

  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  const editor = page.getByTestId("signal-editor");
  const row = editor.locator("form.event-row").nth(1);

  const revisionBeforeType = await page.getByTestId("revision-status").textContent();
  await row.getByRole("button", { name: /Edit transition/ }).click();
  await row.getByLabel("Start 3").fill("4");
  await expect(page.getByTestId("revision-status")).toHaveText(revisionBeforeType!);

  await row.getByRole("button", { name: "Save" }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");

  const afterXs = await transitionXs();
  expect(afterXs.length).toBeGreaterThan(0);
  expect(Math.abs(afterXs[0] - cycle4X)).toBeLessThan(3);
  expect(Math.abs(beforeXs[0] - cycle4X)).toBeGreaterThan(2);
});

test("#402: Event row Save stays disabled until the Draft differs, and Cancel discards it back to canonical", async ({ page }) => {
  await page.goto("/");
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  const editor = page.getByTestId("signal-editor");
  const row = editor.locator("form.event-row").nth(1);
  const editButton = row.getByRole("button", { name: /Edit transition/ });
  const deleteButton = row.getByRole("button", { name: /Delete transition/ });
  const saveButton = row.getByRole("button", { name: "Save" });
  const cancelButton = row.getByRole("button", { name: "Cancel" });

  // Visual Quality Closure follow-up (#402/#426), Section 7: a row reads as
  // plain text at rest -- Edit/Duplicate/Delete are the only actions, no
  // Cancel/Save sitting there unused, and no live inputs at all. Cancel/
  // Save (and the inputs themselves) only exist once Edit has actually
  // been clicked (this is also what keeps the Actions column narrow
  // enough to never clip).
  await expect(editButton).toBeVisible();
  await expect(deleteButton).toBeVisible();
  await expect(saveButton).toHaveCount(0);
  await expect(cancelButton).toHaveCount(0);
  await expect(row.getByLabel("Value 3")).toHaveCount(0);
  await expect(row.getByTestId("event-row-value-3")).toHaveText("1");

  await editButton.click();
  await expect(saveButton).toBeDisabled();
  await row.getByLabel("Value 3").selectOption("X");
  await expect(saveButton).toBeEnabled();
  await expect(cancelButton).toBeEnabled();
  await expect(row.getByTitle("Unapplied changes")).toBeVisible();
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");

  // Cancel discards the Draft *and* leaves edit mode entirely, back to the
  // same read-only Edit/Duplicate/Delete state Save eventually returns to.
  await cancelButton.click();
  await expect(row.getByTestId("event-row-value-3")).toHaveText("1");
  await expect(editButton).toBeVisible();
  await expect(saveButton).toHaveCount(0);
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");

  await editButton.click();
  await row.getByLabel("Value 3").selectOption("X");
  await row.getByRole("button", { name: "Save" }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await expect(saveButton).toHaveCount(0);
  await expect(row.getByTestId("event-row-value-3")).toHaveText("X");
  await expect(editButton).toBeVisible();
});

// Visual Quality Closure pass (#402/#426), Section 4: the checkbox column
// is bulk-row-selection for the footer's Delete Selected/Move Up/Move Down
// -- a real tri-state Select All checkbox drives (and reflects) the exact
// same selection set each row's own checkbox feeds, each row's checkbox
// has an unambiguous accessible name, and the selection count is visible
// next to the bulk actions.
test("Transitions table Select All is a real tri-state checkbox wired to the same selection the footer bulk actions use", async ({ page }) => {
  await page.goto("/");
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  const editor = page.getByTestId("signal-editor");
  const selectAll = editor.getByLabel("Select all transitions", { exact: true });
  const rows = editor.locator("form.event-row");
  await expect(rows).toHaveCount(3);
  const status = editor.getByTestId("event-selected-count");

  await expect(selectAll).not.toBeChecked();
  await expect(status).toHaveText("0 rows selected");

  // Each row's own checkbox has a distinct, sentence-like accessible name
  // (not just the bare cycle number) and feeds the same selection.
  await editor.getByLabel("Select transition 1", { exact: true }).check();
  await expect(status).toHaveText("1 row selected");
  const isIndeterminate = await selectAll.evaluate((element: HTMLInputElement) => element.indeterminate);
  expect(isIndeterminate).toBe(true);
  await expect(selectAll).not.toBeChecked();

  await editor.getByLabel("Select transition 2", { exact: true }).check();
  await editor.getByLabel("Select transition 3", { exact: true }).check();
  await expect(status).toHaveText("3 rows selected");
  await expect(selectAll).toBeChecked();
  const isIndeterminateAllChecked = await selectAll.evaluate((element: HTMLInputElement) => element.indeterminate);
  expect(isIndeterminateAllChecked).toBe(false);

  // Select All toggles the whole set at once, both directions.
  await selectAll.uncheck();
  await expect(status).toHaveText("0 rows selected");
  await selectAll.check();
  await expect(status).toHaveText("3 rows selected");

  // Delete Selected refuses to remove every row (would leave the Signal
  // with none), matching the existing guard -- Move Up/Down require
  // exactly one row checked.
  await expect(editor.getByTestId("event-delete-selected")).toBeDisabled();
  await expect(editor.getByTestId("event-move-up")).toBeDisabled();
  await selectAll.uncheck();
  await editor.getByLabel("Select transition 1", { exact: true }).check();
  await expect(editor.getByTestId("event-delete-selected")).toBeEnabled();
});

test("Transition drag handle reorders rows through one history entry", async ({ page }) => {
  await page.goto("/");
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await page.getByRole("tab", { name: "Signal", exact: true }).click();
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  const editor = page.getByTestId("signal-editor");
  const rows = editor.locator("form.event-row");
  const source = rows.nth(1);
  const target = rows.nth(0);
  const historyBefore = await page.getByTestId("history-status").textContent();
  const transfer = await page.evaluateHandle(() => new DataTransfer());
  await source.getByLabel(/Drag transition/).dispatchEvent("dragstart", { dataTransfer: transfer });
  await target.dispatchEvent("dragover", { dataTransfer: transfer });
  await target.dispatchEvent("drop", { dataTransfer: transfer });
  await expect(page.getByTestId("history-status")).not.toHaveText(historyBefore!);
  await expect(editor.locator("form.event-row").first().locator("[data-testid^='event-row-value-']")).toHaveText("1");
  await expect(editor.locator("form.event-row").nth(1).locator("[data-testid^='event-row-value-']")).toHaveText("0");
});

test("Selected transition block moves down as one semantic unit", async ({ page }) => {
  await page.goto("/");
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  await page.getByRole("tab", { name: "Signal", exact: true }).click();
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  const editor = page.getByTestId("signal-editor");
  await editor.getByLabel("Select transition 1", { exact: true }).check();
  await editor.getByLabel("Select transition 2", { exact: true }).check();
  const historyBefore = await page.getByTestId("history-status").textContent();
  await expect(editor.getByTestId("event-move-down")).toBeEnabled();
  await editor.getByTestId("event-move-down").click();
  await expect(page.getByTestId("history-status")).not.toHaveText(historyBefore!);
  await expect(editor.getByLabel("Select transition 2", { exact: true })).toBeChecked();
  await expect(editor.getByLabel("Select transition 3", { exact: true })).toBeChecked();
  await expect(editor.locator("form.event-row")).toHaveCount(3);
});

test("Selected transition block moves up and restores through Undo/Redo", async ({ page }) => {
  await page.goto("/");
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  await page.getByRole("tab", { name: "Signal", exact: true }).click();
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  const editor = page.getByTestId("signal-editor");
  const before = await editor.locator("form.event-row").evaluateAll((rows) => rows.map((row) => row.getAttribute("data-event-start")));
  await editor.getByLabel("Select transition 2", { exact: true }).check();
  await editor.getByLabel("Select transition 3", { exact: true }).check();
  await editor.getByTestId("event-move-up").click();
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  const moved = await editor.locator("form.event-row").evaluateAll((rows) => rows.map((row) => row.getAttribute("data-event-start")));
  expect(moved).not.toEqual(before);
  await editor.getByTestId("editor-undo").click();
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 1");
  await expect(editor.locator("form.event-row")).toHaveCount(3);
  await editor.getByTestId("editor-redo").click();
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
});
