import { expect, test } from "@playwright/test";

// #776 Part A: Applying Reset Semantics on a Value Signal must not discard an unrelated unapplied Properties draft.
test("Apply Reset Semantics does not discard an unapplied Signal name draft", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  const host = page.getByTestId("cycle-surface");
  // Row 0 is the Clock; pick a Value Signal instead (Reset Semantics is Value-Signal-only).
  await host.locator("[data-role='frozen-row']").nth(1).click();
  const inspector = page.getByTestId("inspector");
  await expect(inspector).toBeVisible();
  const history = await page.getByTestId("history-status").innerText();

  // "Name" auto-commits on blur (a separate, pre-existing rename shortcut) -- use Spacing Before, a plain onChange-only draft field,
  // to isolate this Issue's actual failure mode (an unrelated commit discarding an unapplied Properties field).
  const spacingField = inspector.locator("input[aria-label='Inspector signal spacing before']");
  await spacingField.fill("7");

  const resetSectionButton = inspector.getByRole("button", { name: "Reset Semantics", exact: false });
  if (await resetSectionButton.count() === 0) test.skip(true, "Reset Semantics control not present on this Signal type");
  if ((await resetSectionButton.getAttribute("aria-expanded")) !== "true") await resetSectionButton.click();
  const resetToggle = inspector.locator("input[aria-label='Reset semantics enabled']");
  await resetToggle.check();
  const applyReset = inspector.getByTestId("apply-reset-semantics");
  await applyReset.click();
  await expect.poll(() => page.getByTestId("history-status").innerText()).not.toBe(history);

  await expect(spacingField).toHaveValue("7");
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
  await expect(inspector).toHaveAttribute("data-inspector-context", "clock");
  const periodField = inspector.locator("input[aria-label='Inspector clock period']");
  if (!(await periodField.isVisible().catch(() => false))) {
    const generatorButton = inspector.getByRole("button", { name: "Clock Generator", exact: false });
    if (await generatorButton.count() === 0) test.skip(true, "selected row is not a Clock signal");
    await generatorButton.click();
  }
  await expect(periodField).toBeVisible();
  const originalPeriod = await periodField.inputValue();
  await periodField.fill(String(Number(originalPeriod) + 4));
  await inspector.getByTestId("apply-inspector-clock").click();
  await expect(periodField).toHaveValue(String(Number(originalPeriod) + 4));

  await page.getByTestId("ribbon").getByRole("button", { name: "Undo", exact: true }).click();
  // The local draft must refresh to the restored (original) Canonical value, not remain stuck at the post-Apply value.
  await expect(periodField).toHaveValue(originalPeriod);
});
