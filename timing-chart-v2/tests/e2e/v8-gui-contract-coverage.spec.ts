import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });

test("locks v8 badge, display, MiniMap, and bottom-toolbar geometry", async ({ page }) => {
  await page.goto("/?visual-reference");
  const surface = page.getByTestId("cycle-surface");
  await expect(surface).toHaveAttribute("data-cycle-view-ready", "true");

  const badges = await page.evaluate(() => {
    const values = ["input", "output", "internal", "comment"] as const;
    return values.map((presentation) => {
      const leftSelector = presentation === "comment" ? "[data-role='left-row'][data-kind='comment']" : `[data-role='left-row'][data-signal-role='${presentation}']:not([data-kind='comment'])`;
      const frozenSelector = presentation === "comment" ? "[data-role='frozen-row'][data-kind='comment']" : `[data-role='frozen-row'][data-signal-role='${presentation}']:not([data-kind='comment'])`;
      const left = document.querySelector<HTMLElement>(`${leftSelector} [data-role='tree-signal-role']`)!.getBoundingClientRect();
      const frozen = document.querySelector<HTMLElement>(`${frozenSelector} [data-role='signal-role']`)!.getBoundingClientRect();
      return { presentation, left: { width: left.width, height: left.height }, frozen: { width: frozen.width, height: frozen.height } };
    });
  });
  const expectedWidths = { input: 28, output: 28, internal: 34, comment: 24 } as const;
  for (const badge of badges) {
    expect(badge.left.width).toBe(expectedWidths[badge.presentation]);
    expect(badge.frozen.width).toBe(expectedWidths[badge.presentation]);
    expect(Math.abs(badge.left.width - badge.frozen.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(badge.left.height - badge.frozen.height)).toBeLessThanOrEqual(1);
  }

  const grid = await page.getByTestId("home-grid-toggle").boundingBox();
  const snap = await page.getByTestId("home-snap-toggle").boundingBox();
  expect(grid).not.toBeNull();
  expect(snap).not.toBeNull();
  expect(Math.abs(grid!.x - snap!.x)).toBeLessThanOrEqual(1);
  expect(snap!.y).toBeGreaterThan(grid!.y);

  const minimapY: number[] = [];
  const minimap = page.getByTestId("minimap");
  minimapY.push(Math.round((await minimap.boundingBox())!.y));
  for (const selector of [
    "[data-role='frozen-row'][data-row-id='sig_cycle_request']",
    "[data-role='frozen-row'][data-row-id='sig_cycle_clock']",
    "[data-role='frozen-row'][data-kind='comment']",
  ]) {
    const row = page.locator(selector).first();
    if (await row.count()) {
      await row.click();
      minimapY.push(Math.round((await minimap.boundingBox())!.y));
    }
  }
  expect(Math.max(...minimapY) - Math.min(...minimapY)).toBeLessThanOrEqual(2);

  await page.locator("[data-role='frozen-row'][data-row-id='sig_cycle_clock']").click();
  const toolbar = page.getByTestId("clock-context-toolbar");
  for (const label of ["Duplicate", "Import...", "Export...", "Preview"]) {
    await expect(toolbar.getByRole("button", { name: label, exact: true }).locator("svg")).toHaveCount(1);
  }
});
