import { expect, test } from "@playwright/test";

const modes = ["Cycle", "Transaction", "Combined"] as const;
const regions = {
  workspace: ".desktop-workspace",
  bottom: "[data-testid='bottom-editor']",
  inspector: "[data-testid='inspector-shell']",
  status: ".status-bar",
} as const;

for (const viewport of [{ width: 1672, height: 941 }, { width: 1280, height: 720 }]) {
  test(`shared regions keep their geometry across mode round trips at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
    const boxes = async () => Object.fromEntries(await Promise.all(Object.entries(regions).map(async ([name, selector]) => {
      const box = await page.locator(selector).first().boundingBox();
      return [name, box === null ? null : { x: Math.round(box.x), width: Math.round(box.width), bottom: Math.round(box.y + box.height) }];
    })));
    const switchTo = async (mode: (typeof modes)[number]) => {
      await page.locator(".view-mode").getByRole("button", { name: mode, exact: true }).click();
      await expect(page.getByTestId("view-mode-status")).toHaveText(`Mode: ${mode}`);
    };
    const first: Record<string, Awaited<ReturnType<typeof boxes>>> = {};
    for (const mode of modes) { await switchTo(mode); first[mode] = await boxes(); }
    for (const mode of [...modes].reverse()) {
      await switchTo(mode);
      const again = await boxes();
      for (const region of ["bottom", "inspector", "status"] as const) expect(again[region], `${mode}/${region}`).toEqual(first[mode]![region]);
    }
    for (const mode of modes) {
      const b = first[mode]!;
      expect(b.status!.bottom, `${mode} status bottom`).toBeLessThanOrEqual(viewport.height + 1);
      expect(b.workspace!.bottom, `${mode} workspace stays above the status bar`).toBeLessThanOrEqual(b.status!.bottom);
      expect(b.inspector!.width, `${mode} inspector width`).toBe(first.Cycle!.inspector!.width);
    }
  });
}
