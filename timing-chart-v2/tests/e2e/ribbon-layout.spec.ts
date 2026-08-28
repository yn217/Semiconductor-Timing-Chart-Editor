import { expect, test } from "@playwright/test";

for (const width of [1672, 1365]) {
  test(`Home Ribbon labels and icons do not overlap at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 941 });
    await page.goto("/?visual-reference");
    await expect(page.getByTestId("ribbon")).toBeVisible();
    const result = await page.evaluate(() => {
      const overlaps = (a: DOMRect, b: DOMRect) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
      const outside = (child: DOMRect, parent: DOMRect) => child.left < parent.left - 1 || child.right > parent.right + 1 || child.top < parent.top - 1 || child.bottom > parent.bottom + 1;
      const buttons = [...document.querySelectorAll<HTMLButtonElement>("[data-testid='ribbon'] .ribbon-tool")];
      const issues = buttons.flatMap((button) => {
        const buttonBox = button.getBoundingClientRect();
        const icon = button.querySelector<SVGElement>(":scope > svg")?.getBoundingClientRect();
        const label = button.querySelector<HTMLElement>(":scope > span")?.getBoundingClientRect();
        return [
          icon && label && overlaps(icon, label) ? "icon-label-overlap" : "",
          label && outside(label, buttonBox) ? "label-outside-button" : "",
        ].filter(Boolean);
      });
      const ribbon = document.querySelector<HTMLElement>("[data-testid='ribbon']")!;
      return { issues, ribbonOverflow: ribbon.scrollWidth > ribbon.clientWidth };
    });
    expect(result.issues).toEqual([]);
    expect(result.ribbonOverflow).toBe(false);
  });
}
