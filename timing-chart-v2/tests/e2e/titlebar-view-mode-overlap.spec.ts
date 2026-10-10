import { expect, test } from "@playwright/test";

for (const width of [1100, 900]) {
  test(`at ${width}px a long title does not push the Scenario controls under the View Mode buttons`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/?transaction-demo");
    await page.getByRole("button", { name: "Enable Scenarios" }).click();
    await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
    await page.locator(".ribbon").getByRole("button", { name: "Properties", exact: true }).click();
    const dialog = page.getByRole("dialog").last();
    await dialog.getByLabel("Document title").fill("A very long document title that keeps going and going");
    await dialog.getByRole("button", { name: /Apply/i }).first().click();
    await page.keyboard.press("Escape");
    const blocked = await page.evaluate(() => {
      const viewModeLeft = document.querySelector(".view-mode")!.getBoundingClientRect().left;
      return ["active-scenario", "scenario-name", "scenario-rename", "scenario-duplicate", "scenario-delete", "scenario-compare-toggle"].filter((id) => {
        const element = document.querySelector<HTMLElement>(`[data-testid='${id}']`)!;
        const box = element.getBoundingClientRect();
        const top = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
        return box.right > viewModeLeft || (top !== element && !element.contains(top));
      });
    });
    expect(blocked).toEqual([]);
    await page.getByTestId("scenario-duplicate").click();
    await expect(page.getByTestId("history-status")).toHaveText("History 2 / Redo 0");
  });
}
