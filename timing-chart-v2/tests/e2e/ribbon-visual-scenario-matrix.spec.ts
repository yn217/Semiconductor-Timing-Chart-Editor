import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { captureScenarioReview } from "../../harness/gui/ai-review-bundle.mjs";

const tabs = ["File", "Home", "Insert", "Timeline", "Annotation", "View", "Review", "AI"] as const;

test("captures deterministic production Ribbon scenario manifests", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  const output = testInfo.outputPath("ribbon-scenarios");
  await mkdir(output, { recursive: true });
  const gitHead = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const manifests = [];
  for (const tab of tabs) {
    await page.locator(".ribbon-tabs").getByRole("button", { name: tab, exact: true }).click();
    await expect(page.locator("[data-testid='ribbon']")).toBeVisible();
    manifests.push(await captureScenarioReview({ page, scenario: `RIBBON-${tab.toUpperCase()}-DESKTOP`, gitHead, viewport: [1672, 941], rules: [{ selector: "[data-testid='ribbon']", target: "Ribbon" }, { selector: "[data-testid='ribbon'] .ribbon-group button", target: "Ribbon command", iconSelector: "svg", labelSelector: "span" }], actions: [`switch:${tab}`], outputPath: resolve(output, `${tab.toLowerCase()}.json`) }));
  }
  expect(manifests).toHaveLength(tabs.length);
  expect(manifests.map((manifest) => manifest.scenario)).toEqual(tabs.map((tab) => `RIBBON-${tab.toUpperCase()}-DESKTOP`));
  expect(manifests.every((manifest) => manifest.testedCommit === gitHead && manifest.capture.viewport.join("x") === "1672x941")).toBe(true);
});

test("covers compressed Ribbon layout and Home round-trip without semantic mutation", async ({ page }) => {
  await page.setViewportSize({ width: 1365, height: 800 });
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const revision = await host.getAttribute("data-canonical-revision");
  const history = await page.getByTestId("history-status").textContent();
  const ribbon = page.getByTestId("ribbon");
  const ribbonHeight = (await ribbon.boundingBox())!.height;
  const workspaceY = (await page.locator(".desktop-workspace").boundingBox())!.y;
  for (const tab of ["Insert", "View", "Review", "AI", "Home", "View", "Home"]) {
    await page.locator(".ribbon-tabs").getByRole("button", { name: tab, exact: true }).click();
    await expect(page.locator(".ribbon-tabs").getByRole("button", { name: tab, exact: true })).toHaveClass(/active/);
    expect((await ribbon.boundingBox())!.height).toBe(ribbonHeight);
    expect((await page.locator(".desktop-workspace").boundingBox())!.y).toBe(workspaceY);
    expect(await host.getAttribute("data-canonical-revision")).toBe(revision);
  }
  expect(await page.getByTestId("history-status").textContent()).toBe(history);
  expect(await ribbon.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
});
