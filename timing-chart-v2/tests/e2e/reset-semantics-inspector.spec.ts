import { expect, test } from "@playwright/test";

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
