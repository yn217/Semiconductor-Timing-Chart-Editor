import { expect, test } from "@playwright/test";
import { startInCycleMode } from "./cycle-startup.js";
import { readFile } from "node:fs/promises";

startInCycleMode(test);

test("edits individual signal spacing through Inspector with local row invalidation and Save/Open", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const surface = host.locator("[data-role='timing-chart-surface']");
  const target = host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']");
  const following = host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_ready']");
  await target.click();
  const inspector = page.getByTestId("inspector-signal-properties");
  await expect(inspector).toBeVisible();
  const countersBefore = await surface.getAttribute("data-render-counters");
  const beforeY = (await following.boundingBox())?.y ?? 0;
  await inspector.getByLabel("Inspector signal spacing after").fill("12");
  await inspector.getByTestId("apply-inspector-signal").click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  const afterY = (await following.boundingBox())?.y ?? 0;
  expect(afterY).toBeGreaterThan(beforeY);
  const countersAfter = await surface.getAttribute("data-render-counters");
  expect(countersAfter).not.toBeNull();
  const beforeCounters = JSON.parse(countersBefore!);
  const afterCounters = JSON.parse(countersAfter!);
  expect(afterCounters.waveDromRenders).toBe(beforeCounters.waveDromRenders);
  expect(afterCounters.localGeometryBuilds).toBe(beforeCounters.localGeometryBuilds);
  expect(afterCounters.rowPositionUpdates).toBeGreaterThan(beforeCounters.rowPositionUpdates);
  await page.getByTestId("ribbon").getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 1");
  await page.getByTestId("ribbon").getByRole("button", { name: "Redo", exact: true }).click();
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  const download = page.waitForEvent("download");
  await page.getByTestId("ribbon").getByRole("button", { name: "Save", exact: true }).click();
  const savedPath = await (await download).path();
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(savedPath!);
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  await expect(page.getByTestId("inspector-signal-properties").getByLabel("Inspector signal spacing after")).toHaveValue("12");
});

test("keeps invalid Group and Signal spacing drafts out of the canonical document", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const inspector = page.getByTestId("inspector");

  await host.locator("[data-role='left-group-header'][data-group-id='grp_cycle_control'] [data-role='tree-branch']").click();
  await inspector.getByLabel("Group spacing before").fill("-1");
  await inspector.getByTestId("apply-group-properties").click();
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
  await expect(page.getByTestId("dirty-status")).toHaveText("Clean");

  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  await inspector.getByLabel("Inspector signal spacing after").fill("-2");
  await inspector.getByTestId("apply-inspector-signal").click();
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
  await expect(page.getByTestId("dirty-status")).toHaveText("Clean");
  await expect(host).toHaveAttribute("data-canonical-revision", "0");
});

test("edits Group and Signal spacing independently and together with exact persistence and export", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const surface = host.locator("[data-role='timing-chart-surface']");
  const first = host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_reset_n']");
  const following = host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']");
  const inspector = page.getByTestId("inspector");

  await host.locator("[data-role='left-group-header'][data-group-id='grp_cycle_control'] [data-role='tree-branch']").click();
  await expect(inspector.getByLabel("Group spacing before")).toHaveValue("0");
  const groupBefore = (await following.boundingBox())?.y ?? 0;
  await inspector.getByLabel("Group spacing before").fill("7");
  await inspector.getByLabel("Group spacing after").fill("9");
  await inspector.getByTestId("apply-group-properties").click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  expect((await following.boundingBox())?.y ?? 0).toBeGreaterThan(groupBefore);

  await first.click();
  const signalBefore = (await following.boundingBox())?.y ?? 0;
  await inspector.getByLabel("Inspector signal spacing before").fill("3");
  await inspector.getByLabel("Inspector signal spacing after").fill("5");
  await inspector.getByTestId("apply-inspector-signal").click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(page.getByTestId("history-status")).toHaveText("History 2 / Redo 0");
  expect((await following.boundingBox())?.y ?? 0).toBeGreaterThan(signalBefore);

  await page.locator(".ribbon-tabs").getByRole("button", { name: "Home", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "More", exact: true }).click();
  await page.getByRole("menu", { name: "More Home Commands" }).getByRole("menuitem", { name: "Clear Selection", exact: true }).click();
  await expect(page.getByTestId("inspector-layout-editor")).toBeVisible();
  await page.getByTestId("inspector-layout-editor").getByLabel("Inspector signal spacing").fill("6");
  await page.getByTestId("inspector-layout-editor").getByTestId("apply-inspector-layout").click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(page.getByTestId("history-status")).toHaveText("History 3 / Redo 0");

  const save = page.waitForEvent("download");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Save", exact: true }).click();
  const savedPath = await (await save).path();
  expect(savedPath).toBeTruthy();
  const saved = JSON.parse(await readFile(savedPath!, "utf8")) as { layout: { signalSpacing: number }; signalGroups: Array<{ id: string; spacingBefore?: number; spacingAfter?: number }>; signals: Array<{ id: string; spacingBefore?: number; spacingAfter?: number }> };
  expect(saved.layout.signalSpacing).toBe(6);
  expect(saved.signalGroups.find((group) => group.id === "grp_cycle_control")).toMatchObject({ spacingBefore: 7, spacingAfter: 9 });
  expect(saved.signals.find((signal) => signal.id === "sig_cycle_reset_n")).toMatchObject({ spacingBefore: 3, spacingAfter: 5 });

  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(savedPath!);
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
  await page.getByTestId("ribbon").getByRole("button", { name: "Export", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Export Timing Chart" });
  for (const format of ["svg", "png", "pdf"] as const) {
    await dialog.getByLabel("Export format").selectOption(format);
    const pending = page.waitForEvent("download");
    await dialog.getByRole("button", { name: `Export ${format.toUpperCase()}` }).click();
    const bytes = await readFile((await (await pending).path())!);
    expect(bytes.length).toBeGreaterThan(100);
    if (format === "svg") expect(bytes.toString("utf8")).toContain("sig_cycle_reset_n");
    if (format === "png") expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    if (format === "pdf") expect(bytes.subarray(0, 5).toString("utf8")).toBe("%PDF-");
  }
  await page.getByRole("button", { name: "Close export" }).click();
  await expect(surface).toHaveAttribute("data-render-counters", /waveDromRenders/);
});
