import { expect, test } from "@playwright/test";

test("status diagnostics stay opt-in and the left rail never covers status in compact modes", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  const revision = page.getByTestId("revision-status");
  const history = page.getByTestId("history-status");
  const box = async (locator: typeof revision) => (await locator.boundingBox())!;
  expect((await box(revision)).width).toBeLessThanOrEqual(2);
  expect((await box(history)).width).toBeLessThanOrEqual(2);
  await expect(history).toHaveText("History 0 / Redo 0");
  for (const id of ["tool-status", "selection-status", "zoom-status-bar", "problems-status", "dirty-status"]) await expect(page.getByTestId(id)).toBeVisible();
  const revisionBefore = await page.getByTestId("cycle-surface").getAttribute("data-canonical-revision");
  const toggle = page.getByTestId("status-diagnostics-toggle");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  expect((await box(revision)).width).toBeGreaterThan(40);
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-canonical-revision", revisionBefore!);
  await expect(history).toHaveText("History 0 / Redo 0");
  for (const mode of ["Transaction", "Combined", "Cycle"]) {
    await page.locator(".view-mode").getByRole("button", { name: mode, exact: true }).click();
    const bounds = await page.evaluate(() => ({
      rail: document.querySelector(".left-workspace-rail")!.getBoundingClientRect().bottom,
      status: document.querySelector(".status-bar")!.getBoundingClientRect().top,
    }));
    expect(bounds.rail, mode).toBeLessThanOrEqual(bounds.status + 0.5);
  }
});
