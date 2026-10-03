import { expect, test } from "@playwright/test";
import { startInCycleSample } from "./cycle-startup.js";

startInCycleSample(test);

test("Left Tree header actions preserve keyboard focus and leave the document unchanged", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await expect(host).toHaveAttribute("data-canonical-revision", /^\d+$/);
  const before = {
    revision: await host.getAttribute("data-canonical-revision"),
    history: await page.getByTestId("history-status").textContent(),
    dirty: await page.getByTestId("dirty-status").textContent(),
  };
  const header = page.locator(".left-column-heading");

  const more = header.getByRole("button", { name: "More tree actions" });
  await expect(more).toBeVisible();
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
  const clearFilter = header.getByRole("button", { name: "Clear signal tree filter" });
  await expect(clearFilter).toBeVisible();
  await clearFilter.click();
  await expect(filter).toHaveValue("");
  await expect(host).toHaveAttribute("data-canonical-revision", before.revision!);
  await expect(page.getByTestId("history-status")).toHaveText(before.history!);
  await expect(page.getByTestId("dirty-status")).toHaveText(before.dirty!);
});
