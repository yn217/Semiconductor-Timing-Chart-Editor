import { expect, test } from "@playwright/test";

// #416 Home Ribbon cleanup: "Edit Interval" (a pure `setRibbonTab("Timeline")`
// duplicate of the already-present Timeline tab) and Home's own "Create
// Time Group" (a duplicate of the Timeline Ribbon's own "Create" button --
// TimeGroup is Timeline-domain, not Home's) are removed entirely, not kept
// disabled/hidden. `onOpenTimeline` itself stays wired for the AI View
// Intent route; only the Home button is gone.

test("Home's Layout group only exposes Auto Space; Time Group creation lives on the Timeline Ribbon", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Home", exact: true }).click();

  const layout = page.getByTestId("ribbon").locator(".home-layout-group");
  await expect(layout.getByRole("button", { name: "Normalize row spacing" })).toBeVisible();
  await expect(layout.getByRole("button", { name: "Open Timeline interval editor" })).toHaveCount(0);
  await expect(layout.getByRole("button", { name: "Create Time Group" })).toHaveCount(0);

  // The real, non-duplicate route: Timeline tab -> its own Create button.
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Timeline", exact: true }).click();
  const timeline = page.getByTestId("ribbon");
  await expect(timeline.getByTestId("time-group-create")).toBeVisible();
  await timeline.getByTestId("time-group-create").click();
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
});
