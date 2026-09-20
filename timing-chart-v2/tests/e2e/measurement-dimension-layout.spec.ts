import { expect, test } from "@playwright/test";
import { startInCycleMode } from "./cycle-startup.js";

startInCycleMode(test);

// #205: Dimension-style visual closure for Measurement -- independent
// start/end markers, inward/outward/auto arrow layout, and extension
// lines must each have a real, observable rendered effect through the
// production Inspector -> SemanticCommand -> renderer path (not just a
// stored, unused property), commit as exactly one History unit, and
// survive Undo/Redo and Save/Open exactly.

test("Measurement start/end markers, arrow layout and extension lines have real rendered effect, one History unit per Apply, and survive Undo/Redo + Save/Open", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  // Start from a blank document -- the reload-persisted default document
  // ships its own pre-existing showcase Measurement annotation which
  // would otherwise interfere with locator counts below.
  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "New", exact: true }).click();
  await page.getByTestId("unsaved-discard").click({ timeout: 2000 }).catch(() => {});
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();

  await page.locator(".ribbon-tabs").getByRole("button", { name: "Annotation", exact: true }).click();
  await page.getByLabel("Annotation type").selectOption("measurement");
  await page.getByRole("button", { name: "Add annotation" }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");

  const owner = host.locator("[data-role='annotation-owner'][data-annotation-type='measurement']");
  await expect(owner).toHaveCount(1);

  // Defaults: bar/bar/auto/both.
  await expect(owner.locator("[data-role='measurement-marker'][data-marker-side='start']")).toHaveAttribute("data-marker-kind", "bar");
  await expect(owner.locator("[data-role='measurement-marker'][data-marker-side='end']")).toHaveAttribute("data-marker-kind", "bar");
  await expect(owner.locator("[data-role='measurement-extension'][data-extension-side='start']")).toHaveCount(1);
  await expect(owner.locator("[data-role='measurement-extension'][data-extension-side='end']")).toHaveCount(1);

  const historyBefore = await page.getByTestId("history-status").textContent();

  const editor = page.getByTestId("annotation-editor");
  await editor.getByLabel("Measurement start marker").selectOption("arrow");
  await editor.getByLabel("Measurement end marker").selectOption("none");
  await editor.getByLabel("Measurement arrow layout").selectOption("inward");
  await editor.getByLabel("Measurement extension lines").selectOption("start");
  await editor.getByTestId("apply-measurement-semantics").click();

  // Exactly one History unit for this Apply, despite four field changes.
  await expect(page.getByTestId("history-status")).not.toHaveText(historyBefore!);
  const historyAfterApply = await page.getByTestId("history-status").textContent();

  // Real rendered effect: start marker is now an arrow, end marker is gone
  // (kind "none" renders nothing), arrow layout is inward, only the start
  // extension line remains.
  await expect(owner.locator("[data-role='measurement-marker'][data-marker-side='start']")).toHaveAttribute("data-marker-kind", "arrow");
  await expect(owner.locator("[data-role='measurement-marker'][data-marker-side='start']")).toHaveAttribute("data-arrow-layout", "inward");
  await expect(owner.locator("[data-role='measurement-marker'][data-marker-side='end']")).toHaveCount(0);
  await expect(owner.locator("[data-role='measurement-extension'][data-extension-side='start']")).toHaveCount(1);
  await expect(owner.locator("[data-role='measurement-extension'][data-extension-side='end']")).toHaveCount(0);

  // Undo restores the exact prior rendered state in one step. Undoing
  // necessarily increments the Redo count, so compare the History depth
  // only, not the full "History N / Redo M" string.
  const historyDepth = (text: string) => text.match(/History (\d+)/)?.[1];
  await page.getByTestId("editor-undo").click();
  await expect.poll(() => page.getByTestId("history-status").textContent().then((text) => historyDepth(text ?? ""))).toBe(historyDepth(historyBefore!));
  await expect(owner.locator("[data-role='measurement-marker'][data-marker-side='start']")).toHaveAttribute("data-marker-kind", "bar");
  await expect(owner.locator("[data-role='measurement-marker'][data-marker-side='end']")).toHaveAttribute("data-marker-kind", "bar");
  await expect(owner.locator("[data-role='measurement-extension'][data-extension-side='end']")).toHaveCount(1);

  // Redo re-applies the exact same change.
  await page.getByTestId("editor-redo").click();
  await expect(page.getByTestId("history-status")).toHaveText(historyAfterApply!);
  await expect(owner.locator("[data-role='measurement-marker'][data-marker-side='start']")).toHaveAttribute("data-marker-kind", "arrow");
  await expect(owner.locator("[data-role='measurement-marker'][data-marker-side='end']")).toHaveCount(0);

  // Save/Open round trip preserves the applied layout exactly.
  const downloadPromise = page.waitForEvent("download");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Save", exact: true }).click();
  const download = await downloadPromise;
  const savedPath = await download.path();
  await page.getByTestId("ribbon").getByRole("button", { name: "New", exact: true }).click();
  await page.getByTestId("unsaved-discard").click({ timeout: 2000 }).catch(() => {});
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(savedPath!);
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  const reopenedOwner = host.locator("[data-role='annotation-owner'][data-annotation-type='measurement']");
  await expect(reopenedOwner).toHaveCount(1);
  await expect(reopenedOwner.locator("[data-role='measurement-marker'][data-marker-side='start']")).toHaveAttribute("data-marker-kind", "arrow");
  await expect(reopenedOwner.locator("[data-role='measurement-marker'][data-marker-side='start']")).toHaveAttribute("data-arrow-layout", "inward");
  await expect(reopenedOwner.locator("[data-role='measurement-marker'][data-marker-side='end']")).toHaveCount(0);
  await expect(reopenedOwner.locator("[data-role='measurement-extension'][data-extension-side='start']")).toHaveCount(1);
  await expect(reopenedOwner.locator("[data-role='measurement-extension'][data-extension-side='end']")).toHaveCount(0);
});
