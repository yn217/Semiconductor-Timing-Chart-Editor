import { expect, test } from "@playwright/test";
import { startInCycleMode } from "./cycle-startup.js";

startInCycleMode(test);

async function ready(page: import("@playwright/test").Page) {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
}

// #211: Undo/Redo must preserve compatible transient editing context --
// specifically, selected stable object ID(s) across a Delete/Undo/Redo
// cycle. Canonical restoration alone (the row comes back) is not
// sufficient UX parity if the selection doesn't follow it.
test("Delete Undo restores selection to the recreated Signal; Redo clears it again without a stale reference", async ({ page }) => {
  await ready(page);
  const host = page.getByTestId("cycle-surface");
  const row = host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']");
  await row.click();
  await expect(page.getByTestId("selection-status")).toHaveText("REQUEST");
  const ribbon = page.getByTestId("ribbon");
  await ribbon.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByTestId("selection-status")).toHaveText("None");
  await expect(row).toHaveCount(0);
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");

  await ribbon.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 1");
  await expect(row).toBeVisible();
  await expect(page.getByTestId("selection-status")).toHaveText("REQUEST");

  await ribbon.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await expect(row).toHaveCount(0);
  // No stale reference to the just-redeleted signal.
  await expect(page.getByTestId("selection-status")).toHaveText("None");
});

test("Rename Undo keeps the same Signal selected (name reverts, selection does not move)", async ({ page }) => {
  await ready(page);
  const host = page.getByTestId("cycle-surface");
  const row = host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']");
  await row.click();
  await expect(page.getByTestId("selection-status")).toHaveText("REQUEST");
  const ribbon = page.getByTestId("ribbon");
  await ribbon.getByRole("button", { name: "More", exact: true }).click();
  await page.getByRole("menu", { name: "More Home Commands" }).getByRole("menuitem", { name: "Rename", exact: true }).click();
  const dialog = page.getByTestId("rename-dialog");
  await dialog.getByRole("textbox").fill("RENAMED_REQUEST");
  await dialog.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.getByTestId("selection-status")).toHaveText("RENAMED_REQUEST");
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");

  await ribbon.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 1");
  await expect(page.getByTestId("selection-status")).toHaveText("REQUEST");
  await expect(row).toBeVisible();
});

test("an unrelated Undo/Redo does not touch a selection it has nothing to do with", async ({ page }) => {
  await ready(page);
  const host = page.getByTestId("cycle-surface");
  const ribbon = page.getByTestId("ribbon");
  // Perform an edit unrelated to selection (insert a cycle), then select a
  // signal, then Undo the timeline edit -- the signal selection must survive
  // since the undone command never touched that signal.
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Timeline", exact: true }).click();
  const timeline = page.getByTestId("timeline-editor");
  await timeline.getByLabel("Timeline insert count").fill("1");
  await timeline.getByRole("button", { name: "Insert before" }).click();
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Home", exact: true }).click();
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_ready']").click();
  await expect(page.getByTestId("selection-status")).toHaveText("READY");
  await ribbon.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 1");
  await expect(page.getByTestId("selection-status")).toHaveText("READY");
});
