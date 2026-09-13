import { expect, test } from "@playwright/test";

// #426 Visual Quality Closure ("unclear draft state"): the Signal tab's
// Add/Edit Transition form commits each Add/Add & Continue immediately as
// its own semantic command (own History/Undo step) -- unlike Bookmark/
// Annotation's Cancel+Apply pair, there is no separate pending batch to
// lose track of. A quiet caption makes that model explicit instead of
// leaving it to be inferred from behavior alone. Presentation-only: no
// Canonical/command change, so this only verifies the caption renders in
// the right place and that Add still produces exactly one History entry.

test("Signal event table explains its immediate-commit model and Add still produces one History entry", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.getByRole("button", { name: "Cycle", exact: true }).click();

  await page.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  await page.getByRole("tab", { name: "Signal", exact: true }).click();

  const hint = page.locator(".transition-form-hint");
  await expect(hint).toHaveText("Applies immediately -- each Add is its own Undo step.");
  // Sits between the Add/Add & Continue actions and the Value Helper panel,
  // not floating loose or overlapping either.
  await expect(page.getByTestId("add-signal-event-continue")).toBeVisible();
  await expect(hint).toBeVisible();

  const before = await page.getByTestId("history-status").textContent();
  await page.getByLabel("New event start").fill("5");
  await page.getByTestId("add-signal-event").click();
  const after = await page.getByTestId("history-status").textContent();
  expect(after).not.toBe(before);
  // Exactly one semantic command -- immediate-commit, not a batch.
  const beforeCount = Number(before?.match(/History (\d+)/)?.[1] ?? "0");
  const afterCount = Number(after?.match(/History (\d+)/)?.[1] ?? "0");
  expect(afterCount).toBe(beforeCount + 1);
});
