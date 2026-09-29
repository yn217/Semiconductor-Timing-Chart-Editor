import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startInCycleMode } from "./cycle-startup.js";

startInCycleMode(test);

/**
 * #897: a row-scoped context menu must never paint as a disabled shell because global selection has not caught up. A
 * MutationObserver-free requestAnimationFrame sampler records the FIRST frame in which the menu exists: its Signal actions must
 * already be enabled and the invoking row must already be the selection.
 */
test("Signal context menu opens enabled for the invoking row on its first visible frame", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto("/");
  const surface = page.getByTestId("cycle-surface");
  await expect(surface).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(resolve("samples/showcase/21_large_feature_showcase.tcd.json"));
  await expect(page.locator(".editor-shell")).toHaveAttribute("data-signal-count", "48");
  await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 30_000 });
  await expect(page.getByTestId("selection-status")).toContainText("None");

  await page.evaluate(() => {
    const frames: Array<{ items: number; disabled: number; selection: string }> = [];
    (window as unknown as { __menuFrames: typeof frames }).__menuFrames = frames;
    const sample = () => {
      const menu = document.querySelector("[data-testid='signal-context-menu']");
      if (menu && frames.length < 3) {
        const items = [...menu.querySelectorAll<HTMLElement>("[role='menuitem']")];
        frames.push({ items: items.length, disabled: items.filter((item) => item.hasAttribute("disabled") || item.getAttribute("aria-disabled") === "true").length, selection: document.querySelector("[data-testid='selection-status']")?.textContent ?? "" });
      }
      if (frames.length < 3) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  await surface.locator("[data-role='frozen-row'][data-row-id='s.reqv']").click({ button: "right" });
  await expect(page.getByTestId("signal-context-menu")).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __menuFrames: unknown[] }).__menuFrames.length)).toBeGreaterThan(0);
  const first = await page.evaluate(() => (window as unknown as { __menuFrames: Array<{ items: number; disabled: number; selection: string }> }).__menuFrames[0]!);
  expect(first.items).toBeGreaterThan(0);
  expect(first.selection, "the invoking row must already be the Selection in the first menu frame").not.toContain("None");
  const enabled = first.items - first.disabled;
  expect(enabled, `menu painted with ${first.disabled}/${first.items} disabled items on its first frame`).toBeGreaterThan(first.items / 2);
});
