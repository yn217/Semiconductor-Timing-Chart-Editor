import { expect, test } from "@playwright/test";
import { startInCycleSample } from "./cycle-startup.js";

startInCycleSample(test);

// GUI/UX Visual Quality Closure -- Inspector spec explicitly names
// "Signal/Bus/Annotation/Bookmark/Transaction/Multi-selection" as the set
// of type-aware Inspector contexts. Multi-selection previously had none:
// selecting 2+ Signals silently rendered the single-signal editor for
// whichever one happened to be `selectedSignal`, with zero indication
// that others were also selected -- editing e.g. Name there only ever
// affected that one signal despite the status bar and Tree both showing
// a real multi-selection. This adds a dedicated summary + bulk-actions
// view, reusing the exact same `selection.visibility`/`selection.delete`
// commands the single-signal Inspector, Ribbon and context menu already
// use for the current selection -- no second bulk-mutation path.

test("Inspector shows a dedicated Multi-Selection view for 2+ Signals, with working bulk Show/Hide/Delete", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  const host = page.getByTestId("cycle-surface");
  const inspector = page.getByTestId("inspector");

  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  await expect(inspector).toHaveAttribute("data-inspector-context", "signal");

  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_ready']").click({ modifiers: ["Control"] });
  await expect(page.getByTestId("selection-status")).toHaveText("2 signals");
  await expect(inspector).toHaveAttribute("data-inspector-context", "multi-selection");
  await expect(inspector).toContainText("2 Signals selected");

  // Bulk Hide All: one atomic History unit, both signals actually hidden.
  const waveOwners = host.locator("[data-role='wave-owner'][data-signal-id='sig_cycle_request'], [data-role='wave-owner'][data-signal-id='sig_cycle_ready']");
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
  await expect(waveOwners).toHaveCount(2);
  await inspector.getByTestId("multi-selection-hide").click();
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await expect(waveOwners).toHaveCount(0);

  await page.getByTestId("ribbon").getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 1");
  await expect(waveOwners).toHaveCount(2);

  // Falling back to a single selection restores the normal Signal Inspector.
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  await expect(inspector).toHaveAttribute("data-inspector-context", "signal");
  await expect(inspector).toContainText("REQUEST");
});

test("Inspector Multi-Selection Delete Selected removes every selected Signal as one atomic operation", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  const host = page.getByTestId("cycle-surface");
  const inspector = page.getByTestId("inspector");

  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_ready']").click({ modifiers: ["Control"] });
  await expect(inspector).toHaveAttribute("data-inspector-context", "multi-selection");

  await expect(page.getByTestId("signal-count-status")).toHaveText("Signals: 8");
  await inspector.getByTestId("multi-selection-delete").click();
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await expect(page.getByTestId("signal-count-status")).toHaveText("Signals: 6");
  await expect(host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']")).toHaveCount(0);
  await expect(host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_ready']")).toHaveCount(0);

  await page.getByTestId("ribbon").getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByTestId("signal-count-status")).toHaveText("Signals: 8");
});

// #431 item 9 ("Signal Tree productivity"): "show only selected" was a
// listed, unimplemented acceptance item. Composes the existing
// `signal.setVisibility` command across the whole document (visible for
// selected, hidden for everyone else) as one atomic batch -- no new
// command or Canonical field, same shape as Show/Hide All above.
test("Inspector Multi-Selection Show Only Selected hides every other Signal as one atomic operation", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  const host = page.getByTestId("cycle-surface");
  const inspector = page.getByTestId("inspector");

  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_ready']").click({ modifiers: ["Control"] });
  await expect(inspector).toHaveAttribute("data-inspector-context", "multi-selection");

  const selectedOwners = host.locator("[data-role='wave-owner'][data-signal-id='sig_cycle_request'], [data-role='wave-owner'][data-signal-id='sig_cycle_ready']");
  const otherOwner = host.locator("[data-role='wave-owner'][data-signal-id='sig_cycle_clock']");
  await expect(selectedOwners).toHaveCount(2);
  await expect(otherOwner).toHaveCount(1);
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");

  await inspector.getByTestId("multi-selection-isolate").click();
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await expect(selectedOwners).toHaveCount(2);
  await expect(otherOwner).toHaveCount(0);

  await page.getByTestId("ribbon").getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 1");
  await expect(otherOwner).toHaveCount(1);
});
