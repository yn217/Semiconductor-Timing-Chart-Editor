import { expect, test } from "@playwright/test";
import { startInCycleSample } from "./cycle-startup.js";
import { documentState } from "./view-only.js";

startInCycleSample(test);

/**
 * Find & Replace plan acceptance (real browser): the panel previews a case-insensitive match count without touching the document, Replace All
 * renames every match in ONE History entry, Undo restores every name at once, a replacement that would empty a name is excluded, and
 * Cancel leaves the document untouched.
 */
for (const size of [{ width: 1280, height: 720 }, { width: 1672, height: 941 }] as const) {
  test(`Find & Replace previews, renames all matches in one step and undoes at ${size.width}x${size.height}`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.goto("/");
    const surface = page.getByTestId("cycle-surface");
    await expect(surface).toHaveAttribute("data-cycle-view-ready", "true");
    await expect(surface).toHaveAttribute("data-canonical-revision", /^\d+$/);
    const names = () => surface.locator("[data-role='frozen-row'][data-kind='timing'], [data-role='frozen-row']:not([data-kind='comment'])").evaluateAll((rows) => rows.map((row) => (row as HTMLElement).dataset.name ?? ""));
    const original = await names();
    expect(original.length).toBeGreaterThan(2);
    const needle = original.find((name) => name.length >= 3)!.slice(0, 2).toLowerCase();
    const matching = original.filter((name) => name.toLowerCase().includes(needle));
    const before = await documentState(page);

    await page.getByTestId("find-replace-trigger").click();
    const panel = page.getByTestId("find-replace-panel");
    await expect(panel).toBeVisible();
    await page.getByTestId("find-replace-find").fill(needle.toUpperCase());
    await page.getByTestId("find-replace-replace").fill("zz");
    await expect(page.getByTestId("find-replace-count")).toContainText(`${matching.length} signal`);
    expect(await documentState(page), "previewing is view-only").toEqual(before);

    // Cancel changes nothing.
    await panel.getByRole("button", { name: "Cancel" }).click();
    await expect(panel).toHaveCount(0);
    expect(await documentState(page)).toEqual(before);

    // Replace All -> one History entry, every match renamed.
    await page.getByTestId("find-replace-trigger").click();
    await expect(panel, "the panel reopens after Cancel").toBeVisible();
    await page.getByTestId("find-replace-find").fill(needle);
    await page.getByTestId("find-replace-replace").fill("zz");
    await page.getByTestId("find-replace-apply").click();
    await expect.poll(async () => (await names()).filter((name) => name.toLowerCase().includes("zz")).length).toBeGreaterThanOrEqual(matching.length);
    const after = await documentState(page);
    expect(after.history, "one History entry for the whole batch").toMatch(/History 1 /);
    const renamed = await names();
    for (const [index, name] of original.entries()) if (!name.toLowerCase().includes(needle)) expect(renamed[index], "non-matching names stay").toBe(name);

    // Undo restores every name in a single step.
    await page.keyboard.press("Control+z");
    await expect.poll(names).toEqual(original);
    expect((await documentState(page)).history).toMatch(/History 0 /);
  });
}

// Floating ribbon panels must be reusable: closing and reopening shows a positioned, visible panel (regression: useDialogFocusLoop nulled the trigger ref).
test("Find & Replace and Transaction Time Scale panels reopen visibly after Cancel/Escape", async ({ page }) => {
  await page.goto("/?transaction-demo");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  const find = page.getByTestId("find-replace-trigger");
  for (let round = 0; round < 3; round += 1) {
    await find.click();
    await expect(page.getByTestId("find-replace-panel"), `Find & Replace round ${round}`).toBeVisible();
    if (round % 2 === 0) await page.getByTestId("find-replace-panel").getByRole("button", { name: "Cancel" }).click();
    else await page.keyboard.press("Escape");
    await expect(page.getByTestId("find-replace-panel")).toHaveCount(0);
  }
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  await page.getByLabel("Ribbon tabs").getByRole("button", { name: "Transaction", exact: true }).click();
  const scale = page.getByTestId("transaction-time-scale-trigger");
  if (await scale.count()) {
    for (let round = 0; round < 3; round += 1) {
      await scale.click();
      await expect(page.getByTestId("transaction-time-scale-panel"), `Time Scale round ${round}`).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.getByTestId("transaction-time-scale-panel")).toHaveCount(0);
    }
  }
});
