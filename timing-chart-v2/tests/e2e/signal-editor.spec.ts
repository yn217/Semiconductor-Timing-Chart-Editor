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
