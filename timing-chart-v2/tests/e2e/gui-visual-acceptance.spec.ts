import { expect, test } from "@playwright/test";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PNG } from "pngjs";

const viewport = { width: 1672, height: 941 } as const;
const appRoot = process.cwd();
const repositoryRoot = resolve(appRoot, "..");
const outputRoot = resolve(repositoryRoot, "artifacts", "gui-visual-acceptance");
const referencePath = resolve(repositoryRoot, "references", "v2-gui-reference-v8", "golden-home-cycle-1672x941.png");

const target = {
  title: { x: 0, y: 0, width: 1672, height: 31 },
  tabs: { x: 0, y: 31, width: 1672, height: 34 },
  ribbon: { x: 0, y: 65, width: 1672, height: 102 },
  workspace: { x: 0, y: 167, width: 1672, height: 749 },
  left: { x: 0, y: 167, width: 265, height: 749 },
  center: { x: 265, y: 167, width: 1110, height: 749 },
  bottom: { x: 265, y: 676, width: 1110, height: 240 },
  inspector: { x: 1375, y: 167, width: 297, height: 749 },
  status: { x: 0, y: 916, width: 1672, height: 25 },
} as const;

function roundedRect(value: { x: number; y: number; width: number; height: number }) {
  return Object.fromEntries(Object.entries(value).map(([key, number]) => [key, Math.round(number * 100) / 100]));
}

function comparePng(reference: PNG, dut: PNG, mask: { left: number; top: number; right: number; bottom: number }) {
  expect(dut.width).toBe(reference.width);
  expect(dut.height).toBe(reference.height);
  const diff = new PNG({ width: reference.width, height: reference.height });
  let changedPixels = 0;
  let comparedPixels = 0;
  for (let y = 0; y < reference.height; y += 1) {
    for (let x = 0; x < reference.width; x += 1) {
      const index = (y * reference.width + x) * 4;
      const masked = x >= mask.left && x < mask.right && y >= mask.top && y < mask.bottom;
      const delta = Math.abs(reference.data[index] - dut.data[index]) + Math.abs(reference.data[index + 1] - dut.data[index + 1]) + Math.abs(reference.data[index + 2] - dut.data[index + 2]);
      if (!masked) {
        comparedPixels += 1;
        if (delta > 24) changedPixels += 1;
      }
      if (masked) {
        diff.data[index] = 160; diff.data[index + 1] = 160; diff.data[index + 2] = 160; diff.data[index + 3] = 255;
      } else if (delta > 24) {
        diff.data[index] = 220; diff.data[index + 1] = 40; diff.data[index + 2] = 40; diff.data[index + 3] = 230;
      } else {
        diff.data[index] = 255; diff.data[index + 1] = 255; diff.data[index + 2] = 255; diff.data[index + 3] = 0;
      }
    }
  }
  return { diff, changedPixels, comparedPixels, diffPercent: changedPixels / comparedPixels };
}

test("generates V1 reference vs V2 production visual evidence at the locked viewport", async ({ page }) => {
  await mkdir(outputRoot, { recursive: true });
  await page.setViewportSize(viewport);
  await page.goto("/?visual-reference");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await expect(page.getByTestId("cycle-ruler").locator("[data-cycle='10']")).toHaveCount(1);
  const host = page.getByTestId("cycle-surface");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_clock']").click();
  await expect(page.locator(".inspector-shell > .inspector")).toContainText("Clock");

  await copyFile(referencePath, resolve(outputRoot, "reference.png"));
  await page.screenshot({ path: resolve(outputRoot, "dut.png"), animations: "disabled" });

  const metrics = await page.evaluate((expected) => {
    const selectors = {
      title: ".app-titlebar",
      tabs: ".ribbon-tabs",
      ribbon: "[data-testid='ribbon']",
      workspace: ".desktop-workspace",
      bottom: "[data-testid='bottom-editor']",
      inspector: ".inspector-shell",
      status: ".status-bar",
    } as const;
    const rect = (selector: string) => document.querySelector<HTMLElement>(selector)?.getBoundingClientRect().toJSON() ?? null;
    const actual = Object.fromEntries(Object.entries(selectors).map(([name, selector]) => [name, rect(selector)])) as Record<string, { x: number; y: number; width: number; height: number }>;
    const inspector = actual.inspector as DOMRect;
    const workspace = actual.workspace as DOMRect;
    const workspaceElement = document.querySelector<HTMLElement>(selectors.workspace);
    const bottom = actual.bottom as DOMRect;
    const leftWidth = Number.parseFloat(getComputedStyle(workspaceElement).getPropertyValue("--gui-left-width"));
    const left = { x: workspace.x, y: workspace.y, width: leftWidth, height: workspace.height };
    const center = { x: left.x + left.width, y: workspace.y, width: inspector.x - (left.x + left.width), height: workspace.height };
    actual.left = left;
    actual.center = center;
    const differences = Object.fromEntries(Object.entries(actual).map(([name, value]) => {
      const expectedRect = expected[name as keyof typeof expected];
      const actualRect = value as { x: number; y: number; width: number; height: number };
      return [name, Object.fromEntries(Object.keys(expectedRect).map((key) => [key, Math.round(Math.abs(actualRect[key as keyof typeof actualRect] - expectedRect[key as keyof typeof expectedRect]) * 100) / 100]))];
    }));
    return {
      viewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
      actual,
      derived: { center, leftPaneWidth: left.width, inspectorWidth: inspector.width, bottomHeight: bottom.height },
      differences,
      ribbonOverflow: { clientWidth: document.querySelector<HTMLElement>("[data-testid='ribbon']")?.clientWidth ?? 0, scrollWidth: document.querySelector<HTMLElement>("[data-testid='ribbon']")?.scrollWidth ?? 0 },
    };
  }, target);

  const reference = PNG.sync.read(await readFile(resolve(outputRoot, "reference.png")));
  const dut = PNG.sync.read(await readFile(resolve(outputRoot, "dut.png")));
  const comparison = comparePng(reference, dut, { left: target.center.x, top: target.center.y + 36, right: target.inspector.x, bottom: target.bottom.y });
  await writeFile(resolve(outputRoot, "diff.png"), PNG.sync.write(comparison.diff));
  const report = {
    viewport,
    source: { reference: "references/v2-gui-reference-v8/golden-home-cycle-1672x941.png", dut: "V2 visual-reference /?visual-reference" },
    target,
    metrics,
    geometryPass: Object.values(metrics.differences).every((values) => Object.values(values as Record<string, number>).every((value) => value <= 2)),
    ribbonNoHorizontalScroll: metrics.ribbonOverflow.scrollWidth <= metrics.ribbonOverflow.clientWidth + 1,
    visualDiff: { ...comparison, diff: undefined, threshold: 0.05, pass: comparison.diffPercent <= 0.05, waveformViewportMasked: true },
    acceptance: "diagnostic-gap-report",
    artifacts: ["reference.png", "dut.png", "diff.png", "layout-metrics.json"],
  };
  await writeFile(resolve(outputRoot, "layout-metrics.json"), `${JSON.stringify(report, null, 2)}\n`);

  expect(metrics.viewport).toMatchObject({ ...viewport, devicePixelRatio: 1 });
  expect(metrics.ribbonOverflow.scrollWidth).toBeLessThanOrEqual(metrics.ribbonOverflow.clientWidth + 1);
  await expect(page.getByTestId("ribbon")).toBeVisible();
  await expect(page.getByTestId("bottom-editor")).toBeVisible();
  await expect(page.locator(".inspector-shell > .inspector")).toBeVisible();
});
