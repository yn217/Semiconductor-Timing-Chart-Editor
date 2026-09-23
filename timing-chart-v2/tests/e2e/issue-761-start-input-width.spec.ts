import { expect, test } from "@playwright/test";

// #761: keep the same multi-digit draft while measuring both responsive allocations in one session.
const viewports = [{ width: 1672, height: 941 }, { width: 1280, height: 720 }];

test("Start (cycle) input is readable at both supported viewports", async ({ page }) => {
  await page.setViewportSize(viewports[0]!);
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  await page.getByTestId("cycle-surface").locator("[data-role='frozen-row'][data-row-id='sig_cycle_reset_n']").click();
  const editor = page.getByTestId("signal-editor");
  const start = editor.getByLabel(/start/i).first();
  await start.fill("10000");

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    const metrics = await editor.evaluate((root) => {
      const input = root.querySelector<HTMLInputElement>(".transition-field-start > input")!;
      const row = root.querySelector<HTMLElement>(".transition-form-row")!;
      const rowRect = row.getBoundingClientRect();
      const boxes = Array.from(row.children).map((child) => child.getBoundingClientRect());
      return { width: input.getBoundingClientRect().width, scrollWidth: input.scrollWidth, clientWidth: input.clientWidth, overflowsRow: boxes.some((box) => box.right > rowRect.right + 1) };
    });
    expect(metrics.width).toBeGreaterThanOrEqual(64);
    expect(metrics.width).toBeLessThanOrEqual(100);
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1);
    expect(metrics.overflowsRow).toBe(false);
  }
});
