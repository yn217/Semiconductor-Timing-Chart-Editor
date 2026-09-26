import { expect, test } from "@playwright/test";
import { generatePerformanceDocument } from "@timing-chart-v2/testing";
import { startInCycleMode } from "./cycle-startup.js";

startInCycleMode(test);

test("hierarchy copy count and clipboard follow the currently visible scope and search results", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");

  const document = generatePerformanceDocument({ signalCount: 50, cycleCount: 100 });
  document.signals[1]!.source.instancePath = ["other"];
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({
    name: "hierarchy-copy-scopes.tcd",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(document)),
  });
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await page.getByRole("button", { name: "More tree actions" }).click();
  await page.getByTestId("hierarchy-open").click();
  const hierarchy = page.getByTestId("hierarchy-browser");
  await expect(hierarchy).toBeVisible();
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin: new URL(page.url()).origin });

  const copyButton = hierarchy.getByTestId("copy-selected-hierarchy-paths");
  await hierarchy.getByRole("checkbox", { name: "Select path perf.clk_0 for copying" }).check();
  await hierarchy.getByRole("checkbox", { name: "Select path other.signal_1 for copying" }).check();
  await expect(copyButton).toHaveText("Copy Selected Paths (2)");

  await hierarchy.getByTestId("hierarchy-path-search").fill("clk_0");
  await expect(copyButton).toHaveText("Copy Selected Paths (1)");
  await expect(hierarchy.getByRole("checkbox", { name: "Select path perf.clk_0 for copying" })).toBeChecked();
  await copyButton.click();
  await expect(hierarchy.getByTestId("hierarchy-copy-status")).toHaveText("Copied 1 full path");
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe("perf.clk_0");

  await hierarchy.getByTestId("hierarchy-path-search").fill("");
  await hierarchy.getByLabel("Hierarchy scope", { exact: true }).selectOption("perf");
  await hierarchy.getByRole("checkbox", { name: "Select path perf.clk_0 for copying" }).check();
  await hierarchy.getByRole("checkbox", { name: "Select path perf.signal_2 for copying" }).check();
  await expect(copyButton).toHaveText("Copy Selected Paths (2)");
  await hierarchy.getByLabel("Hierarchy scope", { exact: true }).selectOption("other");
  await expect(copyButton).toHaveText("Copy Selected Paths (0)");
  await expect(copyButton).toBeDisabled();
  await expect(hierarchy.getByTestId("hierarchy-copy-status")).toContainText("0 selected paths are available");

  await expect(host).toHaveAttribute("data-canonical-revision", "0");
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
  await expect(page.getByTestId("dirty-status")).toHaveText("Clean");
});
