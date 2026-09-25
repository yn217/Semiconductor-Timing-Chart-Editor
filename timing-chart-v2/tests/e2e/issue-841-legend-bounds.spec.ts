import { expect, test } from "@playwright/test";
import { startInCycleSample } from "./cycle-startup.js";

test.use({ viewport: { width: 1280, height: 720 } });
startInCycleSample(test);

test("Legend stays inside the Cycle workspace after edge drag and Inspector positioning", async ({ page }) => {
  await page.goto("/");
  const cycleViewport = page.getByTestId("cycle-viewport");
  const ruler = page.getByTestId("cycle-ruler");
  await expect(cycleViewport).toBeVisible();

  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Properties", exact: true }).click();
  const properties = page.getByRole("dialog", { name: "Document Properties" });
  await properties.getByLabel("Legend show").check();
  await properties.getByTestId("apply-document-properties").click();
  await properties.getByRole("button", { name: "Close properties" }).click();

  const legend = page.getByTestId("editor-legend");
  await expect(legend).toBeVisible();
  const initial = await legend.boundingBox();
  const rail = await page.getByTestId("left-workspace-rail").boundingBox();
  expect(initial).not.toBeNull();
  expect(rail).not.toBeNull();
  expect(initial!.x).toBeGreaterThanOrEqual(rail!.x + rail!.width - 1);

  const viewport = await cycleViewport.boundingBox();
  const rulerBox = await ruler.boundingBox();
  expect(viewport).not.toBeNull();
  expect(rulerBox).not.toBeNull();
  await page.mouse.move(initial!.x + Math.min(12, initial!.width / 2), initial!.y + Math.min(10, initial!.height / 2));
  await page.mouse.down();
  await page.mouse.move(viewport!.x + viewport!.width - 2, viewport!.y + viewport!.height - 2, { steps: 4 });
  await page.mouse.up();

  const expectLegendInsideWorkspace = async () => {
    const metrics = await page.evaluate(() => {
      const legend = document.querySelector<HTMLElement>(".editor-legend");
      const content = document.querySelector<HTMLElement>(".split-signal-content")!;
      const viewport = content.closest<HTMLElement>(".cycle-viewport")!;
      const ruler = content.querySelector<HTMLElement>(".cycle-ruler")!;
      const cyclePanel = viewport.closest<HTMLElement>(".cycle-panel")!;
      const horizontalScrollbar = cyclePanel.querySelector<HTMLElement>(":scope > .timeline-hscroll");
      const scrollbarRect = horizontalScrollbar?.getBoundingClientRect();
      const shell = viewport.closest<HTMLElement>(".editor-shell")!;
      const bottomCover = Number.parseFloat(getComputedStyle(shell).getPropertyValue("--cycle-bottom-cover")) || 0;
      const rect = (element: HTMLElement) => {
        const { left, top, right, bottom, width, height } = element.getBoundingClientRect();
        return { left, top, right, bottom, width, height };
      };
      const viewportRect = rect(viewport);
      const contentRect = rect(content);
      const rulerRect = rect(ruler);
      const visibleBottom = Math.min(
        viewportRect.bottom - bottomCover,
        contentRect.bottom,
        horizontalScrollbar && !horizontalScrollbar.hidden && scrollbarRect && scrollbarRect.height > 0
          ? scrollbarRect.top
          : Number.POSITIVE_INFINITY,
      );
      return {
        legend: legend ? { rect: rect(legend), x: legend.dataset.legendPositionX, y: legend.dataset.legendPositionY, display: getComputedStyle(legend).display } : null,
        viewport: viewportRect, content: contentRect, ruler: rulerRect, visibleBottom,
        rail: rect(document.querySelector<HTMLElement>(".left-workspace-rail")!),
        viewportScroll: { left: viewport.scrollLeft, top: viewport.scrollTop, width: viewport.clientWidth, height: viewport.clientHeight },
        contentScroll: { left: content.scrollLeft, top: content.scrollTop },
      };
    });
    expect(metrics.legend, JSON.stringify(metrics)).not.toBeNull();
    expect(metrics.legend!.rect.left).toBeGreaterThanOrEqual(metrics.rail.left + metrics.rail.width - 1);
    expect(metrics.legend!.rect.right).toBeLessThanOrEqual(metrics.viewport.right + 1);
    expect(metrics.legend!.rect.top).toBeGreaterThanOrEqual(metrics.ruler.top - 1);
    expect(metrics.legend!.rect.bottom, JSON.stringify(metrics)).toBeLessThanOrEqual(metrics.visibleBottom + 1);
  };

  await expectLegendInsideWorkspace();
  await expect(page.getByTestId("history-status")).toHaveText("History 2 / Redo 0");

  await legend.click();
  await expect(page.getByTestId("inspector")).toHaveAttribute("data-inspector-entity", "legend");
  await page.getByLabel("Legend X").fill("100000");
  await page.getByLabel("Legend Y").fill("100000");
  await page.getByTestId("apply-legend-properties").click();
  await expectLegendInsideWorkspace();
  await expect(page.getByTestId("history-status")).toHaveText("History 2 / Redo 0");
  await expect(page.getByLabel("Legend X")).toHaveValue(await legend.getAttribute("data-legend-position-x"));
  await expect(page.getByLabel("Legend Y")).toHaveValue(await legend.getAttribute("data-legend-position-y"));

  await page.getByLabel("Legend X").fill("100000");
  await page.getByLabel("Legend Y").fill("100");
  await page.getByTestId("apply-legend-properties").click();
  await expectLegendInsideWorkspace();
  await expect(page.getByTestId("history-status")).toHaveText("History 3 / Redo 0");
});
