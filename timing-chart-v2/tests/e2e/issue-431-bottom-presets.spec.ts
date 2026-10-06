import { expect, test } from "@playwright/test";
import { documentState, expectViewOnly } from "./view-only.js";

test("Bottom Compact and Expanded presets expose usable panel states without document mutation", async ({ page }) => {
  for (const viewport of [{ width: 1280, height: 720 }, { width: 1672, height: 941 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await page.getByRole("button", { name: "View", exact: true }).click();

    const shell = page.locator(".editor-shell");
    const bottom = page.getByTestId("bottom-editor");
    const cycle = page.getByTestId("cycle-viewport");
    const compact = page.getByTestId("view-panel-bottom-compact");
    const expanded = page.getByTestId("view-panel-bottom-expanded");
    const before = await documentState(page);

    await page.getByRole("button", { name: "Bottom Editor" }).click();
    await expect(shell).toHaveAttribute("data-bottom-visible", "false");
    await expect(bottom).toBeHidden();
    await compact.click();
    await expect(shell).toHaveAttribute("data-bottom-visible", "true");
    await expect(shell).toHaveAttribute("data-bottom-height", "180");
    await expect(compact).toHaveAttribute("aria-pressed", "true");
    await expect(bottom).toBeVisible();
    await expect(cycle).toBeVisible();

    await expanded.click();
    const maxHeight = Number(await page.getByTestId("bottom-resizer").getAttribute("aria-valuemax"));
    await expect(shell).toHaveAttribute("data-bottom-height", String(maxHeight));
    await expect(expanded).toHaveAttribute("aria-pressed", "true");
    await expect(bottom).toBeVisible();
    await expect(cycle).toBeVisible();

    const [bottomBox, cycleBox] = await Promise.all([bottom.boundingBox(), cycle.boundingBox()]);
    expect(bottomBox, `${viewport.width}x${viewport.height}: expanded Bottom bounds`).not.toBeNull();
    expect(cycleBox, `${viewport.width}x${viewport.height}: waveform bounds`).not.toBeNull();
    expect(bottomBox!.height).toBeGreaterThanOrEqual(180);
    expect(bottomBox!.height).toBeLessThanOrEqual(420);
    expect(Math.abs(bottomBox!.height - maxHeight)).toBeLessThanOrEqual(1);
    expect(cycleBox!.height, `${viewport.width}x${viewport.height}: waveform remains usable`).toBeGreaterThanOrEqual(180);
    expect(cycleBox!.y + cycleBox!.height).toBeLessThanOrEqual(bottomBox!.y + 1);
    await expectViewOnly(page, before, `Bottom presets remain view-only at ${viewport.width}x${viewport.height}`);
  }

  await page.setViewportSize({ width: 1280, height: 720 });
  await expect.poll(async () => Number(await page.getByTestId("bottom-resizer").getAttribute("aria-valuemax"))).toBeLessThan(420);
  const responsiveMax = Number(await page.getByTestId("bottom-resizer").getAttribute("aria-valuemax"));
  expect(responsiveMax).toBeLessThan(420);
  await expect(page.locator(".editor-shell")).toHaveAttribute("data-bottom-height", String(responsiveMax));
  expect(await page.getByTestId("cycle-viewport").evaluate((element) => element.clientHeight)).toBeGreaterThanOrEqual(180);
});
