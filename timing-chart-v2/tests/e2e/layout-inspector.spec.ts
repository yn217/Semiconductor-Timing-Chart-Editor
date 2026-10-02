import { expect, test } from "@playwright/test";
import { resolve } from "node:path";
import { startInCycleSample } from "./cycle-startup.js";

startInCycleSample(test);

test("edits global row layout through one semantic operation and preserves it through Save/Open", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Home", exact: true }).click();
  const inspector = page.getByTestId("inspector-layout-editor");
  await expect(inspector).toBeVisible();
  const rows = host.locator("[data-role='wave-owner']");
  const firstRow = rows.first();
  const secondRow = rows.nth(1);
  const beforeFirstY = (await firstRow.boundingBox())?.y ?? 0;
  const beforeSecondY = (await secondRow.boundingBox())?.y ?? 0;
  const beforeRevision = await host.getAttribute("data-canonical-revision");
  await inspector.getByLabel("Inspector row height").fill("36");
  await inspector.getByLabel("Inspector signal spacing").fill("8");
  await inspector.getByLabel("Inspector role column width").fill("74");
  await inspector.getByLabel("Inspector signal name width").fill("224");
  await inspector.getByLabel("Inspector signal name alignment").selectOption("center");
  await inspector.getByLabel("Inspector signal name overflow").selectOption("wrap");
  await inspector.getByTestId("apply-inspector-layout").click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await expect(host).toHaveAttribute("data-canonical-revision", String(Number(beforeRevision) + 1));
  const afterFirstY = (await firstRow.boundingBox())?.y ?? 0;
  const afterSecondY = (await secondRow.boundingBox())?.y ?? 0;
  expect(afterSecondY - afterFirstY).not.toBe(beforeSecondY - beforeFirstY);
  await page.getByTestId("ribbon").getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 1");
  await page.getByTestId("ribbon").getByRole("button", { name: "Redo", exact: true }).click();
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  const download = page.waitForEvent("download");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Save", exact: true }).click();
  const savedPath = await (await download).path();
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(savedPath!);
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
  await expect(page.getByTestId("inspector-layout-editor").getByLabel("Inspector row height")).toHaveValue("36");
  await expect(page.getByTestId("inspector-layout-editor").getByLabel("Inspector signal spacing")).toHaveValue("8");
  await expect(page.getByTestId("inspector-layout-editor").getByLabel("Inspector role column width")).toHaveValue("74");
  await expect(page.getByTestId("inspector-layout-editor").getByLabel("Inspector signal name width")).toHaveValue("224");
  await expect(page.getByTestId("inspector-layout-editor").getByLabel("Inspector signal name alignment")).toHaveValue("center");
  await expect(page.getByTestId("inspector-layout-editor").getByLabel("Inspector signal name overflow")).toHaveValue("wrap");
  expect(await host.getAttribute("data-history-depth")).toBe("0");
});

test("cancels layout draft without a canonical mutation", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await expect(host).toHaveAttribute("data-canonical-revision", /^\d+$/);
  const inspector = page.getByTestId("inspector-layout-editor");
  const revision = await host.getAttribute("data-canonical-revision");
  await inspector.getByLabel("Inspector signal name width").fill("420");
  await inspector.getByTestId("cancel-inspector-layout").click();
  await expect(host).toHaveAttribute("data-canonical-revision", revision!);
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
});

test("auto fits a long rendered signal label through one layout command", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_data']").click();
  const signalInspector = page.getByTestId("inspector");
  await signalInspector.getByLabel("Inspector signal name", { exact: true }).fill("A_VERY_LONG_SIGNAL_NAME_FOR_LAYOUT_AUTOFIT");
  await signalInspector.getByLabel("Inspector signal name", { exact: true }).press("Enter");
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await expect(host.locator("[data-role='frozen-signal-name']").filter({ hasText: "A_VERY_LONG_SIGNAL_NAME_FOR_LAYOUT_AUTOFIT" })).toHaveCount(1);
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Home", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "More", exact: true }).click();
  await page.getByRole("menu", { name: "More Home Commands" }).getByRole("menuitem", { name: "Clear Selection", exact: true }).click();
  const layout = page.getByTestId("inspector-layout-editor");
  const before = Number(await layout.getByLabel("Inspector signal name width").inputValue());
  await expect(layout.getByTestId("layout-draft-note")).toContainText("only change this draft");
  await layout.getByTestId("auto-fit-inspector-layout").click();
  // Auto Fit only fills the Layout draft (no Canonical change) -- Apply commits it as one command.
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await page.getByTestId("apply-inspector-layout").click();
  await expect(page.getByTestId("history-status")).toHaveText("History 2 / Redo 0");
  const after = Number(await page.getByTestId("inspector-layout-editor").getByLabel("Inspector signal name width").inputValue());
  expect(after).toBeGreaterThan(before);
  await page.getByTestId("ribbon").getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 1");
  await expect(page.getByTestId("inspector-layout-editor").getByLabel("Inspector signal name width")).toHaveValue(String(before));
});

test("renders persisted label columns independently from the transient pane splitter", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const layout = page.getByTestId("inspector-layout-editor");
  const surface = host.locator("[data-role='timing-chart-surface']");
  const renderCounters = await surface.getAttribute("data-render-counters");
  await layout.getByLabel("Inspector role column width").fill("74");
  await layout.getByLabel("Inspector signal name width").fill("224");
  await layout.getByLabel("Inspector signal name alignment").selectOption("center");
  await layout.getByLabel("Inspector signal name overflow").selectOption("wrap");
  await layout.getByTestId("apply-inspector-layout").click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(page.locator(".column-headings")).toHaveCSS("grid-template-columns", "265px 74px 224px 0px 640px");
  await expect(surface.locator("[data-role='frozen-row']").first()).toHaveCSS("grid-template-columns", "74px 224px");
  await expect(surface.locator("[data-role='frozen-signal-name']").first()).toHaveCSS("white-space", "normal");
  await expect(surface.locator("[data-role='frozen-signal-name']").first()).toHaveCSS("text-overflow", "clip");
  const frozenLeft = await surface.locator("[data-role='frozen-label-rows']").evaluate((element) => Math.round(element.getBoundingClientRect().left));
  const headingLeft = await page.locator(".column-headings > span").nth(1).evaluate((element) => Math.round(element.getBoundingClientRect().left));
  expect(frozenLeft).toBe(headingLeft);
  expect(await surface.getAttribute("data-render-counters")).toBe(renderCounters);
  await layout.getByTestId("reset-inspector-layout").click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(layout.getByLabel("Inspector role column width")).toHaveValue("32");
  await expect(layout.getByLabel("Inspector signal name width")).toHaveValue("168");
  await expect(layout.getByLabel("Inspector signal name alignment")).toHaveValue("left");
  await expect(layout.getByLabel("Inspector signal name overflow")).toHaveValue("ellipsis");
});

test("keeps right-aligned short frozen labels inside the timing boundary", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(resolve("samples/golden-feature-coverage/timing_chart_feature_coverage_pack/samples/20_transaction_cycle_linked_views.tcd.json"));
  await expect(host).toHaveAttribute("data-editor-idle", "true");

  const label = host.locator("[data-role='frozen-row'][data-row-id='tag'] [data-role='frozen-signal-name']");
  await expect(label).toHaveText("tag");
  const geometry = await label.evaluate((element) => {
    const range = element.ownerDocument.createRange();
    range.selectNodeContents(element);
    const textRect = range.getBoundingClientRect();
    const frozenRect = element.closest("[data-role='frozen-label-rows']")!.getBoundingClientRect();
    return { textRight: textRect.right, frozenRight: frozenRect.right, paddingRight: getComputedStyle(element).paddingRight };
  });
  expect(geometry.paddingRight).toBe("8px");
  expect(geometry.textRight).toBeLessThanOrEqual(geometry.frozenRight - 4);
});

test("keeps representative APB protocol labels inset in the frozen column", async ({ page }) => {
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(resolve("samples/golden-protocol/timing_chart_sample_pack/samples/01_apb_register_access.tcd.json"));
  await expect(host).toHaveAttribute("data-editor-idle", "true");

  for (const [rowId, name] of [["psel", "PSEL"], ["penable", "PENABLE"], ["pslverr", "PSLVERR"]] as const) {
    const label = host.locator(`[data-role='frozen-row'][data-row-id='${rowId}'] [data-role='frozen-signal-name']`);
    await expect(label).toHaveText(name);
    const geometry = await label.evaluate((element) => {
      const range = element.ownerDocument.createRange();
      range.selectNodeContents(element);
      const textRect = range.getBoundingClientRect();
      const frozenRect = element.closest("[data-role='frozen-label-rows']")!.getBoundingClientRect();
      return { textLeft: textRect.left, textRight: textRect.right, frozenLeft: frozenRect.left, frozenRight: frozenRect.right };
    });
    expect(geometry.textLeft).toBeGreaterThanOrEqual(geometry.frozenLeft + 4);
    expect(geometry.textRight).toBeLessThanOrEqual(geometry.frozenRight - 4);
  }
});

test("preserves APB label policy and frozen geometry through Save/Open for every policy", async ({ page }) => {
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(resolve("samples/golden-protocol/timing_chart_sample_pack/samples/01_apb_register_access.tcd.json"));
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Home", exact: true }).click();

  const layout = page.getByTestId("inspector-layout-editor");
  const signalNames = [["psel", "PSEL"], ["penable", "PENABLE"], ["pslverr", "PSLVERR"]] as const;
  for (const alignment of ["left", "center", "right"] as const) {
    for (const overflow of ["ellipsis", "expand", "wrap"] as const) {
      await layout.getByLabel("Inspector role column width").fill("74");
      await layout.getByLabel("Inspector signal name width").fill("180");
      await layout.getByLabel("Inspector signal name alignment").selectOption(alignment);
      await layout.getByLabel("Inspector signal name overflow").selectOption(overflow);
      await layout.getByTestId("apply-inspector-layout").click();
      await expect(host).toHaveAttribute("data-editor-idle", "true");

      const download = page.waitForEvent("download");
      await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
      await page.getByTestId("ribbon").getByRole("button", { name: "Save", exact: true }).click();
      const savedPath = await (await download).path();
      expect(savedPath, `${alignment}/${overflow} Save output`).toBeTruthy();
      await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(savedPath!);
      await expect(host).toHaveAttribute("data-editor-idle", "true");

      await expect(layout.getByLabel("Inspector role column width")).toHaveValue("74");
      await expect(layout.getByLabel("Inspector signal name width")).toHaveValue("180");
      await expect(layout.getByLabel("Inspector signal name alignment")).toHaveValue(alignment);
      await expect(layout.getByLabel("Inspector signal name overflow")).toHaveValue(overflow);
      await expect(page.locator("main.editor-shell")).toHaveAttribute("data-layout-overflow", overflow);
      for (const [rowId, expectedName] of signalNames) {
        const label = host.locator(`[data-role='frozen-row'][data-row-id='${rowId}'] [data-role='frozen-signal-name']`);
        await expect(label).toHaveText(expectedName);
        const geometry = await label.evaluate((element) => {
          const range = element.ownerDocument.createRange();
          range.selectNodeContents(element);
          const textRect = range.getBoundingClientRect();
          const frozenRect = element.closest("[data-role='frozen-label-rows']")!.getBoundingClientRect();
          return { textLeft: textRect.left, textRight: textRect.right, frozenLeft: frozenRect.left, frozenRight: frozenRect.right };
        });
        expect(geometry.textLeft, `${alignment}/${overflow}/${expectedName} left boundary`).toBeGreaterThanOrEqual(geometry.frozenLeft + 4);
        expect(geometry.textRight, `${alignment}/${overflow}/${expectedName} right boundary`).toBeLessThanOrEqual(geometry.frozenRight - 4);
      }
      await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
    }
  }
});

test("preserves canonical Signal names and safe frozen-column geometry across alignment and overflow policies", async ({ page }) => {
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(resolve("samples/golden-feature-coverage/timing_chart_feature_coverage_pack/samples/20_transaction_cycle_linked_views.tcd.json"));
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Home", exact: true }).click();

  const shell = page.locator("main.editor-shell");
  const layout = page.getByTestId("inspector-layout-editor");
  const signalNames = [
    ["clk", "CLK"], ["req", "req_valid"], ["tag", "tag"],
    ["stage", "pipeline_stage"], ["rsp", "rsp_valid"], ["rtag", "rsp_tag"],
  ] as const;

  for (const alignment of ["left", "center", "right"] as const) {
    for (const overflow of ["ellipsis", "expand", "wrap"] as const) {
      await layout.getByLabel("Inspector signal name width").fill("180");
      await layout.getByLabel("Inspector signal name alignment").selectOption(alignment);
      await layout.getByLabel("Inspector signal name overflow").selectOption(overflow);
      await layout.getByTestId("apply-inspector-layout").click();
      await expect(host).toHaveAttribute("data-editor-idle", "true");
      await expect(shell).toHaveAttribute("data-layout-overflow", overflow);

      for (const [rowId, expectedName] of signalNames) {
        const label = host.locator(`[data-role='frozen-row'][data-row-id='${rowId}'] [data-role='frozen-signal-name']`);
        await expect(label).toHaveText(expectedName);
      }
      const shortLabel = host.locator("[data-role='frozen-row'][data-row-id='tag'] [data-role='frozen-signal-name']");
      const geometry = await shortLabel.evaluate((element) => {
        const range = element.ownerDocument.createRange();
        range.selectNodeContents(element);
        const textRect = range.getBoundingClientRect();
        const frozenRect = element.closest("[data-role='frozen-label-rows']")!.getBoundingClientRect();
        return { textLeft: textRect.left, textRight: textRect.right, frozenLeft: frozenRect.left, frozenRight: frozenRect.right };
      });
      expect(geometry.textLeft).toBeGreaterThanOrEqual(geometry.frozenLeft + 4);
      expect(geometry.textRight).toBeLessThanOrEqual(geometry.frozenRight - 4);
    }
  }

});

test("keeps right-aligned frozen labels inset during horizontal scroll and zoom", async ({ page }) => {
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(resolve("samples/showcase/25_long_timeline_stress_showcase.tcd.json"));
  await expect(page.getByRole("heading", { name: "Long Timeline / Scroll Stress Showcase" })).toBeVisible();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  const longLabel = host.locator("[data-role='frozen-row'][data-row-id='long_in_0'] [data-role='frozen-signal-name']");
  await expect(longLabel).toHaveText("input_req_0");
  const viewport = host.locator("[data-role='timeline-viewport']");
  const horizontalScrollbar = page.getByTestId("timeline-hscroll");
  const scrollRange = await viewport.evaluate((element) => element.scrollWidth - element.clientWidth);
  expect(scrollRange).toBeGreaterThan(0);
  await horizontalScrollbar.evaluate((element) => { element.scrollLeft = element.scrollWidth; element.dispatchEvent(new Event("scroll")); });
  await expect.poll(() => viewport.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
  await page.getByTestId("ribbon").getByRole("button", { name: "Zoom In", exact: true }).click();
  const scrolledGeometry = await longLabel.evaluate((element) => {
    const range = element.ownerDocument.createRange();
    range.selectNodeContents(element);
    const textRect = range.getBoundingClientRect();
    const frozenRect = element.closest("[data-role='frozen-label-rows']")!.getBoundingClientRect();
    return { textRight: textRect.right, frozenRight: frozenRect.right };
  });
  expect(scrolledGeometry.textRight).toBeLessThanOrEqual(scrolledGeometry.frozenRight - 4);
  await page.getByTestId("ribbon").getByRole("button", { name: "Fit All", exact: true }).click();
  await expect.poll(() => viewport.evaluate((element) => element.scrollLeft)).toBe(0);
});
