import { expect, test } from "@playwright/test";

// #631: in Transaction Mode every full-height vertical indicator must be one of the two neutral, non-interactive, low-contrast
// owners (major grid line, Transaction geometry line) and Transaction bars must stay above them.
test("Transaction mode vertical indicators are neutral, non-interactive and below the bars", async ({ page }) => {
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await expect(page.getByTestId("transaction-lanes")).toBeVisible();
  const lines = await page.evaluate(() => {
    const found: Array<{ owner: string; color: string; pointerEvents: string; opacity: number; width: number }> = [];
    document.querySelectorAll("[data-testid=cycle-viewport] *").forEach((element) => {
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.width > 3 || rect.height < 60) return;
      const style = getComputedStyle(element as HTMLElement);
      found.push({ owner: (element as HTMLElement).className.toString().split(" ")[0] ?? "", color: style.borderLeftColor, pointerEvents: style.pointerEvents, opacity: Number(style.opacity), width: rect.width });
    });
    return found;
  });
  expect(lines.length).toBeGreaterThan(0);
  for (const line of lines) {
    expect(["geometry-grid-line", "transaction-geometry-line"], JSON.stringify(line)).toContain(line.owner);
    expect(line.pointerEvents).toBe("none");
    expect(line.width).toBeLessThanOrEqual(1.5);
    // Neutral light blue-grey (no orange/brown semantic colour): channels within 40 of each other and all above 200.
    const channels = line.color.match(/\d+/g)!.slice(0, 3).map(Number);
    expect(Math.min(...channels)).toBeGreaterThan(200);
    expect(Math.max(...channels) - Math.min(...channels)).toBeLessThan(40);
  }
  const barZ = await page.locator("[data-testid=transaction-lanes] [data-transaction-id]").first().evaluate((element) => Number(getComputedStyle(element).zIndex));
  expect(barZ).toBeGreaterThan(0);
});
