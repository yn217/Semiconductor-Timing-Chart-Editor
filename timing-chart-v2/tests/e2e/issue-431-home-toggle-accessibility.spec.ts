import { expect, test } from "@playwright/test";

test("Home display toggles expose distinct accessible names", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");

  const expected = [
    ["home-grid-toggle", "Grid"],
    ["home-minimap-toggle", "MiniMap"],
    ["home-snap-toggle", "Snap"],
    ["home-ruler-toggle", "Ruler"],
  ] as const;
  for (const [testId, name] of expected) {
    await expect(page.getByTestId(testId)).toHaveAccessibleName(name);
  }

  await expect(host).toHaveAttribute("data-canonical-revision", "0");
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
  await expect(page.getByTestId("dirty-status")).toContainText("Clean");
});
