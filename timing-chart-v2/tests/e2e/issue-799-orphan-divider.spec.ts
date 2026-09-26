import path from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const protocolSample = path.resolve(dirname, "../../samples/showcase/24_protocol_transaction_showcase.tcd.json");
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

test("Cycle resize handles remain pointer-operable at their structural header boundaries", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  const history = await page.getByTestId("history-status").innerText();
  const dirty = await page.getByTestId("dirty-status").innerText();
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
  await expect(page.getByTestId("history-status")).toHaveText(history);
  await expect(page.getByTestId("dirty-status")).toHaveText(dirty);
});
