import { expect, test } from "@playwright/test";
import { startInCycleMode } from "./cycle-startup.js";

startInCycleMode(test);

// #402: the Bottom Signal editor gets an explicit Group dropdown + Move
// button. Bottom Panel Visual Reference pass (#402/#426): the Signal
// Properties form (Name/Role/Type/Spacing/Apply) moved to Inspector,
// which is now the sole owner of that Draft/Apply gating -- its own
// Apply button stays disabled until the Draft actually differs from the
// committed Signal, matching the contract Bottom's removed form used to
// have.

test("moves the selected Signal to a Group via the dropdown + Move button, using the real signal.move command", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();

  const editor = page.getByTestId("signal-editor");
  const groupSelect = editor.getByLabel("Signal group", { exact: true });
  await expect(groupSelect).toBeVisible();
  const moveButton = editor.getByTestId("move-signal-to-group");
  // Same Group as current -> Move stays disabled (no-op guard).
  await expect(moveButton).toBeDisabled();

  const beforeHistory = await page.getByTestId("history-status").textContent();
  await groupSelect.selectOption({ label: "Payload" });
  await expect(moveButton).toBeEnabled();
  await moveButton.click();
  await expect(page.getByTestId("history-status")).not.toHaveText(beforeHistory!);
  // REQUEST now belongs to Payload -- confirmed via the real signal.move
  // command's effect on canonical group membership (the dropdown re-reads
  // the live document every render, so its own "(current)" marker moving
  // to Payload is direct evidence the move actually happened, not just
  // that a History entry was produced by *something*).
  await expect(groupSelect.locator("option", { hasText: "Payload (current)" })).toHaveCount(1);
  await expect(groupSelect.locator("option", { hasText: "Control (current)" })).toHaveCount(0);

  // Undo restores REQUEST to Control (its original Group).
  await editor.getByTestId("editor-undo").click();
  await expect(groupSelect.locator("option", { hasText: "Control (current)" })).toHaveCount(1);
});

test("Inspector Signal Properties Apply stays disabled until the Draft actually differs from the committed Signal", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();

  const inspector = page.getByTestId("inspector");
  const applyButton = inspector.getByTestId("apply-inspector-signal");
  await expect(applyButton).toBeDisabled();

  const beforeRevision = await host.getAttribute("data-canonical-revision");
  await inspector.getByLabel("Inspector signal role").selectOption("output");
  await expect(host).toHaveAttribute("data-canonical-revision", beforeRevision!);
  await expect(applyButton).toBeEnabled();

  await applyButton.click();
  await expect(host).not.toHaveAttribute("data-canonical-revision", beforeRevision!);
  await expect(applyButton).toBeDisabled();
});
