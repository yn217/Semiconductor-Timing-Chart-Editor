import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("Group Band Inspector preserves scope/style, derived spacing, persistence and export", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const surface = host.locator("[data-role='timing-chart-surface']");
  await surface.locator("[data-role='left-group-header'][data-group-id='grp_cycle_control'] [data-role='tree-branch']").click();
  const inspector = page.getByTestId("inspector");
  const countersBefore = JSON.parse((await surface.getAttribute("data-render-counters"))!);
  await inspector.getByLabel("Group show background").check();
  await inspector.getByLabel("Group background").fill("#123456");
  await inspector.getByLabel("Group opacity").fill("0.4");
  await inspector.getByLabel("Group show border").check();
  await inspector.getByLabel("Group border").fill("#ff0000");
  await inspector.getByLabel("Group extend").selectOption("label");
  await inspector.getByLabel("Group show header").check();
  await inspector.getByTestId("apply-group-properties").click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await expect(surface.locator("[data-role='frozen-row'][data-group-id='grp_cycle_control']").first()).toHaveCSS("opacity", "0.4");
  await expect(surface.locator("[data-role='frozen-row'][data-group-id='grp_cycle_control']").first()).toHaveCSS("--group-background", "#123456");
  const countersAfter = JSON.parse((await surface.getAttribute("data-render-counters"))!);
  expect(countersAfter.waveDromRenders).toBe(countersBefore.waveDromRenders);
  expect(countersAfter.localGeometryBuilds).toBe(countersBefore.localGeometryBuilds);

  await page.getByTestId("ribbon").getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 1");
  await page.getByTestId("ribbon").getByRole("button", { name: "Redo", exact: true }).click();
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");

  const save = page.waitForEvent("download");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Save", exact: true }).click();
  const savedPath = await (await save).path();
  expect(savedPath).toBeTruthy();
  const saved = JSON.parse(await readFile(savedPath!, "utf8")) as { signalGroups: Array<{ id: string; style?: { showBackground?: boolean; background?: string; opacity?: number; extend?: string; border?: string; showHeader?: boolean } }> };
  expect(saved.signalGroups.find((group) => group.id === "grp_cycle_control")?.style).toMatchObject({ showBackground: true, background: "#123456", opacity: 0.4, extend: "label", border: "#ff0000", showHeader: true });
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(savedPath!);
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
  await surface.locator("[data-role='left-group-header'][data-group-id='grp_cycle_control'] [data-role='tree-branch']").click();
  await expect(page.getByTestId("inspector").getByLabel("Group extend")).toHaveValue("label");

  await page.getByTestId("ribbon").getByRole("button", { name: "Export", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Export Timing Chart" });
  for (const format of ["svg", "png", "pdf"] as const) {
    await dialog.getByLabel("Export format").selectOption(format);
    const pending = page.waitForEvent("download");
    await dialog.getByRole("button", { name: `Export ${format.toUpperCase()}` }).click();
    const bytes = await readFile((await (await pending).path())!);
    expect(bytes.length).toBeGreaterThan(100);
    if (format === "svg") {
      const svg = bytes.toString("utf8");
      expect(svg).toContain('data-layer="group-bands"');
      expect(svg).toContain('data-scope="label"');
      expect(svg).toContain('fill="#123456"');
      expect(svg).toContain('stroke="#ff0000"');
    }
    if (format === "png") expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    if (format === "pdf") expect(bytes.subarray(0, 5).toString("utf8")).toBe("%PDF-");
  }
});

test("keeps invalid Group Band opacity draft-only", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await host.locator("[data-role='left-group-header'][data-group-id='grp_cycle_control'] [data-role='tree-branch']").click();
  const inspector = page.getByTestId("inspector");
  await inspector.getByLabel("Group opacity").fill("1.5");
  await inspector.getByTestId("apply-group-properties").click();
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
  await expect(page.getByTestId("dirty-status")).toHaveText("Clean");
  await expect(host).toHaveAttribute("data-canonical-revision", "0");
});
