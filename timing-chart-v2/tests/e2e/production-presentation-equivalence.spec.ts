import { expect, test, type Page } from "@playwright/test";
import { startInCycleSample } from "./cycle-startup.js";

startInCycleSample(test);

test.use({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });

type PresentationContract = {
  topLevel: string[];
  tabs: string[];
  ribbonGroups: Array<{ name: string; controls: string[] }>;
  geometry: Record<string, { x: number; y: number; width: number; height: number }>;
  tokens: Record<string, string>;
};

async function readContract(page: Page): Promise<PresentationContract> {
  return await page.evaluate(() => {
    const rect = (selector: string) => {
      const element = document.querySelector<HTMLElement>(selector);
      if (!element) throw new Error(`Missing presentation selector: ${selector}`);
      const box = element.getBoundingClientRect();
      return { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height) };
    };
    const normalize = (value: string | null) => value?.replace(/\s+/g, " ").trim() ?? "";
    const ribbonGroups = Array.from(document.querySelectorAll<HTMLElement>("[data-testid='ribbon'] [data-major-group], [data-testid='ribbon'] .ribbon-group"))
      .map((group) => ({
        name: group.getAttribute("data-major-group") ?? group.getAttribute("aria-label") ?? "",
        controls: Array.from(group.querySelectorAll<HTMLElement>("button, input, select, output"))
          .map((control) => normalize(control.getAttribute("aria-label") ?? control.textContent)),
      }));
    const shell = document.querySelector<HTMLElement>(".editor-shell");
    if (!shell) throw new Error("Missing editor shell");
    const style = getComputedStyle(shell);
    const tokenNames = ["--gui-left-width", "--gui-frozen-width", "--gui-inspector-width", "--gui-bottom-height", "--gui-row-height", "--gui-role-width", "--gui-signal-width", "--gui-ribbon-height"];
    const frame = (selector: string) => {
      const box = rect(selector);
      return { x: box.x, y: box.y, width: box.width, height: 0 };
    };
    return {
      topLevel: Array.from(shell.children).map((element) => `${element.tagName.toLowerCase()}.${element.className}`),
      tabs: Array.from(document.querySelectorAll<HTMLElement>(".ribbon-tabs > button")).map((button) => normalize(button.textContent)),
      ribbonGroups,
      geometry: {
        ribbon: rect("[data-testid='ribbon']"),
        left: frame(".desktop-workspace"),
        bottom: rect("[data-testid='bottom-editor']"),
        inspector: rect(".inspector-shell"),
        minimap: rect("[data-testid='minimap']"),
        status: rect(".status-bar"),
      },
      tokens: Object.fromEntries(tokenNames.map((name) => [name, normalize(style.getPropertyValue(name))])),
    };
  });
}

test("normal and visual-reference use one Production presentation contract", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });
  const normalPage = await context.newPage();
  const referencePage = await context.newPage();
  await normalPage.goto("/");
  await referencePage.goto("/?visual-reference");
  await expect(normalPage.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await expect(referencePage.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  const normal = await readContract(normalPage);
  const reference = await readContract(referencePage);
  const report = {
    viewport: { width: 1672, height: 941, deviceScaleFactor: 1 },
    sameRibbonStructure: JSON.stringify(normal.ribbonGroups) === JSON.stringify(reference.ribbonGroups),
    sameTabsStructure: JSON.stringify(normal.tabs) === JSON.stringify(reference.tabs),
    samePaneGeometry: JSON.stringify({ left: normal.geometry.left, inspector: normal.geometry.inspector }) === JSON.stringify({ left: reference.geometry.left, inspector: reference.geometry.inspector }),
    sameBottomGeometry: JSON.stringify(normal.geometry.bottom) === JSON.stringify(reference.geometry.bottom),
    sameInspectorGeometry: JSON.stringify(normal.geometry.inspector) === JSON.stringify(reference.geometry.inspector),
    sameVisualTokens: JSON.stringify(normal.tokens) === JSON.stringify(reference.tokens),
    normal,
    reference,
  };
  console.log(JSON.stringify(report, null, 2));
  expect(report.sameRibbonStructure).toBe(true);
  expect(report.sameTabsStructure).toBe(true);
  expect(report.samePaneGeometry).toBe(true);
  expect(report.sameBottomGeometry).toBe(true);
  expect(report.sameInspectorGeometry).toBe(true);
  expect(report.sameVisualTokens).toBe(true);
  await context.close();
});
