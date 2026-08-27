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
  const visibleLabel = (buttonName: string) => ribbon.getByRole("button", { name: buttonName, exact: true }).locator("span").getAttribute("data-v1-label");
  await expect(visibleLabel("New")).resolves.toBe("新規");
  await expect(visibleLabel("Copy")).resolves.toBe("コピー");
  await expect(visibleLabel("Delete")).resolves.toBe("削除");
  await expect(visibleLabel("Move Down")).resolves.toBe("下へ");
  await expect(ribbon.locator(".home-file-group > b")).toHaveCSS("color", "rgba(0, 0, 0, 0)");
  await expect(ribbon.locator(".home-file-group > b")).toHaveText("File");
  await expect(page.getByTestId("revision-status")).toHaveText(before.revision!);
  await expect(page.getByTestId("history-status")).toHaveText(before.history!);
  await expect(page.getByTestId("dirty-status")).toHaveText(before.dirty!);
});
