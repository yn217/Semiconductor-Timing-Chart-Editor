import { expect, test } from "@playwright/test";

test("restores V1 Transaction and Check Ribbon labels without view mutation", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const before = {
    revision: await page.getByTestId("revision-status").textContent(),
    history: await page.getByTestId("history-status").textContent(),
    dirty: await page.getByTestId("dirty-status").textContent(),
    counters: await host.locator("[data-role='timing-chart-surface']").getAttribute("data-render-counters"),
  };
  const tabs = page.locator(".ribbon-tabs");
  const ribbonButtons = tabs.locator(":scope > button");
  await expect(ribbonButtons.filter({ hasText: "Transaction" })).toBeVisible();
  await expect(ribbonButtons.filter({ hasText: "Check" })).toBeVisible();
  await tabs.getByRole("button", { name: "Timeline", exact: true }).click();
  await expect(page.getByTestId("timeline-editor")).toBeVisible();
  await tabs.getByRole("button", { name: "Review", exact: true }).click();
  await expect(page.getByTestId("ribbon").getByRole("button", { name: "Problems", exact: true })).toBeVisible();
  await expect(page.getByTestId("revision-status")).toHaveText(before.revision!);
  await expect(page.getByTestId("history-status")).toHaveText(before.history!);
  await expect(page.getByTestId("dirty-status")).toHaveText(before.dirty!);
  await expect(host.locator("[data-role='timing-chart-surface']")).toHaveAttribute("data-render-counters", before.counters!);
});
