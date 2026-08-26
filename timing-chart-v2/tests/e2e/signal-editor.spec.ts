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
  await expect(surface.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request'] [data-role='signal-role']")).toHaveText("OUTPUT");
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
      if (box && box.width > 22) xs.push(box.x);
    }
    return xs;
  };

  const beforeXs = await transitionXs();
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
  expect(Math.abs(afterXs[0] - cycle4X)).toBeLessThan(3);
  expect(Math.abs(afterXs[0] - cycle3X)).toBeGreaterThan(10);
});
