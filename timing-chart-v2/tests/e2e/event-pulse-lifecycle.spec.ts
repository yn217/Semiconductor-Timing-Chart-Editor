import { expect, test } from "@playwright/test";

test("creates, edits, undoes, persists and exports Event and Pulse signals", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await host.getByLabel("Select Payload group").click();

  await page.locator(".ribbon-tabs").getByRole("button", { name: "Insert", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Event", exact: true }).click();
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await page.getByTestId("ribbon").getByRole("button", { name: "Pulse", exact: true }).click();
  await expect(page.getByTestId("history-status")).toHaveText("History 2 / Redo 0");

  const eventRow = host.locator("[data-role='left-row'][data-name='EVENT_9']");
  const pulseRow = host.locator("[data-role='left-row'][data-name='PULSE_10']");
  await expect(eventRow).toHaveCount(1);
  await expect(pulseRow).toHaveCount(1);
  await expect(host.locator("[data-role='timing-row'][data-name='EVENT_9']")).toHaveCount(1);
  await expect(host.locator("[data-role='timing-row'][data-name='PULSE_10']")).toHaveCount(1);

  await eventRow.click();
  const editor = page.getByTestId("signal-editor");
  await expect(editor).toContainText("EVENT_9 · event");
  await editor.locator("form.event-row").first().getByLabel("Value 0").fill("RISE");
  await editor.locator("form.event-row").first().getByRole("button", { name: "Save" }).click();
  await expect(page.getByTestId("history-status")).toHaveText("History 3 / Redo 0");

  await pulseRow.click();
  await expect(editor).toContainText("PULSE_10 · pulse");
  await editor.locator("form.event-row").first().getByLabel("Value 0").fill("1");
  await editor.locator("form.event-row").first().getByRole("button", { name: "Save" }).click();
  await expect(page.getByTestId("history-status")).toHaveText("History 4 / Redo 0");

  await page.getByTestId("editor-undo").click();
  await page.getByTestId("editor-undo").click();
  await expect(page.getByTestId("history-status")).toHaveText("History 2 / Redo 2");
  await page.getByTestId("editor-redo").click();
  await page.getByTestId("editor-redo").click();
  await expect(page.getByTestId("history-status")).toHaveText("History 4 / Redo 0");

  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  const saveDownload = page.waitForEvent("download");
  await page.getByTestId("ribbon").getByRole("button", { name: "Save", exact: true }).click();
  const savedPath = await (await saveDownload).path();
  expect(savedPath).toBeTruthy();
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(savedPath!);
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
  await expect(host.locator("[data-role='timing-row'][data-name='EVENT_9']")).toHaveCount(1);
  await page.getByRole("tab", { name: "JSON", exact: true }).click();
  await expect(page.getByTestId("json-panel").locator("pre")).toContainText("PULSE_10");

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

test("creates Event and Pulse directly from the Left Tree add menu", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await host.locator("[data-role='left-group-header'][data-group-id='grp_cycle_payload'] [data-role='tree-branch']").click();
  const add = page.getByRole("button", { name: "Add signal or group" });
  await add.click();
  await page.getByRole("menu", { name: "Add signal or group" }).getByRole("menuitem", { name: "Event", exact: true }).click();
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await expect(host.locator("[data-role='left-row'][data-name^='EVENT_']")).toHaveCount(1);

  await add.click();
  await page.getByRole("menu", { name: "Add signal or group" }).getByRole("menuitem", { name: "Pulse", exact: true }).click();
  await expect(page.getByTestId("history-status")).toHaveText("History 2 / Redo 0");
  await expect(host.locator("[data-role='left-row'][data-name^='PULSE_']")).toHaveCount(1);
  await expect(host.locator("[data-role='timing-row'][data-name^='EVENT_']")).toHaveCount(1);
  await expect(host.locator("[data-role='timing-row'][data-name^='PULSE_']")).toHaveCount(1);
  await expect(host).toHaveAttribute("data-canonical-revision", "2");
});
