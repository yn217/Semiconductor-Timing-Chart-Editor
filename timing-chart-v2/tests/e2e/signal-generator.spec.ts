import { expect, test } from "@playwright/test";

// #400: Signal Generator produces single/finite/periodic pulses, computed
// once into the Signal's ordinary `values` array through the same command
// the Manual Event Table already uses. Bottom Panel Visual Reference pass
// (#402/#426): Generator is no longer a Manual/Generator *tab* choice --
// it renders as an always-visible "Generate Waveform" side panel next to
// Add/Edit Transition and Value Helper (EventTable's `generatorSlot`),
// scoped to canonical type `binary` ("Signal") only, matching #400's own
// scope.

async function jsonValues(page: import("@playwright/test").Page, signalId: string): Promise<readonly { start: number; value: number }[]> {
  await page.getByRole("tab", { name: "JSON", exact: true }).click();
  const text = await page.getByTestId("json-panel").locator("pre").textContent();
  const document_ = JSON.parse(text!) as { signals: readonly { id: string; values?: readonly { start: number; value: number }[] }[] };
  return document_.signals.find((signal) => signal.id === signalId)?.values ?? [];
}

test("Generate Waveform computes a single pulse into the Signal's ordinary values, undoable and Save/Open-stable", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  const editor = page.getByTestId("signal-editor");
  const originalValues = await jsonValues(page, "sig_cycle_request");
  await page.getByRole("tab", { name: "Signal", exact: true }).click();

  await editor.getByLabel("Signal generator start").fill("2");
  const before = { revision: await host.getAttribute("data-canonical-revision"), history: await page.getByTestId("history-status").textContent() };
  await editor.getByTestId("apply-signal-generator").click();
  await expect(host).toHaveAttribute("data-canonical-revision", String(Number(before.revision) + 1));
  await expect(page.getByTestId("history-status")).not.toHaveText(before.history!);

  expect(await jsonValues(page, "sig_cycle_request")).toEqual([{ start: 0, value: 0 }, { start: 2, value: 1 }, { start: 3, value: 0 }]);

  await page.locator(".ribbon-tabs").getByRole("button", { name: "Home", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Undo", exact: true }).click();
  expect(await jsonValues(page, "sig_cycle_request")).toEqual(originalValues);
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Home", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Redo", exact: true }).click();
  expect(await jsonValues(page, "sig_cycle_request")).toEqual([{ start: 0, value: 0 }, { start: 2, value: 1 }, { start: 3, value: 0 }]);

  const saveDownload = page.waitForEvent("download");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Save", exact: true }).click();
  const savedPath = await (await saveDownload).path();
  expect(savedPath).toBeTruthy();
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(savedPath!);
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  expect(await jsonValues(page, "sig_cycle_request")).toEqual([{ start: 0, value: 0 }, { start: 2, value: 1 }, { start: 3, value: 0 }]);
});

test("Generator supports an infinite periodic pulse train and suppressed periods, and rejects an invalid Width/Period without mutation", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  const editor = page.getByTestId("signal-editor");

  await editor.getByLabel("Signal generator repeat mode").selectOption("infinite");
  await editor.getByLabel("Signal generator period").fill("4");
  // Density fix (#402/#426 follow-up): Suppressed periods lives behind the
  // "Advanced" disclosure toggle now (see signal-generator-editor.tsx) --
  // open it before reaching for the field.
  await editor.getByTestId("signal-generator-advanced-toggle").click();
  await editor.getByLabel("Signal generator suppressed periods").fill("1");
  await editor.getByTestId("apply-signal-generator").click();
  await expect(host).toHaveAttribute("data-canonical-revision", "1");
  const values = await jsonValues(page, "sig_cycle_request");
  // Index 0 -> pulse at 0 (overrides the initial=0 point); index 1
  // suppressed -> nothing at 4; index 2 -> pulse at 8; and so on until the
  // document's own cycle count (24 for the default fixture).
  expect(values.map((change) => change.start)).toEqual([0, 1, 8, 9, 12, 13, 16, 17, 20, 21]);

  // A successful Generate advances the canonical revision, which remounts
  // the whole Bottom Editor (same convention every other Bottom Editor tab
  // already follows) -- the Generate Waveform panel's own Draft resets to
  // its defaults, same as every other Draft field in the Bottom Panel.
  await page.getByRole("tab", { name: "Signal", exact: true }).click();
  await editor.getByLabel("Signal generator repeat mode").selectOption("finite");
  await editor.getByLabel("Signal generator width", { exact: true }).fill("4");
  await editor.getByLabel("Signal generator period").fill("4");
  const beforeRejected = { revision: await host.getAttribute("data-canonical-revision"), history: await page.getByTestId("history-status").textContent() };
  await editor.getByTestId("apply-signal-generator").click();
  await expect(editor.getByTestId("signal-generator-error")).toContainText("Width");
  await expect(host).toHaveAttribute("data-canonical-revision", beforeRejected.revision!);
  await expect(page.getByTestId("history-status")).toHaveText(beforeRejected.history!);
});

test("Duty mode computes Width from Period, and Generate Waveform is only offered for a Signal (binary), never Level/Bus/State/Event", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  const editor = page.getByTestId("signal-editor");
  await editor.getByLabel("Signal generator width mode").selectOption("duty");
  await editor.getByLabel("Signal generator period").fill("10");
  await editor.getByLabel("Signal generator duty").fill("0.3");
  await editor.getByTestId("apply-signal-generator").click();
  await expect(host).toHaveAttribute("data-canonical-revision", "1");
  // Width = round(0.3 * 10) = 3; Start defaults to 0, so the single pulse
  // (repeat defaults to a count of 1) runs [0, 3).
  expect(await jsonValues(page, "sig_cycle_request")).toEqual([{ start: 0, value: 1 }, { start: 3, value: 0 }]);

  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_data']").click();
  await expect(editor).toContainText("DATA[7:0] · Bus");
  await expect(editor.getByTestId("apply-signal-generator")).toHaveCount(0);
});

test("#402: Generate stays disabled once the computed Draft matches the Signal's current values", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  const editor = page.getByTestId("signal-editor");
  const generate = editor.getByTestId("apply-signal-generator");

  await editor.getByLabel("Signal generator start").fill("2");
  await expect(generate).toBeEnabled();
  await expect(editor.getByTestId("signal-generator-unapplied")).toBeVisible();
  await generate.click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");

  // Applying Generate remounts the whole Bottom Editor (canonical revision
  // bump, same convention every other Bottom Editor tab already follows),
  // resetting the Draft back to its defaults (start=0) -- re-entering the
  // exact params that produced the Signal's current committed values must
  // then disable Generate again, with no second History entry created.
  await editor.getByLabel("Signal generator start").fill("2");
  await expect(generate).toBeDisabled();
  await expect(editor.getByTestId("signal-generator-unapplied")).toHaveCount(0);
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
});
