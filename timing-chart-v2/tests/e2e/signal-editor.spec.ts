import { expect, test } from "@playwright/test";

test("follows row selection and exposes derived Event Table columns", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await expect(page.getByTestId("signal-editor")).toContainText("Select a signal to edit");

  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  const editor = page.getByTestId("signal-editor");
  await expect(editor).toContainText("REQUEST · binary");
  await expect(editor.getByRole("table", { name: "Signal events" }).locator("form.event-row")).toHaveCount(3);
  const first = editor.locator("form.event-row").first();
  await expect(first.getByLabel("Start 0")).toHaveValue("0");
  await expect(first.getByLabel("Value 0")).toHaveValue("0");
  await expect(first.locator("output").nth(0)).toHaveText("3");
  await expect(first.locator("output").nth(1)).toHaveText("3");
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
  await row.getByLabel("Start 3").fill("4");
  await row.getByLabel("Value 3").fill("X");
  await row.getByRole("button", { name: "Save" }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(page.getByTestId("revision-status")).toHaveText("Canonical revision 1");
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await expect(editor.getByLabel("Start 4")).toHaveValue("4");
  await expect(editor.getByLabel("Value 4")).toHaveValue("X");

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
  await expect(editor.getByLabel("Start 3")).toHaveValue("3");
  await expect(editor.getByLabel("Value 3")).toHaveValue("1");
});

test("updates row properties without WaveDrom regeneration", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const surface = host.locator("[data-role='timing-chart-surface']");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  const countersBefore = await surface.getAttribute("data-render-counters");
  const editor = page.getByTestId("signal-editor");
  await editor.getByLabel("Signal name").fill("REQ_VALID");
  await editor.getByLabel("Signal role").selectOption("output");
  await page.getByTestId("save-signal-properties").click();
  await expect(page.getByTestId("revision-status")).toHaveText("Canonical revision 1");
  await expect(page.getByTestId("selection-status")).toHaveText("REQ_VALID");
  await expect(surface.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']")).toContainText("REQ_VALID");
  await expect(surface.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request'] [data-role='signal-role']")).toHaveText("o");
  expect(await surface.getAttribute("data-render-counters")).toBe(countersBefore);
});

test("Bottom Signal editor exposes editable type and bus width through one semantic command", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_data']").click();
  const editor = page.getByTestId("signal-editor");
  await expect(editor.getByLabel("Signal type")).toHaveValue("bus");
  const revisionBefore = await page.getByTestId("revision-status").textContent();
  await editor.getByLabel("Signal role").selectOption("output");
  await editor.getByLabel("Signal width").fill("16");
  await editor.getByTestId("save-signal-properties").click();
  await expect(page.getByTestId("revision-status")).not.toHaveText(revisionBefore!);
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await expect(editor.getByLabel("Signal width")).toHaveValue("16");
  await page.getByTestId("editor-undo").click();
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 1");
  await expect(editor.getByLabel("Signal width")).toHaveValue("8");
});

test("Bottom Signal event toolbar provides command-backed row operations and view-only preview/export", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  const editor = page.getByTestId("signal-editor");
  const toolbar = page.getByTestId("signal-event-toolbar");
  await expect(toolbar).toBeVisible();
  await expect(toolbar.getByRole("button")).toHaveText(["Presets", "Duplicate", "Import...", "Export...", "Preview", "Add Row", "Duplicate", "Delete", "Import", "Export", "Preview Update"]);
  const revisionBefore = await page.getByTestId("revision-status").textContent();
  const historyBefore = await page.getByTestId("history-status").textContent();
  await toolbar.getByTestId("event-preview").click();
  await expect(page.getByTestId("event-preview-status")).toContainText("canonical data unchanged");
  await expect(page.getByTestId("revision-status")).toHaveText(revisionBefore!);
  await expect(page.getByTestId("history-status")).toHaveText(historyBefore!);
  const download = page.waitForEvent("download");
  await toolbar.getByTestId("event-export").click();
  const exported = await download;
  expect((await exported.createReadStream())?.readable).toBe(true);
  await editor.locator("[data-event-start='0']").click();
  await toolbar.getByTestId("event-duplicate-row").click();
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await expect(editor.locator("form.event-row")).toHaveCount(4);
});

test("Bottom Signal event Import replaces the table in one history entry and Undo restores it", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  const editor = page.getByTestId("signal-editor");
  const toolbar = page.getByTestId("signal-event-toolbar");
  await toolbar.getByTestId("event-import").click();
  await editor.getByLabel("Import signal events").setInputFiles({ name: "events.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ values: [{ start: 0, value: "0" }, { start: 2, value: "X" }, { start: 5, value: "1" }] })) });
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await expect(editor.locator("form.event-row")).toHaveCount(3);
  await expect(editor.getByLabel("Value 2")).toHaveValue("X");
  await editor.getByTestId("editor-undo").click();
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 1");
  await expect(editor.getByLabel("Value 3")).toHaveValue("1");
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

test("Bottom Clock editor keeps Duty editable and applies it through the clock SemanticCommand", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_clock']").click();
  const editor = page.getByTestId("signal-editor");
  const duty = editor.getByLabel("Clock duty");
  await expect(duty).toBeEnabled();
  await duty.fill("0.25");
  await editor.getByTestId("apply-clock-generator").click();
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await expect(duty).toHaveValue("0.25");
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
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const surface = host.locator("[data-role='timing-chart-surface']");
  const wave = surface.locator("[data-signal-id='sig_cycle_request'] > svg");
  const ruler = page.getByTestId("cycle-ruler");

  const transitionXs = async () => {
    const uses = wave.locator("use");
    const count = await uses.count();
    const xs: number[] = [];
    for (let i = 0; i < count; i += 1) {
      const box = await uses.nth(i).boundingBox();
      const shape = await uses.nth(i).getAttribute("xlink:href");
      if (box && Number.isFinite(box.x) && box.width > 0 && box.height > 0 && shape?.includes("m")) xs.push(box.x);
    }
    return xs;
  };

  const beforeXs = await transitionXs();
  expect(beforeXs.length).toBeGreaterThan(0);
  const cycle3X = (await ruler.locator("[data-cycle='3']").boundingBox())!.x;
  const cycle4X = (await ruler.locator("[data-cycle='4']").boundingBox())!.x;
  expect(Math.abs(beforeXs[0] - cycle3X)).toBeLessThan(3);

  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  const editor = page.getByTestId("signal-editor");
  const row = editor.locator("form.event-row").nth(1);

  const revisionBeforeType = await page.getByTestId("revision-status").textContent();
  await row.getByLabel("Start 3").fill("4");
  await expect(page.getByTestId("revision-status")).toHaveText(revisionBeforeType!);

  await row.getByRole("button", { name: "Save" }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");

  const afterXs = await transitionXs();
  expect(afterXs.length).toBeGreaterThan(0);
  expect(Math.abs(afterXs[0] - cycle4X)).toBeLessThan(3);
  expect(Math.abs(afterXs[0] - cycle3X)).toBeGreaterThan(10);
});
