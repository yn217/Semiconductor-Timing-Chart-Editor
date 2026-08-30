import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { captureScenarioReview } from "../../harness/gui/ai-review-bundle.mjs";

test("captures Signal visibility before/after/undo/redo visual bundles", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const output = testInfo.outputPath("signal-visibility");
  await mkdir(output, { recursive: true });
  const gitHead = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const row = host.locator("[data-role='left-row'][data-row-id='sig_cycle_ready']");
  const capture = async (name: string) => {
    const image = resolve(output, `${name}.png`);
    await page.screenshot({ path: image, animations: "disabled" });
    return captureScenarioReview({ page, scenario: `SIGNAL-VISIBILITY-${name.toUpperCase()}`, gitHead, viewport: [1672, 941], rules: [{ selector: "[data-role='left-row'][data-row-id='sig_cycle_ready']", target: "left-row:sig_cycle_ready" }, { selector: "[data-role='frozen-row'][data-row-id='sig_cycle_ready']", target: "timing-row:sig_cycle_ready" }], actions: [`capture:${name}`], images: { current: image }, expectedChange: ["left-row:sig_cycle_ready", "timing-row:sig_cycle_ready"], stableRegions: ["ribbon", "ruler", "inspector-shell"], outputPath: resolve(output, `${name}.json`) });
  };
  await capture("before");
  const revisionBefore = await host.getAttribute("data-canonical-revision");
  await row.locator("[data-role='tree-visibility']").click();
  await expect(host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_ready']")).toHaveCount(0);
  const after = await capture("after-hide");
  expect(after.diagnostics.findings.filter((finding) => ["CONSOLE_ERROR", "PAGE_ERROR", "RESOURCE_FAILURE"].includes(finding.category))).toEqual([]);
  expect(await host.getAttribute("data-canonical-revision")).toBe(String(Number(revisionBefore) + 1));
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Home", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Undo", exact: true }).click();
  await expect(host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_ready']")).toHaveCount(1);
  await capture("after-undo");
  await page.getByTestId("ribbon").getByRole("button", { name: "Redo", exact: true }).click();
  await expect(host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_ready']")).toHaveCount(0);
  await capture("after-redo");
});
