import path from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { generatePerformanceDocument } from "@timing-chart-v2/testing";
import { documentState, expectViewOnly } from "./view-only.js";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const protocolSample = path.resolve(dirname, "../../samples/old/pre-reset-2026-10-02/showcase/24_protocol_transaction_showcase.tcd.json");
const protocolDocument = JSON.parse(await readFile(protocolSample, "utf8")) as { readonly signals: readonly unknown[] };

for (const viewport of [{ width: 1672, height: 941 }, { width: 1280, height: 720 }]) {
  test(`Cycle fixed-column boundaries do not show isolated idle grips with the default document at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
    await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();

    const boundaries = await page.evaluate(() => {
      const read = (selector: string) => {
        const element = document.querySelector<HTMLElement>(selector);
        if (!element) throw new Error(`Missing ${selector}`);
        const pseudo = getComputedStyle(element, "::after");
        const box = element.getBoundingClientRect();
        return {
          top: box.top + Number.parseFloat(pseudo.top),
          height: pseudo.height,
          content: pseudo.content,
          borderRightWidth: getComputedStyle(element).borderRightWidth,
        };
      };
      const header = document.querySelector<HTMLElement>(".column-headings")!.getBoundingClientRect();
      return {
        tree: read(".left-pane-resize-handle"),
        frozen: read(".frozen-pane-resize-handle"),
        treeBoundary: getComputedStyle(document.querySelector<HTMLElement>(".surface-host [data-role='left-tree-rows']")!).borderRightWidth,
        frozenBoundary: getComputedStyle(document.querySelector<HTMLElement>(".surface-host [data-role='frozen-label-rows']")!).borderRightWidth,
        header: { top: header.top, bottom: header.bottom },
      };
    });

    // Structural borders remain continuous. The short resize grip belongs
    // in the fixed-column header, not as an isolated mark mid-canvas.
    expect(boundaries.treeBoundary).toBe("1px");
    expect(boundaries.frozenBoundary).toBe("1px");
    for (const marker of [boundaries.tree, boundaries.frozen]) {
      expect(marker.height).toBe("24px");
      expect(marker.top).toBeGreaterThanOrEqual(boundaries.header.top);
      expect(marker.top + Number.parseFloat(marker.height)).toBeLessThanOrEqual(boundaries.header.bottom);
    }
  });

  test(`Cycle fixed-column boundaries do not show isolated idle grips with the protocol showcase at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
    await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(protocolSample);
    await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true");
    await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();

    const boundaries = await page.evaluate(() => {
      const read = (selector: string) => {
        const element = document.querySelector<HTMLElement>(selector);
        if (!element) throw new Error(`Missing ${selector}`);
        const pseudo = getComputedStyle(element, "::after");
        const box = element.getBoundingClientRect();
        return { top: box.top + Number.parseFloat(pseudo.top), height: pseudo.height };
      };
      const header = document.querySelector<HTMLElement>(".column-headings")!.getBoundingClientRect();
      return {
        tree: read(".left-pane-resize-handle"),
        frozen: read(".frozen-pane-resize-handle"),
        signalCount: document.querySelector<HTMLElement>(".editor-shell")?.dataset.signalCount,
        header: { top: header.top, bottom: header.bottom },
      };
    });

    expect(protocolDocument.signals).toHaveLength(32);
    await expect(page.locator(".editor-shell")).toHaveAttribute("data-signal-count", "32");
    for (const marker of [boundaries.tree, boundaries.frozen]) {
      expect(marker.height).toBe("24px");
      expect(marker.top).toBeGreaterThanOrEqual(boundaries.header.top);
      expect(marker.top + Number.parseFloat(marker.height)).toBeLessThanOrEqual(boundaries.header.bottom);
    }
  });
}

for (const viewport of [{ width: 1672, height: 941 }, { width: 1280, height: 720 }]) {
  test(`fixed-column grips stay structurally aligned through signal-count and layout interactions at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    const host = page.getByTestId("cycle-surface");
    await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
    await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();

    for (const signalCount of [3, 8, 50]) {
      const document = generatePerformanceDocument({ signalCount, cycleCount: signalCount === 50 ? 5_000 : 100 });
      await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({
        name: `orphan-divider-${signalCount}.tcd`,
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify(document)),
      });
      await expect(host).toHaveAttribute("data-editor-idle", "true", { timeout: 60_000 });
      await expect(page.locator(".editor-shell")).toHaveAttribute("data-signal-count", String(signalCount));
      await assertGripStructure(page);
    }

    const viewOnlyBefore = await documentState(page);
    const canonicalRevision = await host.getAttribute("data-canonical-revision");
    const groupCollapse = page.locator("[data-role='left-group-header'] [data-role='tree-collapse']").first();
    await expect(groupCollapse).toBeVisible();
    const initialRows = await page.locator("[data-role='left-row']").count();
    await groupCollapse.click();
    await expect.poll(() => page.locator("[data-role='left-row']").count()).toBeLessThan(initialRows);
    await assertGripStructure(page);
    await page.locator("[data-role='left-group-header'] [data-role='tree-collapse']").first().click();
    await expect.poll(() => page.locator("[data-role='left-row']").count()).toBe(initialRows);

    const viewportElement = page.getByTestId("cycle-viewport");
    await expect(page.getByTestId("timeline-hscroll")).toBeVisible();
    const horizontal = page.getByTestId("timeline-hscroll");
    const horizontalMetrics = await horizontal.evaluate((element) => ({ left: element.scrollLeft, max: element.scrollWidth - element.clientWidth }));
    expect(horizontalMetrics.max).toBeGreaterThan(0);
    await horizontal.evaluate((element) => { element.scrollLeft = element.scrollWidth; });
    await expect.poll(() => horizontal.evaluate((element) => element.scrollLeft)).toBeGreaterThan(horizontalMetrics.left);
    const verticalMetrics = await viewportElement.evaluate((element) => ({ top: element.scrollTop, max: element.scrollHeight - element.clientHeight }));
    expect(verticalMetrics.max).toBeGreaterThan(0);
    await viewportElement.evaluate((element) => { element.scrollTop = element.scrollHeight; });
    await expect.poll(() => viewportElement.evaluate((element) => element.scrollTop)).toBeGreaterThan(verticalMetrics.top);
    await assertGripStructure(page);

    const bottomResizer = page.getByTestId("bottom-resizer");
    const initialBottom = Number(await bottomResizer.getAttribute("aria-valuenow"));
    const resizeBox = (await bottomResizer.boundingBox())!;
    await page.mouse.move(resizeBox.x + resizeBox.width / 2, resizeBox.y + resizeBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(resizeBox.x + resizeBox.width / 2, resizeBox.y + resizeBox.height / 2 - 40, { steps: 3 });
    await page.mouse.up();
    await expect.poll(() => bottomResizer.getAttribute("aria-valuenow")).not.toBe(String(initialBottom));
    await assertGripStructure(page);
    await expectViewOnly(page, viewOnlyBefore);
    await expect(host).toHaveAttribute("data-canonical-revision", canonicalRevision!);
  });
}

async function assertGripStructure(page: import("@playwright/test").Page): Promise<void> {
  const structure = await page.evaluate(() => {
    const marker = (selector: string) => {
      const element = document.querySelector<HTMLElement>(selector);
      if (!element) throw new Error(`Missing ${selector}`);
      const style = getComputedStyle(element, "::after");
      const bounds = element.getBoundingClientRect();
      return { top: bounds.top + Number.parseFloat(style.top), height: Number.parseFloat(style.height) };
    };
    const header = document.querySelector<HTMLElement>(".column-headings")!.getBoundingClientRect();
    return {
      header: { top: header.top, bottom: header.bottom },
      markers: [marker(".left-pane-resize-handle"), marker(".frozen-pane-resize-handle")],
      treeBorder: getComputedStyle(document.querySelector<HTMLElement>(".surface-host [data-role='left-tree-rows']")!).borderRightWidth,
      frozenBorder: getComputedStyle(document.querySelector<HTMLElement>(".surface-host [data-role='frozen-label-rows']")!).borderRightWidth,
    };
  });
  expect(structure.treeBorder).toBe("1px");
  expect(structure.frozenBorder).toBe("1px");
  for (const marker of structure.markers) {
    expect(marker.height).toBe(24);
    expect(marker.top).toBeGreaterThanOrEqual(structure.header.top);
    expect(marker.top + marker.height).toBeLessThanOrEqual(structure.header.bottom);
  }
}

test("Cycle resize handles remain pointer-operable at their structural header boundaries", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  const viewOnlyBefore = await documentState(page);
  const handle = page.getByTestId("left-pane-resizer");
  const initial = await handle.getAttribute("aria-valuenow");
  const handleBox = (await handle.boundingBox())!;
  const header = (await page.locator(".column-headings").boundingBox())!;
  const x = handleBox.x + handleBox.width / 2;
  const y = header.y + header.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 24, y, { steps: 3 });
  await page.mouse.up();
  await expect(handle).not.toHaveAttribute("aria-valuenow", initial ?? "");
  await expectViewOnly(page, viewOnlyBefore);
});
