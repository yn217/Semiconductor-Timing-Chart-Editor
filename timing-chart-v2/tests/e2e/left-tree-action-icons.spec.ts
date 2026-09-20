import { expect, test } from "@playwright/test";
import { startInCycleSample } from "./cycle-startup.js";

startInCycleSample(test);

test("Left Tree header actions use owned SVG icons without changing the document", async ({ page }) => {
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
  const header = page.locator(".left-column-heading");
  await expect(header.locator(".tree-add-button svg path")).toHaveCount(1);
  await expect.poll(() => header.locator(".tree-add-button").evaluate((element) => getComputedStyle(element, "::after").content)).toBe('"Add"');
  await expect(header.locator(".tree-more-button svg path")).toHaveCount(1);
  await expect(header.locator(".tree-add-button")).toHaveText("");
  await expect(header.locator(".tree-more-button")).toHaveText("");

  const more = header.getByRole("button", { name: "More tree actions" });
  await more.click();
  const moreMenu = page.getByRole("menu", { name: "More tree actions" });
  await expect(moreMenu).toBeVisible();
  await moreMenu.getByRole("menuitem").first().press("Escape");
  await expect(more).toBeFocused();
  const add = header.getByRole("button", { name: "Add signal or group" });
  await add.click();
  const addMenu = page.getByRole("menu", { name: "Add signal or group" });
  await expect(addMenu).toBeVisible();
  await addMenu.getByRole("menuitem").first().press("Escape");
  await expect(add).toBeFocused();
  await more.click();
  await expect(moreMenu).toBeVisible();
  await page.getByRole("menuitem", { name: "Expand All Groups" }).click();
  const filter = page.getByTestId("signal-tree-search-top");
  await filter.fill("CLOCK");
  await expect(header.locator("button[aria-label='Clear signal tree filter'] svg path")).toHaveCount(1);
  await header.getByRole("button", { name: "Clear signal tree filter" }).click();
  await expect(filter).toHaveValue("");
  await expect(host).toHaveAttribute("data-canonical-revision", before.revision!);
  await expect(page.getByTestId("history-status")).toHaveText(before.history!);
  await expect(page.getByTestId("dirty-status")).toHaveText(before.dirty!);
  await expect(surface).toHaveAttribute("data-render-counters", before.counters!);
});
