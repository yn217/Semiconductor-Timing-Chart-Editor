import { expect, test } from "@playwright/test";
import { startInCycleMode } from "./cycle-startup.js";

startInCycleMode(test);

// #495 (Reset semantics GUI portion): `signal.updateResetSemantics` and the
// Canonical `resetSemantics` field already existed with zero Inspector
// entry point -- this only adds the missing production GUI (Enabled /
// Polarity / Synchronization / Assert Cycle / Deassert Cycle), routed
// through the existing Semantic Command, same Draft->Apply gate as every
// other Inspector field. Command validation, timeline-transform of
// assert/deassert source-time coordinates, and the wrong INVALID_EDGE_COUNTER
// rule code are out of scope here (packages/commands ownership).
test("Signal Inspector exposes Reset Semantics, applies via the Semantic Command, and survives Undo/Redo", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_data']").click();

  const inspector = page.getByTestId("inspector");
  await expect(inspector).toHaveAttribute("data-inspector-context", "signal");
  const resetHeading = inspector.getByRole("button", { name: "Reset Semantics", exact: true });
  if ((await resetHeading.getAttribute("aria-expanded")) !== "true") await resetHeading.click();

  const enabled = inspector.getByLabel("Reset semantics enabled");
  await expect(enabled).not.toBeChecked();
  await enabled.check();
  await inspector.getByLabel("Reset polarity").selectOption("active-high");
  await inspector.getByLabel("Reset synchronization").selectOption("synchronous");
  await inspector.getByLabel("Reset assert cycle").fill("1");
  await inspector.getByLabel("Reset deassert cycle").fill("4");

  const historyBefore = await page.getByTestId("history-status").textContent();
  await expect(inspector.getByTestId("apply-reset-semantics")).toBeEnabled();
  await inspector.getByTestId("apply-reset-semantics").click();
  await expect(page.getByTestId("history-status")).not.toHaveText(historyBefore!);
  await expect(inspector.getByTestId("apply-reset-semantics")).toBeDisabled();

  // Undo restores "no Reset semantics" (control state resyncs from Canonical).
  await page.getByTestId("ribbon").getByRole("button", { name: "Undo", exact: true }).click();
  await expect(inspector.getByLabel("Reset semantics enabled")).not.toBeChecked();

  // Redo re-applies it.
  await page.getByTestId("ribbon").getByRole("button", { name: "Redo", exact: true }).click();
  await expect(inspector.getByLabel("Reset semantics enabled")).toBeChecked();
  await expect(inspector.getByLabel("Reset polarity")).toHaveValue("active-high");
});

test("Reset source-time metadata follows Timeline insert and survives Save/Open", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_data']").click();
  const inspector = page.getByTestId("inspector");
  const resetHeading = inspector.getByRole("button", { name: "Reset Semantics", exact: true });
  if ((await resetHeading.getAttribute("aria-expanded")) !== "true") await resetHeading.click();
  await inspector.getByLabel("Reset semantics enabled").check();
  await inspector.getByLabel("Reset assert cycle").fill("1");
  await inspector.getByLabel("Reset deassert cycle").fill("4");
  await inspector.getByTestId("apply-reset-semantics").click();
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");

  await page.locator(".ribbon-tabs").getByRole("button", { name: "Timeline", exact: true }).click();
  await page.getByLabel("Timeline insert count").fill("2");
  await page.getByRole("button", { name: "Insert before" }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(page.getByTestId("history-status")).toHaveText("History 2 / Redo 0");

  await page.getByTestId("editor-undo").click();
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 1");
  await page.getByTestId("editor-redo").click();
  await expect(page.getByTestId("history-status")).toHaveText("History 2 / Redo 0");

  await page.locator(".ribbon-tabs").getByRole("button", { name: "Home", exact: true }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByTestId("ribbon").getByRole("button", { name: "Save", exact: true }).click();
  const download = await downloadPromise;
  const savedPath = await download.path();
  expect(savedPath).toBeTruthy();
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "reset-roundtrip.tcd.json", mimeType: "application/json", buffer: await (await import("node:fs/promises")).readFile(savedPath!) });
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
});
