import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { visualArtifactRoot } from "./artifact-output.js";

for (const width of [1280, 1672]) test(`Ribbon caption layout survives mode changes at ${width}`, async ({ page }) => {
  await page.setViewportSize({ width, height: width === 1280 ? 720 : 941 });
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  const ribbon = page.getByTestId("ribbon");
  const initial = await ribbon.boundingBox();
  for (const mode of ["Cycle", "Transaction", "Combined", "Cycle"]) {
    const modeButton = page.locator(".view-mode").getByRole("button", { name: mode, exact: true });
    await modeButton.click();
    if (mode === "Combined") await expect(modeButton).toHaveText("Combined");
    expect((await ribbon.boundingBox())!.height).toBe(initial!.height);
    const groups = await ribbon.locator(".ribbon-schema-group").evaluateAll(es => es.filter(e => e.getBoundingClientRect().width > 0).map(e => {
      const body = e.querySelector(".ds-ribbon-group")!.getBoundingClientRect();
      const caption = e.querySelector(".ribbon-schema-group__caption")!.getBoundingClientRect();
      return { bodyBottom: body.bottom, captionTop: caption.top, captionBottom: caption.bottom, groupBottom: e.getBoundingClientRect().bottom, pseudo: getComputedStyle(e, "::after").content };
    }));
    expect(groups.length).toBeGreaterThan(0);
    for (const group of groups) {
      expect(group.bodyBottom).toBeLessThanOrEqual(group.captionTop + 1);
      expect(group.captionBottom).toBeLessThanOrEqual(group.groupBottom + 1);
      expect(group.pseudo).toBe("none");
    }
  }
  await page.screenshot({ path: resolve(visualArtifactRoot(), `ribbon-layout-${width}.png`) });
});
