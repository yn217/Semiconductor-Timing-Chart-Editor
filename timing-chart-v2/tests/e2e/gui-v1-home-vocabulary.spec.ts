import { expect, test } from "@playwright/test";

test("restores V1 Ribbon button vocabulary while preserving command names", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const ribbon = page.getByTestId("ribbon");
  const before = {
    revision: await page.getByTestId("revision-status").textContent(),
    history: await page.getByTestId("history-status").textContent(),
    dirty: await page.getByTestId("dirty-status").textContent(),
  };
  const visibleLabel = (buttonName: string) => ribbon.getByRole("button", { name: buttonName, exact: true }).locator("span.ds-ribbon-label").getAttribute("data-v1-label");
  await expect(visibleLabel("New")).resolves.toBe("新規");
  await expect(visibleLabel("Copy")).resolves.toBe("コピー");
  await expect(visibleLabel("Delete")).resolves.toBe("削除");
  // Move Down lives in the Home overflow menu, not the main strip -- it never
  // carried a v1Label there (only the always-visible ribbon buttons do).
  await expect(ribbon.locator(".home-file-group > b")).toHaveCSS("visibility", "hidden");
  await expect(ribbon.locator(".home-file-group > b")).toHaveText("File");
  await expect(page.getByTestId("revision-status")).toHaveText(before.revision!);
  await expect(page.getByTestId("history-status")).toHaveText(before.history!);
  await expect(page.getByTestId("dirty-status")).toHaveText(before.dirty!);
});
