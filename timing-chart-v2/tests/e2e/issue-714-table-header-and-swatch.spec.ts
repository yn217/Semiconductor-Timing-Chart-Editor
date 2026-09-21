import { expect, test } from "@playwright/test";

// #714: Bottom Transaction table header is the same visual scale as the body; colour is shown only in the Color column (no left row swatch).
for (const viewport of [{ width: 1672, height: 941 }, { width: 1280, height: 720 }]) {
  test(`Transaction table header/body typography and swatch ownership at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize(viewport);
    await page.goto("/");
    await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
    await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
    await page.getByLabel("Workspace preset").selectOption("transaction");
    const editor = page.getByTestId("bottom-editor");
    await editor.getByLabel("New Transaction name").fill("Read Request");
    await editor.getByLabel("New Transaction start").fill("0.2");
    await editor.getByLabel("New Transaction end").fill("1.2");
    await editor.getByRole("button", { name: "Create Transaction", exact: true }).click();
    const row = page.locator(".transaction-list-row").first();
    await expect(row).toBeVisible();
    const data = await page.evaluate(() => {
      const header = document.querySelector<HTMLElement>(".transaction-list-header-cells > span")!;
      const body = document.querySelector<HTMLElement>(".transaction-list-row > button > span, .transaction-list-row > button > *:not(i)")!;
      const list = document.querySelector<HTMLElement>(".transaction-list-header")!.parentElement!;
      return {
        header: parseFloat(getComputedStyle(header).fontSize), body: parseFloat(getComputedStyle(body).fontSize), weight: Number(getComputedStyle(header).fontWeight),
        leftSwatch: document.querySelectorAll(".transaction-list-row .transaction-row-swatch").length, colorSwatch: document.querySelectorAll(".transaction-list-row .transaction-row-color-swatch").length,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, listInside: list.getBoundingClientRect().right <= innerWidth + 1,
      };
    });
    expect(data.leftSwatch).toBe(0);
    expect(data.colorSwatch).toBeGreaterThan(0);
    expect(data.body - data.header).toBeLessThanOrEqual(1);
    expect(data.weight).toBeGreaterThanOrEqual(600);
    expect(data.overflow).toBeLessThanOrEqual(1);
    expect(data.listInside).toBe(true);
    expect(errors).toEqual([]);
  });
}
