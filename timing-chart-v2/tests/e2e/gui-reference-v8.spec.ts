import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });

test("matches the v8 shell contract without mutating canonical state", async ({ page }) => {
  await page.goto("/?visual-reference");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  const before = await page.locator("[data-role='timing-chart-surface']").getAttribute("data-render-counters");
  const metrics = await page.evaluate(() => {
    const rect = (selector: string) => {
      const element = document.querySelector<HTMLElement>(selector);
      if (!element) throw new Error(`Missing ${selector}`);
      const box = element.getBoundingClientRect();
      return { x: box.x, y: box.y, width: box.width, height: box.height };
    };
    const rowY = (selector: string) => Array.from(document.querySelectorAll<HTMLElement>(selector)).map((element) => Math.round(element.getBoundingClientRect().y));
    const ribbon = document.querySelector<HTMLElement>("[data-testid='ribbon']")!;
    return {
      title: rect(".app-titlebar"), tabs: rect(".ribbon-tabs"), ribbon: rect("[data-testid='ribbon']"),
      workspace: rect(".desktop-workspace"), bottom: rect("[data-testid='bottom-editor']"), inspector: rect(".inspector-shell"), status: rect(".status-bar"),
      leftWidth: Number.parseFloat(getComputedStyle(document.querySelector<HTMLElement>(".editor-shell")!).getPropertyValue("--gui-left-width")),
      frozenWidth: Number.parseFloat(getComputedStyle(document.querySelector<HTMLElement>(".editor-shell")!).getPropertyValue("--gui-frozen-width")),
      ribbonOverflow: { clientWidth: ribbon.clientWidth, scrollWidth: ribbon.scrollWidth },
      rowY: { left: rowY("[data-role='left-row'][data-row-id]"), frozen: rowY("[data-role='frozen-row'][data-row-id]"), wave: rowY("[data-role='wave-owner'][data-signal-id]") },
      display: { grid: rect("[data-testid='home-grid-toggle']"), snap: rect("[data-testid='home-snap-toggle']") },
    };
  });
  expect(metrics.title).toMatchObject({ height: 31 });
  expect(metrics.tabs).toMatchObject({ y: 31, height: 34 });
  expect(metrics.ribbon).toMatchObject({ y: 65, height: 102 });
  expect(metrics.leftWidth).toBe(265);
  expect(metrics.frozenWidth).toBe(209);
  expect(metrics.inspector.width).toBe(297);
  expect(metrics.bottom.height).toBe(240);
  expect(metrics.status.height).toBe(25);
  expect(metrics.ribbonOverflow.scrollWidth).toBeLessThanOrEqual(metrics.ribbonOverflow.clientWidth + 1);
  await expect(page.locator(".ribbon-major-group")).toHaveCount(6);
  for (const name of ["File", "Edit", "Layout", "Time", "Zoom", "Options"]) {
    await expect(page.locator(`[data-major-group='${name}']`)).toBeVisible();
  }
  await expect(page.getByTestId("ribbon").getByLabel("Display")).toBeVisible();
  await expect(page.locator(".left-column-heading strong")).toHaveText("Signals / Groups");
  const treeSearch = page.getByTestId("signal-tree-search-top");
  await expect(treeSearch).toBeVisible();
  const treeSearchBox = await treeSearch.boundingBox();
  expect(treeSearchBox?.y ?? 0).toBeGreaterThanOrEqual(204);
  expect(treeSearchBox?.y ?? 0).toBeLessThan(220);
  await expect(page.locator(".tree-add-button")).toHaveAttribute("aria-label", "Add signal or group");
  expect((await page.locator(".tree-add-button").boundingBox())?.width ?? 0).toBeGreaterThanOrEqual(60);
  await expect(page.locator(".column-headings")).toContainText("Time Scale: Cycle");
  await expect(page.getByTestId("playhead")).toHaveAttribute("data-playhead-cycle", "0");
  expect((await page.locator("[data-role='tree-signal-role'][data-presentation='input']").first().boundingBox())?.width).toBe(28);
  expect((await page.locator("[data-role='signal-role'][data-presentation='input']").first().boundingBox())?.width).toBe(28);
  const firstWave = await page.locator("[data-role='wave-owner']").first().boundingBox();
  expect(firstWave?.width ?? 0).toBeGreaterThan(890);
  await expect(page.getByTestId("selection-status")).toHaveText("clk");
  await expect(page.getByTestId("inspector")).toContainText("Clock");
  await expect(page.locator(".bottom-tabs")).toContainText("Signal Editor");
  await expect(page.getByTestId("clock-context-toolbar").locator("svg")).toHaveCount(5);
  await expect(page.getByTestId("follow-selection").locator(".." )).toContainText("Follow Selection");
  const minimap = page.getByTestId("minimap");
  await expect(minimap).toBeVisible();
  expect((await minimap.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(140);
  const treeMore = page.locator(".tree-more-button");
  await treeMore.click();
  await page.getByRole("menu", { name: "More tree actions" }).getByRole("menuitem", { name: "Collapse All Groups" }).click();
  await expect(page.getByTestId("revision-status")).toHaveText("Canonical revision 0");
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
  await treeMore.click();
  await page.getByRole("menu", { name: "More tree actions" }).getByRole("menuitem", { name: "Expand All Groups" }).click();
  await expect(page.locator("[data-role='left-row'][data-row-id='sig_cycle_reset_n']")).toBeVisible();
  expect(metrics.rowY.left.length).toBeGreaterThan(0);
  expect(Math.max(...metrics.rowY.left.map((y, index) => Math.abs(y - (metrics.rowY.frozen[index] ?? y))))).toBeLessThanOrEqual(1);
  const signalWaveRows = await page.locator("[data-role='wave-owner'][data-signal-id]").evaluateAll((owners) => owners.map((owner) => {
    const id = (owner as HTMLElement).dataset.signalId;
    const frozen = document.querySelector<HTMLElement>(`[data-role='frozen-row'][data-row-id='${id}']`);
    return { frozenY: frozen?.getBoundingClientRect().y ?? 0, waveY: (owner as HTMLElement).getBoundingClientRect().y };
  }));
  expect(Math.max(...signalWaveRows.map(({ frozenY, waveY }) => Math.abs(frozenY - waveY)))).toBeLessThanOrEqual(1);
  expect(await page.locator("[data-role='tree-signal-role'] .comment-icon, [data-role='signal-role'] .comment-icon").count()).toBeGreaterThan(0);
  expect(await page.locator("[data-role='tree-visibility'] svg, [data-role='tree-more'] svg, [data-role='tree-collapse'] svg").count()).toBeGreaterThan(0);
  expect(await page.locator("[data-role='timing-chart-surface']").getAttribute("data-render-counters")).toBe(before);
  const bottomToolbar = page.getByTestId("clock-context-toolbar");
  await expect(bottomToolbar).toBeVisible();
  await expect(bottomToolbar.getByRole("button")).toHaveText(["Presets", "Duplicate", "Import...", "Export...", "Preview"]);
  await page.getByTestId("clock-preview").click();
  await expect(page.getByTestId("clock-preview-status")).toContainText("Preview only");
  expect(await page.locator("[data-role='timing-chart-surface']").getAttribute("data-render-counters")).toBe(before);
  await page.screenshot({ path: "artifacts/gui-v8/reference-contract-dut.png", animations: "disabled" });
});

test("applies the v8 Signal Inspector style controls as one semantic operation", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  const host = page.getByTestId("cycle-surface");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_data']").click();
  const inspector = page.getByTestId("inspector");
  await inspector.getByLabel("Inspector text color").fill("#224466");
  await inspector.getByLabel("Inspector label background").fill("#eef5ff");
  await inspector.getByLabel("Inspector label font").fill("Arial");
  await inspector.getByLabel("Inspector label size").fill("14");
  await inspector.getByLabel("Inspector label bold").check();
  await inspector.getByLabel("Inspector label underline").check();
  const before = JSON.parse(await host.locator("[data-role='timing-chart-surface']").getAttribute("data-render-counters") ?? "null") as Record<string, number>;
  await inspector.getByTestId("apply-inspector-signal").click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  const row = host.locator("[data-role='left-row'][data-row-id='sig_cycle_data']");
  await expect(row).toHaveCSS("color", "rgb(34, 68, 102)");
  await expect(row).toHaveCSS("font-family", /Arial/);
  await expect(row).toHaveCSS("font-size", "14px");
  await expect(row).toHaveCSS("font-weight", "700");
  await expect(row).toHaveCSS("text-decoration-line", "underline");
  const after = JSON.parse(await host.locator("[data-role='timing-chart-surface']").getAttribute("data-render-counters") ?? "null") as Record<string, number>;
  expect(after.waveDromRenders).toBe(before.waveDromRenders);
  expect(after.localGeometryBuilds).toBe(before.localGeometryBuilds);
});
