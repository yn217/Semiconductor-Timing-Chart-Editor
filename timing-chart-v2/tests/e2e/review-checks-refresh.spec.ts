import { expect, test } from "@playwright/test";

test("Review Refresh Checks is view-only", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  const surface = host.locator("[data-role='timing-chart-surface']");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const before = {
    revision: await host.getAttribute("data-canonical-revision"),
    history: await page.getByTestId("history-status").textContent(),
    dirty: await page.getByTestId("dirty-status").textContent(),
    counters: await surface.getAttribute("data-render-counters"),
  };

  await page.getByRole("button", { name: "Review", exact: true }).click();
  await page.getByTestId("review-refresh-checks").click();
  await expect(page.getByTestId("review-refresh-checks")).toBeVisible();
  await expect(host).toHaveAttribute("data-canonical-revision", before.revision!);
  await expect(page.getByTestId("history-status")).toHaveText(before.history!);
  await expect(page.getByTestId("dirty-status")).toHaveText(before.dirty!);
  await expect(surface).toHaveAttribute("data-render-counters", before.counters!);
});

test("Problems exposes Clear Filter for filter clearing", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  const problems = page.getByTestId("problems-panel");
  await page.getByTestId("bottom-tabs").getByRole("tab", { name: "Problems", exact: true }).click();
  await expect(problems.getByRole("button", { name: "Clear Filter", exact: true })).toBeVisible();
  await expect(problems.getByRole("button", { name: "Refresh", exact: true })).toHaveCount(0);
});
