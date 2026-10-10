import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { startInCycleMode } from "./cycle-startup.js";

startInCycleMode(test);

async function ready(page: import("@playwright/test").Page) {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
}

test("Bulk Registration requires a strict preview and infers bus width", async ({ page }) => {
  await ready(page);
  const host = page.getByTestId("cycle-surface");
  await page.getByRole("button", { name: "Add signal or group" }).click();
  await page.getByTestId("create-group").click();
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await page.getByRole("button", { name: "Add signal or group" }).click();
  await page.getByTestId("bulk-register-open").click();
  const dialog = page.getByRole("dialog", { name: "Bulk Signal Registration" });
  await dialog.getByLabel("Bulk signal definitions").fill("dut.core.status binary\ndut.core.payload[31:0] bus");
  await expect(dialog.getByTestId("bulk-register-apply")).toBeDisabled();
  await dialog.getByTestId("bulk-register-preview-button").click();
  await expect(dialog.getByTestId("bulk-register-preview")).toContainText("width 32");
  await dialog.getByTestId("bulk-register-path-filter").fill("payload");
  await expect(dialog.getByLabel("Register dut.core.status")).toHaveCount(0);
  await expect(dialog.getByLabel("Register dut.core.payload[31:0]")).toBeVisible();
  await dialog.getByTestId("bulk-register-path-filter").fill("");
  await dialog.getByLabel("Register dut.core.status").uncheck();
  await expect(dialog.getByTestId("bulk-register-preview")).toContainText("Ready to register 1 of 2 signals");
  await expect(dialog.getByTestId("bulk-register-apply")).toBeEnabled();
  await dialog.getByTestId("bulk-register-apply").click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(page.getByTestId("history-status")).toHaveText("History 2 / Redo 0");
  const save = async () => {
    await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
    const download = page.waitForEvent("download");
    await page.getByTestId("ribbon").getByRole("button", { name: "Save", exact: true }).click();
    const path = (await download).path();
    return { path: await path, document: JSON.parse(await readFile((await path)!, "utf8")) };
  };
  const firstSave = await save();
  const savedBus = firstSave.document.signals.find((signal: { source?: { signalName?: string } }) => signal.source?.signalName === "payload");
  expect(savedBus.source).toMatchObject({ instancePath: ["dut", "core"], signalName: "payload", msb: 31, lsb: 0 });
  expect(firstSave.document.signalGroups.find((group: { rows: string[] }) => group.rows.includes(savedBus.id))?.name).toMatch(/^Group \d+$/);
  expect(firstSave.document.signals.some((signal: { source?: { signalName?: string } }) => signal.source?.signalName === "status")).toBe(false);
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(firstSave.path!);
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await page.getByRole("button", { name: "More tree actions" }).click();
  await page.getByTestId("hierarchy-open").click();
  const hierarchy = page.getByTestId("hierarchy-browser");
  await hierarchy.getByTestId("hierarchy-path-search").fill("dut.core.payload[31:0]");
  await expect(hierarchy.locator("[data-hierarchy-row-id]")).toHaveCount(1);
  await expect(hierarchy.locator("[data-hierarchy-row-id]")).toContainText("payload[31:0]");
  await hierarchy.getByRole("button", { name: "Close hierarchy" }).click();
  const reopenedSave = await save();
  const reopenedBus = reopenedSave.document.signals.find((signal: { source?: { signalName?: string } }) => signal.source?.signalName === "payload");
  expect(reopenedBus.source).toMatchObject({ instancePath: ["dut", "core"], signalName: "payload", msb: 31, lsb: 0 });
  expect(reopenedBus.id).toBe(firstSave.document.signals.find((signal: { source?: { signalName?: string } }) => signal.source?.signalName === "payload").id);
});

test("Bulk Registration preview rejects unknown types and duplicate paths without mutation", async ({ page }) => {
  await ready(page);
  const host = page.getByTestId("cycle-surface");
  await page.getByRole("button", { name: "Add signal or group" }).click();
  await page.getByTestId("bulk-register-open").click();
  const dialog = page.getByRole("dialog", { name: "Bulk Signal Registration" });
  const beforeRevision = await page.getByTestId("revision-status").textContent();
  const beforeHistory = await page.getByTestId("history-status").textContent();
  await dialog.getByLabel("Bulk signal definitions").fill("dut.bad.signal buss\ndut.new.signal binary\ndut.new.signal binary");
  await dialog.getByTestId("bulk-register-preview-button").click();
  await expect(dialog.getByTestId("bulk-register-preview")).toContainText("unsupported signal type 'buss'");
  await expect(dialog.getByTestId("bulk-register-preview")).toContainText("duplicate signal path 'dut.new.signal'");
  await expect(dialog.getByTestId("bulk-register-apply")).toBeDisabled();
  await expect(page.getByTestId("revision-status")).toHaveText(beforeRevision!);
  await expect(page.getByTestId("history-status")).toHaveText(beforeHistory!);
  await expect(host.locator("[data-full-path='dut.new.signal']")).toHaveCount(0);
});
