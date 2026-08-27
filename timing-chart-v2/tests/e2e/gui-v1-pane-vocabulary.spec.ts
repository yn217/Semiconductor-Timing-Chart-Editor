import { expect, test } from "@playwright/test";

test("restores V1 pane vocabulary without changing command identity or document state", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");

  const before = {
    revision: await page.getByTestId("revision-status").textContent(),
    history: await page.getByTestId("history-status").textContent(),
    dirty: await page.getByTestId("dirty-status").textContent(),
  };

  await expect(page.locator(".left-column-heading strong")).toHaveText("信号 / グループ");
  await expect(page.locator(".column-headings > span").nth(1)).toHaveText("Role / 信号");
  await expect(page.getByTestId("bottom-tabs").locator("[data-bottom-tab]").allTextContents()).resolves.toEqual(["信号", "注釈", "問題", "JSON"]);
  await expect(page.getByTestId("follow-selection").locator(".." )).toHaveText("選択に追従");
  await expect(page.getByTestId("bottom-pin")).toHaveAttribute("aria-label", "Pin");

  await page.getByTestId("bottom-tabs").locator("[data-bottom-tab='Annotation']").click();
  await expect(page.getByTestId("bottom-tabs").locator("[data-bottom-tab='Annotation']")).toHaveClass(/active/);

  await expect(page.getByTestId("revision-status")).toHaveText(before.revision!);
  await expect(page.getByTestId("history-status")).toHaveText(before.history!);
  await expect(page.getByTestId("dirty-status")).toHaveText(before.dirty!);
});
