import { expect, test } from "@playwright/test";
import { resolve } from "node:path";
import { startInCycleMode } from "./cycle-startup.js";

startInCycleMode(test);

for (const viewportSize of [{ width: 1280, height: 720 }, { width: 1672, height: 941 }]) {
  test.describe(`vertical-scroll user-input acceptance at ${viewportSize.width}x${viewportSize.height}`, () => {
    test.use({ viewport: viewportSize });
    test("preserves selected range, directly selected Annotation, and visible waveform ownership during wheel scrolling", async ({ page }) => {
      test.setTimeout(60_000);
      await page.goto("/");
      const surface = page.getByTestId("cycle-surface");
      await expect(surface).toHaveAttribute("data-cycle-view-ready", "true");
      await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(resolve("samples/old/pre-reset-2026-10-02/showcase/21_large_feature_showcase.tcd.json"));
      await expect(page.getByRole("heading", { name: "Large Feature Showcase — 128 cycles / 48 signals" })).toBeVisible();
      await expect(page.locator(".editor-shell")).toHaveAttribute("data-signal-count", "48");
      await page.locator(".ribbon-tabs").getByRole("button", { name: "Timeline", exact: true }).click();

      const ruler = page.getByTestId("cycle-ruler");
      const rulerTicks = ruler.locator(".cycle-tick[data-source-cycle]");
      const tick = async (cycle: number) => (await ruler.locator(`.cycle-tick[data-source-cycle='${cycle}']`).boundingBox())!;
      const from = await tick(3);
      const fromNext = await tick(4);
      const to = await tick(9);
      const toNext = await tick(10);
      const rulerBounds = (await ruler.boundingBox())!;
      const y = rulerBounds.y + rulerBounds.height - 3;
      await page.mouse.move(from.x + 0.45 * (fromNext.x - from.x), y);
      await page.mouse.down();
      await page.mouse.move(to.x + 0.45 * (toNext.x - to.x), y, { steps: 8 });
      await page.mouse.up();
      const rangeStart = page.getByLabel("Timeline range start");
      const rangeEnd = page.getByLabel("Timeline range end");
      await expect.poll(async () => Number(await rangeEnd.inputValue()) - Number(await rangeStart.inputValue())).toBeGreaterThan(0);
      const selectedRange = { start: await rangeStart.inputValue(), end: await rangeEnd.inputValue() };

      const annotation = surface.locator("[data-role='annotation-owner'][data-annotation-id='a.text']");
      await expect(annotation).toBeVisible();
      const annotationLabel = annotation.locator("[data-role='annotation-label']");
      await expect(annotationLabel).toBeVisible();
      // At 1280x720 the label can sit under the Bottom panel (it overlays the viewport's lower edge); centre it in the VISIBLE part of the scroll viewport before hit-testing.
      await annotationLabel.evaluate(async (label) => { const viewport = document.querySelector<HTMLElement>("[data-testid='cycle-viewport']")!; const box = label.getBoundingClientRect(); const view = viewport.getBoundingClientRect(); const visibleBottom = document.querySelector<HTMLElement>(".bottom-resize-track")?.getBoundingClientRect().top ?? view.bottom; viewport.scrollTop += box.top - (view.top + (visibleBottom - view.top) / 2); await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))); });
      await page.waitForTimeout(300);
      const labelBox = (await annotationLabel.boundingBox())!;
      const labelHitPoints = await page.evaluate((box) => {
        const points = [
          [0.2, 0.5], [0.5, 0.5], [0.8, 0.5],
          [0.5, 0.25], [0.5, 0.75],
        ].map(([fx, fy]) => ({ x: box.x + box.width * fx!, y: box.y + box.height * fy! }));
        return points.map((point) => {
          const target = document.elementFromPoint(point.x, point.y);
          return { ...point, annotationHit: target?.closest("[data-role='annotation-label']") !== null, target: target?.tagName, targetRole: target?.getAttribute("data-role") };
        });
      }, labelBox);
      const clickableLabel = labelHitPoints.find((point) => point.annotationHit);
      expect(clickableLabel, JSON.stringify({ labelBox, labelHitPoints })).toBeTruthy();
      await page.mouse.click(clickableLabel!.x, clickableLabel!.y);
      await expect(annotation).toHaveAttribute("data-selected", "true");

      const revision = await surface.getAttribute("data-canonical-revision");
      const history = await page.getByTestId("history-status").textContent();
      const dirty = await page.getByTestId("dirty-status").textContent();
      const viewport = page.getByTestId("cycle-viewport");
      const before = await viewport.evaluate((element) => ({ top: element.scrollTop, max: element.scrollHeight - element.clientHeight, rect: element.getBoundingClientRect().toJSON() }));
      expect(before.max).toBeGreaterThan(0);

      const wheelAt = { x: before.rect.left + Math.min(180, before.rect.width / 3), y: before.rect.top + Math.min(120, before.rect.height / 3) };
      await page.mouse.move(wheelAt.x, wheelAt.y);
      for (const deltaY of [460, 620, -380, 720]) {
        const previous = await viewport.evaluate((element) => element.scrollTop);
        await page.mouse.wheel(0, deltaY);
        await expect.poll(() => viewport.evaluate((element) => element.scrollTop)).not.toBe(previous);
        await expect.poll(() => surface.evaluate((root) => {
          const frame = root.closest(".cycle-viewport")!.getBoundingClientRect();
          const visibleRows = [...root.querySelectorAll<HTMLElement>("[data-role='timing-row'][data-kind='timing']")]
            .filter((row) => { const bounds = row.getBoundingClientRect(); return bounds.bottom > frame.top && bounds.top < frame.bottom; });
          return visibleRows.length > 0 && visibleRows.every((row) => {
            const id = row.dataset.rowId;
            const owner = id ? root.querySelector<HTMLElement>(`[data-role='wave-owner'][data-signal-id='${CSS.escape(id)}']`) : null;
            return owner !== null && (owner.querySelector("svg, canvas[data-wave-canvas]") !== null || owner.hasAttribute("data-wave-error"))
              && Math.abs(owner.getBoundingClientRect().top - row.getBoundingClientRect().top) <= 1;
          });
        })).toBe(true);
        await expect(annotation).toHaveAttribute("data-selected", "true");
        await expect(rangeStart).toHaveValue(selectedRange.start);
        await expect(rangeEnd).toHaveValue(selectedRange.end);
      }

      const maximumScroll = await viewport.evaluate((element) => element.scrollHeight - element.clientHeight);
      for (let step = 0; step < 5; step += 1) await page.mouse.wheel(0, 900);
      await expect.poll(() => viewport.evaluate((element) => element.scrollTop)).toBe(maximumScroll);
      await expect.poll(() => surface.evaluate((root) => {
        const viewportRect = root.closest(".cycle-viewport")!.getBoundingClientRect();
        return [...root.querySelectorAll<HTMLElement>("[data-role='timing-row'][data-kind='timing']")]
          .filter((row) => { const rect = row.getBoundingClientRect(); return rect.bottom > viewportRect.top && rect.top < viewportRect.bottom; })
          .every((row) => {
            const id = row.dataset.rowId;
            const owner = id ? root.querySelector<HTMLElement>(`[data-role='wave-owner'][data-signal-id='${CSS.escape(id)}']`) : null;
            return owner !== null && (owner.querySelector("svg, canvas[data-wave-canvas]") !== null || owner.hasAttribute("data-wave-error"))
              && Math.abs(owner.getBoundingClientRect().top - row.getBoundingClientRect().top) <= 1;
          });
      })).toBe(true);
      for (let step = 0; step < 5; step += 1) await page.mouse.wheel(0, -900);
      await expect.poll(() => viewport.evaluate((element) => element.scrollTop)).toBe(0);
      await expect(annotation).toHaveAttribute("data-selected", "true");
      await expect(rangeStart).toHaveValue(selectedRange.start);
      await expect(rangeEnd).toHaveValue(selectedRange.end);

      await expect(surface).toHaveAttribute("data-canonical-revision", revision!);
      await expect(page.getByTestId("history-status")).toHaveText(history!);
      await expect(page.getByTestId("dirty-status")).toHaveText(dirty!);
      expect(await rulerTicks.count()).toBeGreaterThan(0);
    });
  });
}
