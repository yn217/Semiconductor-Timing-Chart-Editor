import { expect, test } from "@playwright/test";

test.describe("Edge Counter compact layout", () => {
  test("keeps all controls reachable in a compact desktop grid", async ({ page }) => {
    await page.goto("/");
    const host = page.getByTestId("cycle-surface");
    await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
    await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_clock']").click();
    const editor = page.getByTestId("signal-editor");
    const counter = editor.locator(".clock-edge-counter");
    await expect(counter).toBeVisible();

    const layout = await counter.evaluate((node) => {
      const rect = node.getBoundingClientRect();
      const labels = [...node.querySelectorAll("label")].map((label) => label.getBoundingClientRect());
      return { width: rect.width, height: rect.height, labelTop: labels.map((item) => Math.round(item.top)), scrollWidth: node.scrollWidth, clientWidth: node.clientWidth };
    });
    expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth);
    expect(new Set(layout.labelTop).size).toBeGreaterThan(1);
    expect(layout.height).toBeLessThan(260);
    await expect(editor.getByLabel("Clock edge counter show")).toBeVisible();
    await expect(editor.getByLabel("Clock edge counter mode")).toBeVisible();
    await expect(editor.getByLabel("Clock edge counter count from")).toBeVisible();
    await expect(editor.getByLabel("Clock edge counter every")).toBeVisible();
    await expect(editor.getByLabel("Clock edge counter position")).toBeVisible();
    await expect(editor.getByLabel("Clock edge counter X offset")).toBeVisible();
    await expect(editor.getByLabel("Clock edge counter Y offset")).toBeVisible();
  });

  test("reflows without clipping at a narrow bottom-editor width", async ({ page }) => {
    await page.setViewportSize({ width: 1000, height: 720 });
    await page.goto("/");
    const host = page.getByTestId("cycle-surface");
    await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
    await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_clock']").click();
    const editor = page.getByTestId("signal-editor");
    const counter = editor.locator(".clock-edge-counter");
    const layout = await counter.evaluate((node) => ({ scrollWidth: node.scrollWidth, clientWidth: node.clientWidth, rect: node.getBoundingClientRect().toJSON() }));
    expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth);
    expect(layout.rect.width).toBeGreaterThan(0);
    await expect(editor.getByTestId("apply-clock-edge-counter")).toBeVisible();
  });

  test("uses the selected Bookmark identity for marker count-from", async ({ page }) => {
    await page.goto("/");
    const host = page.getByTestId("cycle-surface");
    await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
    const tabs = page.locator(".ribbon-tabs");
    await tabs.getByRole("button", { name: "Timeline", exact: true }).click();
    const timeline = page.getByTestId("timeline-editor");

    await page.getByLabel("Timeline range start").fill("1");
    await page.getByLabel("Timeline range end").fill("2");
    await timeline.getByRole("button", { name: "Add marker" }).click();
    await page.getByLabel("Timeline range end").fill("7");
    await page.getByLabel("Timeline range start").fill("6");
    await timeline.getByRole("button", { name: "Add marker" }).click();
    const markerOptions = timeline.locator("[data-bookmark-id]");
    await expect(markerOptions).toHaveCount(2);

    await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_clock']").click();
    const editor = page.getByTestId("signal-editor");
    await editor.getByLabel("Clock edge counter show").check();
    await editor.getByLabel("Clock edge counter count from").selectOption("marker");
    const marker = editor.getByLabel("Clock edge counter marker");
    const markerBValue = await marker.locator("option").filter({ hasText: "cycle 6" }).getAttribute("value");
    expect(markerBValue).toBeTruthy();
    await marker.selectOption(markerBValue!);
    await editor.getByTestId("apply-clock-edge-counter").click();
    await expect(host).toHaveAttribute("data-editor-idle", "true");

    const edgeCycles = await host.locator("[data-role='clock-edge-number'][data-signal-id='sig_cycle_clock']").evaluateAll((elements) => elements.map((element) => Number(element.getAttribute("data-edge-counter-id")?.split(":").at(-1))));
    expect(edgeCycles.length).toBeGreaterThan(0);
    expect(Math.min(...edgeCycles)).toBeGreaterThanOrEqual(6);
    expect(edgeCycles.some((cycle) => cycle < 6)).toBe(false);

    await editor.getByTestId("editor-undo").click();
    await expect(host).toHaveAttribute("data-editor-idle", "true");
    await expect(host.locator("[data-role='clock-edge-number'][data-signal-id='sig_cycle_clock']")).toHaveCount(0);
    await editor.getByTestId("editor-redo").click();
    await expect(host).toHaveAttribute("data-editor-idle", "true");
    await expect(editor.getByLabel("Clock edge counter marker")).toHaveValue(markerBValue!);

    const downloadPromise = page.waitForEvent("download");
    await tabs.getByRole("button", { name: "File", exact: true }).click();
    await page.getByTestId("ribbon").getByRole("button", { name: "Save", exact: true }).click();
    const saved = await downloadPromise;
    const savedPath = await saved.path();
    expect(savedPath).toBeTruthy();
    await tabs.getByRole("button", { name: "Timeline", exact: true }).click();
    await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_clock']").click();
    const reopenedEditor = page.getByTestId("signal-editor");
    await reopenedEditor.getByLabel("Clock edge counter count from").selectOption("signal-start");
    await reopenedEditor.getByTestId("apply-clock-edge-counter").click();
    await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(savedPath!);
    await expect(page.getByTestId("unsaved-file-dialog")).toBeVisible();
    await page.getByTestId("unsaved-discard").click();
    await expect(host).toHaveAttribute("data-editor-idle", "true");
    await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_clock']").click();
    const restoredEditor = page.getByTestId("signal-editor");
    await expect(restoredEditor.getByLabel("Clock edge counter count from")).toHaveValue("marker");
    await expect(restoredEditor.getByLabel("Clock edge counter marker")).toHaveValue(markerBValue!);
    const restoredCycles = await host.locator("[data-role='clock-edge-number'][data-signal-id='sig_cycle_clock']").evaluateAll((elements) => elements.map((element) => Number(element.getAttribute("data-edge-counter-id")?.split(":").at(-1))));
    expect(restoredCycles.length).toBeGreaterThan(0);
    expect(Math.min(...restoredCycles)).toBeGreaterThanOrEqual(6);
  });
});
