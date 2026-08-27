import { expect, test } from "@playwright/test";

test("Annotation bottom editor lists stable annotation IDs without mutating document state", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Annotation", exact: true }).click();
  await page.getByLabel("Annotation type").selectOption("text");
  await page.getByRole("button", { name: "Add annotation" }).click();
  await page.getByRole("button", { name: "Add annotation" }).click();

  const list = page.getByTestId("annotation-list");
  await expect(list.locator("[data-annotation-list-id]")).toHaveCount(2);
  await expect(list.locator(".annotation-list-header")).toContainText("Start");
  await expect(list.locator(".annotation-list-header")).toContainText("End");
  await expect(list.locator(".annotation-list-header")).toContainText("Label / Text");
  const ids = await list.locator("[data-annotation-list-id]").evaluateAll((items) => items.map((item) => item.getAttribute("data-annotation-list-id")));
  expect(ids).toEqual(ids.filter((id): id is string => id !== null));
  expect(new Set(ids).size).toBe(2);

  const revision = await host.getAttribute("data-canonical-revision");
  const history = await page.getByTestId("history-status").textContent();
  const dirty = await page.getByTestId("dirty-status").textContent();
  const surface = host.locator("[data-role='timing-chart-surface']");
  const counters = await surface.getAttribute("data-render-counters");
  await list.locator("[data-annotation-list-id]").first().click();
  await expect(list.locator("[data-annotation-list-id]").first()).toHaveAttribute("data-selected", "true");
  await expect(host).toHaveAttribute("data-canonical-revision", revision!);
  await expect(page.getByTestId("history-status")).toHaveText(history!);
  await expect(page.getByTestId("dirty-status")).toHaveText(dirty!);
  await expect(surface).toHaveAttribute("data-render-counters", counters!);
});
