import { expect, test } from "@playwright/test";

// `RibbonIcon`'s <svg> carries no width/height/viewBox of its own -- every
// caller must size it via CSS (see ribbon.css's note on this). The Clock
// Generator's toolbar (Presets/Duplicate/Import/Export/Preview, `.bottom-
// action` buttons in clock-generator-editor.tsx) never had that CSS, so the
// icons rendered at the browser's unstyled default SVG size (~300x150)
// instead of a small inline glyph next to their label.

test("Clock Generator toolbar icons render as small inline glyphs, not oversized placeholders", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_clock']").click();

  const toolbar = page.getByTestId("clock-context-toolbar");
  await expect(toolbar).toBeVisible();
  for (const testId of ["clock-presets", "clock-duplicate", "clock-import", "clock-export", "clock-preview"]) {
    const icon = toolbar.getByTestId(testId).locator("svg");
    const box = await icon.boundingBox();
    expect(box?.width, `${testId} icon width`).toBeLessThanOrEqual(20);
    expect(box?.height, `${testId} icon height`).toBeLessThanOrEqual(20);
  }
});
