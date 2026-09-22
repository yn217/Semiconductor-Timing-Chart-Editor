import { expect, test } from "@playwright/test";

// #776 Part A: Applying Reset Semantics on a Value Signal must not discard an unrelated unapplied Properties draft.
test("Apply Reset Semantics does not discard an unapplied Signal name draft", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  const host = page.getByTestId("cycle-surface");
  await host.locator("[data-role='frozen-row']").first().click();
  const inspector = page.getByTestId("inspector");
  await expect(inspector).toBeVisible();
  const history = await page.getByTestId("history-status").innerText();

  const nameField = inspector.getByLabel("Inspector signal name");
  await nameField.fill("DRAFT_NAME");

  const resetToggle = inspector.getByLabel("Reset semantics enabled");
  if (await resetToggle.count() === 0) test.skip(true, "Reset Semantics control not present on this Signal type");
  await inspector.getByRole("button", { name: "Reset Semantics", exact: false }).click();
  await resetToggle.check();
  const applyReset = inspector.getByTestId("apply-reset-semantics");
  await applyReset.click();
  await expect.poll(() => page.getByTestId("history-status").innerText()).not.toBe(history);

  await expect(nameField).toHaveValue("DRAFT_NAME");
});

// #776 Part B: Undo after applying a Clock generator change refreshes the Inspector's local generator draft to match the restored
// Canonical value -- it must not remain stale at the post-Apply value (which could otherwise overwrite the Undo result on a later Apply).
test("Undo after a Clock generator Apply refreshes the Inspector draft (no stale overwrite)", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  const host = page.getByTestId("cycle-surface");
  const clockRow = host.locator("[data-role='frozen-row'][data-signal-role='input']").first();
  await clockRow.click();
  const inspector = page.getByTestId("inspector");
  const periodField = inspector.getByLabel("Inspector clock period");
  if (await periodField.count() === 0) test.skip(true, "selected row is not a Clock signal");
  const originalPeriod = await periodField.inputValue();
  await periodField.fill(String(Number(originalPeriod) + 4));
  await inspector.getByTestId("apply-inspector-clock").click();
  await expect(periodField).toHaveValue(String(Number(originalPeriod) + 4));

  await page.getByTestId("ribbon").getByRole("button", { name: "Undo", exact: true }).click();
  // The local draft must refresh to the restored (original) Canonical value, not remain stuck at the post-Apply value.
  await expect(periodField).toHaveValue(originalPeriod);
});
