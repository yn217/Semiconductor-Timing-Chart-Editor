import { expect, test } from "@playwright/test";

test.describe("Edge Counter compact layout", () => {
  test("keeps all controls reachable in a compact desktop grid", async ({ page }) => {
    await page.goto("/");
    const host = page.getByTestId("cycle-surface");
    await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
    await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_clock']").click();
    const editor = page.getByTestId("signal-editor");
    const counter = editor.locator(".clock-edge-counter");
    await expect(counter).toBeVisible();

    const layout = await counter.evaluate((node) => {
      const rect = node.getBoundingClientRect();
      const labels = [...node.querySelectorAll("label")].map((label) => label.getBoundingClientRect());
      return { width: rect.width, height: rect.height, labelTop: labels.map((item) => Math.round(item.top)), scrollWidth: node.scrollWidth, clientWidth: node.clientWidth };
    });
    expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth);
    expect(new Set(layout.labelTop).size).toBeGreaterThan(1);
    expect(layout.height).toBeLessThan(260);
    await expect(editor.getByLabel("Clock edge counter show")).toBeVisible();
    await expect(editor.getByLabel("Clock edge counter mode")).toBeVisible();
    await expect(editor.getByLabel("Clock edge counter count from")).toBeVisible();
    await expect(editor.getByLabel("Clock edge counter every")).toBeVisible();
    await expect(editor.getByLabel("Clock edge counter position")).toBeVisible();
    await expect(editor.getByLabel("Clock edge counter X offset")).toBeVisible();
    await expect(editor.getByLabel("Clock edge counter Y offset")).toBeVisible();
  });

  test("reflows without clipping at a narrow bottom-editor width", async ({ page }) => {
    await page.setViewportSize({ width: 1000, height: 720 });
    await page.goto("/");
    const host = page.getByTestId("cycle-surface");
    await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
    await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_clock']").click();
    const editor = page.getByTestId("signal-editor");
    const counter = editor.locator(".clock-edge-counter");
    const layout = await counter.evaluate((node) => ({ scrollWidth: node.scrollWidth, clientWidth: node.clientWidth, rect: node.getBoundingClientRect().toJSON() }));
    expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth);
    expect(layout.rect.width).toBeGreaterThan(0);
    await expect(editor.getByTestId("apply-clock-edge-counter")).toBeVisible();
  });
});
