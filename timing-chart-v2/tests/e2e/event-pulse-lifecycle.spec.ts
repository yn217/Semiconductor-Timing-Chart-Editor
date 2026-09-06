import { expect, test } from "@playwright/test";
import type { CanonicalDocument, GroupId, SignalId } from "@timing-chart-v2/schema";
import { canonicalFixture } from "../fixtures/canonical.js";

// #400: Pulse is no longer an independently creatable Signal type -- the
// Insert Ribbon and Left Tree Add menu never offer it (see the dedicated
// test below), and Signal Generator now owns single/finite/periodic pulse
// production. `type: "pulse"` remains fully supported for any document that
// already has it: it must load, render, stay editable through the exact
// same Bottom Editor Event Table every other value Signal uses, and persist
// through Undo/Redo/Save-Open/export unchanged. This file's fixture-loading
// helper exercises that legacy path instead of the now-removed creation UI.
function pulseFixture(): CanonicalDocument {
  const base = canonicalFixture();
  const pulseId = "sig_legacy_pulse" as SignalId;
  const pulse = {
    id: pulseId, name: "PULSE_LEGACY", type: "pulse" as const, role: "internal" as const,
    source: { instancePath: [], signalName: "PULSE_LEGACY" }, display: { name: "PULSE_LEGACY" },
    values: [{ start: 0, value: 0 }, { start: 3, value: 1 }, { start: 4, value: 0 }],
  };
  return {
    ...base,
    signals: [...base.signals, pulse],
    signalGroups: [{ ...base.signalGroups[0]!, rows: [...base.signalGroups[0]!.rows, pulseId] }],
  };
}

test("Insert Ribbon and Left Tree Add menu never offer Pulse; Event is still a real creatable Signal type", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await host.getByLabel("Select Payload group").click();

  await page.locator(".ribbon-tabs").getByRole("button", { name: "Insert", exact: true }).click();
  const ribbon = page.getByTestId("ribbon");
  await expect(ribbon.getByRole("button", { name: "Pulse", exact: true })).toHaveCount(0);
  await expect(ribbon.getByRole("button", { name: "Level", exact: true })).toBeVisible();
  await ribbon.getByRole("button", { name: "Event", exact: true }).click();
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");

  const eventRow = host.locator("[data-role='left-row'][data-name='EVENT_9']");
  await expect(eventRow).toHaveCount(1);
  await expect(host.locator("[data-role='timing-row'][data-name='EVENT_9']")).toHaveCount(1);

  await eventRow.click();
  const editor = page.getByTestId("signal-editor");
  await expect(editor).toContainText("EVENT_9 · event");
  await editor.locator("form.event-row").first().getByLabel("Value 0").fill("RISE");
  await editor.locator("form.event-row").first().getByRole("button", { name: "Save" }).click();
  await expect(page.getByTestId("history-status")).toHaveText("History 2 / Redo 0");

  await page.getByTestId("editor-undo").click();
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 1");
  await page.getByTestId("editor-redo").click();
  await expect(page.getByTestId("history-status")).toHaveText("History 2 / Redo 0");

  await page.getByRole("button", { name: "Add signal or group" }).click();
  const addMenu = page.getByRole("menu", { name: "Add signal or group" });
  await expect(addMenu.getByRole("menuitem", { name: "Pulse", exact: true })).toHaveCount(0);
  await expect(addMenu.getByRole("menuitem", { name: "Level", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
});

test("loads, edits, persists and exports a legacy Pulse Signal without breaking it", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");

  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "legacy-pulse.tcd", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(pulseFixture())) });
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  const pulseRow = host.locator("[data-role='left-row'][data-name='PULSE_LEGACY']");
  await expect(pulseRow).toHaveCount(1);
  await expect(host.locator("[data-role='timing-row'][data-name='PULSE_LEGACY']")).toHaveCount(1);

  await pulseRow.click();
  const editor = page.getByTestId("signal-editor");
  await expect(editor).toContainText("PULSE_LEGACY · pulse");
  // The Bottom Editor's own Type field must show the legacy value truthfully
  // (not silently drop it), while never offering it as a choice elsewhere
  // (see the previous test for the creation-surface assertions).
  await expect(editor.getByLabel("Signal type")).toHaveValue("pulse");

  await editor.locator("form.event-row").first().getByLabel("Value 0").fill("1");
  await editor.locator("form.event-row").first().getByRole("button", { name: "Save" }).click();
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await page.getByTestId("editor-undo").click();
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 1");
  await page.getByTestId("editor-redo").click();
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");

  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  const saveDownload = page.waitForEvent("download");
  await page.getByTestId("ribbon").getByRole("button", { name: "Save", exact: true }).click();
  const savedPath = await (await saveDownload).path();
  expect(savedPath).toBeTruthy();
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(savedPath!);
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
  await expect(host.locator("[data-role='timing-row'][data-name='PULSE_LEGACY']")).toHaveCount(1);
  await page.getByRole("tab", { name: "JSON", exact: true }).click();
  await expect(page.getByTestId("json-panel").locator("pre")).toContainText("PULSE_LEGACY");
  await expect(page.getByTestId("json-panel").locator("pre")).toContainText(/"type"\s*:\s*"pulse"/);

  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  const exportDialog = async (format: "svg" | "png" | "pdf") => {
    await page.getByTestId("ribbon").getByRole("button", { name: "Export", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Export Timing Chart" });
    await dialog.getByLabel("Export format").selectOption(format);
    const download = page.waitForEvent("download");
    await dialog.getByRole("button", { name: `Export ${format.toUpperCase()}`, exact: true }).click();
    expect(await (await download).path()).toBeTruthy();
    await dialog.getByRole("button", { name: "Close export", exact: true }).click();
  };
  await exportDialog("svg");
  await exportDialog("png");
  await exportDialog("pdf");
});
