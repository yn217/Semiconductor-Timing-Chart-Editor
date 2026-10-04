import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { startInCycleMode } from "./cycle-startup.js";

startInCycleMode(test);

for (const viewport of [{ width: 1280, height: 720 }, { width: 1672, height: 941 }]) {
  test(`Group header hide keeps Left/Frozen/Timing rows aligned at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    const host = page.getByTestId("cycle-surface");
    await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
    const surface = host.locator("[data-role='timing-chart-surface']");
    await surface.locator("[data-role='left-group-header'][data-group-id='grp_cycle_control'] [data-role='tree-branch']").click();
    const inspector = page.getByTestId("inspector");
    await inspector.getByLabel("Group show header").uncheck();
    await inspector.getByTestId("apply-group-properties").click();
    await expect(host).toHaveAttribute("data-editor-idle", "true");

    for (const role of ["left-group-header", "frozen-group-header", "timing-group-header"]) {
      const heights = await surface.locator(`[data-role='${role}'][data-group-id='grp_cycle_control']`).evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().height));
      expect(heights.length).toBeLessThanOrEqual(1);
      for (const height of heights) expect(height).toBeLessThanOrEqual(1);
    }
    const rowBoxes = await Promise.all(["left-row", "frozen-row", "timing-row"].map((role) => surface.locator(`[data-role='${role}'][data-row-id='sig_cycle_request']`).boundingBox()));
    expect(rowBoxes.every(Boolean)).toBe(true);
    expect(Math.abs(rowBoxes[0]!.y - rowBoxes[1]!.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(rowBoxes[1]!.y - rowBoxes[2]!.y)).toBeLessThanOrEqual(1);
    await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
    await expect(page.getByTestId("dirty-status")).toHaveText("Modified");

    await page.getByTestId("ribbon").getByRole("button", { name: "Undo", exact: true }).click();
    await expect(surface.locator("[data-role='timing-group-header'][data-group-id='grp_cycle_control']").first()).toHaveJSProperty("offsetHeight", 32);
    await page.getByTestId("ribbon").getByRole("button", { name: "Redo", exact: true }).click();
    await expect(surface.locator("[data-role='timing-group-header'][data-group-id='grp_cycle_control']").first()).toHaveJSProperty("offsetHeight", 0);

    const download = page.waitForEvent("download");
    await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
    await page.getByTestId("ribbon").getByRole("button", { name: "Save", exact: true }).click();
    const savedPath = await (await download).path();
    expect(savedPath).toBeTruthy();
    const saved = JSON.parse(await readFile(savedPath!, "utf8")) as { signalGroups: Array<{ id: string; style?: { showHeader?: boolean; headerHeight?: number } }> };
    expect(saved.signalGroups.find((group) => group.id === "grp_cycle_control")?.style).toMatchObject({ showHeader: false, headerHeight: 32 });
    await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(savedPath!);
    await expect(host).toHaveAttribute("data-editor-idle", "true");
    await expect(surface.locator("[data-role='timing-group-header'][data-group-id='grp_cycle_control']").first()).toHaveJSProperty("offsetHeight", 0);
  });
}
