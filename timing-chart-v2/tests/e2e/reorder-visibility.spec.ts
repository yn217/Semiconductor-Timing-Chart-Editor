import { expect, test } from "@playwright/test";

const signalOrder = async (surface: Locator) =>
  (await surface.getAttribute("data-canonical-row-ids") ?? "").split(",").filter(Boolean);

test("creates an empty Signal Group from the tree through one group.create command", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const surface = host.locator("[data-role='timing-chart-surface']");
  const countersBefore = JSON.parse(await surface.getAttribute("data-render-counters") ?? "null") as Record<string, number>;
  const groupsBefore = await surface.locator("[data-role='tree-branch'][data-group-id]").count();
  const emptyGroupsBefore = await page.locator("[data-role='empty-group'][data-group-id]").count();
  await page.getByTestId("create-group").click();
  await expect(page.locator("[data-role='empty-group'][data-group-id]")).toHaveCount(emptyGroupsBefore + 1);
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await expect(page.getByLabel("Inspector group name")).toHaveValue("Group 4");
  const countersAfter = JSON.parse(await surface.getAttribute("data-render-counters") ?? "null") as Record<string, number>;
  expect(countersAfter.waveDromRenders).toBe(countersBefore.waveDromRenders);
  expect(countersAfter.localGeometryBuilds).toBe(countersBefore.localGeometryBuilds);
  await page.getByTestId("ribbon").getByRole("button", { name: "Undo" }).click();
  await expect(page.locator("[data-role='empty-group'][data-group-id]")).toHaveCount(emptyGroupsBefore);
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 1");
});

test("Group Inspector reflects and controls view-only collapse state", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const surface = host.locator("[data-role='timing-chart-surface']");
  const group = surface.locator("[data-role='left-group-header'][data-group-id='grp_cycle_control'] [data-role='tree-branch']");
  await group.click();
  const inspector = page.getByTestId("inspector");
  const collapse = inspector.getByLabel("Inspector group collapsed");
  const before = JSON.parse(await surface.getAttribute("data-render-counters") ?? "null") as Record<string, number>;
  await expect(collapse).not.toBeChecked();
  await collapse.check();
  await expect(collapse).toBeChecked();
  await expect(host).toHaveAttribute("data-collapsed-groups", "grp_cycle_control");
  await expect(page.getByTestId("revision-status")).toHaveText("Canonical revision 0");
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
  const after = JSON.parse(await surface.getAttribute("data-render-counters") ?? "null") as Record<string, number>;
  expect(after.waveDromRenders).toBe(before.waveDromRenders);
  expect(after.localGeometryBuilds).toBe(before.localGeometryBuilds);
  await collapse.uncheck();
  await expect(host).toHaveAttribute("data-collapsed-groups", "");
});

test("hides and restores a selected signal without rebuilding its stable SVG", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const surface = host.locator("[data-role='timing-chart-surface']");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  const requestSvg = await surface.locator("[data-signal-id='sig_cycle_request'] > svg").elementHandle();
  const countersBefore = JSON.parse(await surface.getAttribute("data-render-counters") ?? "null") as Record<string, number>;

  await page.getByTestId("signal-visibility").click();
  await expect(page.getByTestId("signal-visibility")).toHaveText("Show signal");
  await expect(surface.locator("[data-role='left-row'][data-row-id='sig_cycle_request']")).toHaveCount(1);
  await expect(surface.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']")).toHaveCount(1);
  await expect(surface.locator("[data-role='timing-row'][data-row-id='sig_cycle_request'], [data-role='wave-owner'][data-signal-id='sig_cycle_request']")).toHaveCount(0);
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  const countersHidden = JSON.parse(await surface.getAttribute("data-render-counters") ?? "null") as Record<string, number>;
  expect(countersHidden.waveDromRenders).toBe(countersBefore.waveDromRenders);
  expect(countersHidden.localGeometryBuilds).toBe(countersBefore.localGeometryBuilds);
  expect(countersHidden.rowPositionUpdates).toBe(countersBefore.rowPositionUpdates);

  await page.getByTestId("signal-visibility").click();
  await expect(page.getByTestId("signal-visibility")).toHaveText("Hide signal");
  await expect(surface.locator("[data-row-id='sig_cycle_request']")).toHaveCount(3);
  const restoredSvg = await surface.locator("[data-signal-id='sig_cycle_request'] > svg").elementHandle();
  expect(await requestSvg!.evaluate((before, after) => before === after, restoredSvg)).toBe(true);
  const countersShown = JSON.parse(await surface.getAttribute("data-render-counters") ?? "null") as Record<string, number>;
  expect(countersShown.waveDromRenders).toBe(countersBefore.waveDromRenders);
  expect(countersShown.localGeometryBuilds).toBe(countersBefore.localGeometryBuilds);
  await expect(page.getByTestId("history-status")).toHaveText("History 2 / Redo 0");
});

test("reorders a signal by drag-and-drop with row-position updates only", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const surface = host.locator("[data-role='timing-chart-surface']");
  const countersBefore = JSON.parse(await surface.getAttribute("data-render-counters") ?? "null") as Record<string, number>;
  const ownerOrderBefore = await surface.locator("[data-role='stable-waveform-surface'] > [data-signal-id]").evaluateAll((owners) => owners.map((owner) => (owner as HTMLElement).dataset.signalId));
  const validSvg = await surface.locator("[data-signal-id='sig_cycle_valid'] > svg").elementHandle();

  const source = surface.locator("[data-role='left-row'][data-row-id='sig_cycle_valid']");
  const target = surface.locator("[data-role='left-row'][data-row-id='sig_cycle_reset_n']");
  await source.dragTo(target, { targetPosition: { x: 120, y: 2 } });
  await expect(page.getByTestId("revision-status")).toHaveText("Canonical revision 1");
  expect(await signalOrder(surface)).toEqual([
    "sig_cycle_clock", "sig_cycle_valid", "sig_cycle_reset_n", "sig_cycle_request",
    "sig_cycle_ready", "sig_cycle_data", "sig_cycle_result", "sig_cycle_state",
  ]);
  const countersAfter = JSON.parse(await surface.getAttribute("data-render-counters") ?? "null") as Record<string, number>;
  expect(countersAfter.waveDromRenders).toBe(countersBefore.waveDromRenders);
  expect(countersAfter.localGeometryBuilds).toBe(countersBefore.localGeometryBuilds);
  expect(countersAfter.rowPositionUpdates).toBeGreaterThan(countersBefore.rowPositionUpdates);
  const ownerOrderAfter = await surface.locator("[data-role='stable-waveform-surface'] > [data-signal-id]").evaluateAll((owners) => owners.map((owner) => (owner as HTMLElement).dataset.signalId));
  expect(ownerOrderAfter).toEqual(ownerOrderBefore);
  const currentValidSvg = await surface.locator("[data-signal-id='sig_cycle_valid'] > svg").elementHandle();
  expect(await validSvg!.evaluate((before, after) => before === after, currentValidSvg)).toBe(true);
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
});

test("moves an arbitrary group as one semantic drag-and-drop operation", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const surface = host.locator("[data-role='timing-chart-surface']");
  const countersBefore = await surface.getAttribute("data-render-counters");
  const payloadHandle = surface.locator("[data-role='left-group-header'][data-group-id='grp_cycle_payload'] [data-role='tree-branch'][draggable='true']");
  const controlRow = surface.locator("[data-role='left-row'][data-row-id='sig_cycle_clock']");
  await payloadHandle.evaluate((element) => {
    const transfer = new DataTransfer();
    element.dispatchEvent(new DragEvent("dragstart", { bubbles: true, dataTransfer: transfer }));
  });
  await controlRow.evaluate((element) => {
    const transfer = new DataTransfer();
    element.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, clientY: element.getBoundingClientRect().top + 2, dataTransfer: transfer }));
    element.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: transfer }));
  });
  await payloadHandle.dispatchEvent("dragend");
  await expect(page.getByTestId("revision-status")).toHaveText("Canonical revision 1");
  expect(await signalOrder(surface)).toEqual([
    "sig_cycle_data", "sig_cycle_result", "sig_cycle_state", "sig_cycle_clock",
    "sig_cycle_reset_n", "sig_cycle_request", "sig_cycle_ready", "sig_cycle_valid",
  ]);
  const countersAfter = JSON.parse(await surface.getAttribute("data-render-counters") ?? "null") as Record<string, number>;
  const countersInitial = JSON.parse(countersBefore ?? "null") as Record<string, number>;
  expect(countersAfter.waveDromRenders).toBe(countersInitial.waveDromRenders);
  expect(countersAfter.localGeometryBuilds).toBe(countersInitial.localGeometryBuilds);
  await expect(surface.locator("[data-role='left-row'][data-group-start='true']").first()).toHaveAttribute("data-group-name", "Payload");
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
});

test("moves a signal across groups without changing its semantic role", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const surface = host.locator("[data-role='timing-chart-surface']");
  await surface.locator("[data-role='left-row'][data-row-id='sig_cycle_valid']").dragTo(page.locator("[data-group-target='grp_cycle_scratch']"));
  expect(await signalOrder(surface)).toEqual([
    "sig_cycle_clock", "sig_cycle_reset_n", "sig_cycle_request", "sig_cycle_ready",
    "sig_cycle_data", "sig_cycle_result", "sig_cycle_state", "sig_cycle_valid",
  ]);
  await expect(page.locator("[data-group-target='grp_cycle_scratch'] small")).toHaveText("1");
  await expect(surface.locator("[data-role='frozen-row'][data-row-id='sig_cycle_valid'] [data-role='signal-role']")).toHaveText("o");
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
});

test("restores exact Canonical/Left/Frozen/Timing row order and stable SVG identity through Undo and Redo of a reorder", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const surface = host.locator("[data-role='timing-chart-surface']");

  const frozenOrder = async () => surface.locator("[data-role='frozen-row'][data-row-id]").evaluateAll((rows) => rows.map((row) => (row as HTMLElement).dataset.rowId));
  const timingOrder = async () => surface.locator("[data-role='stable-waveform-surface'] > [data-signal-id]").evaluateAll((owners) => owners.map((owner) => (owner as HTMLElement).dataset.signalId));

  // The Left tree order is driven directly by the Canonical signalGroups.rows order, so it doubles
  // as the Canonical assertion here alongside the independently-rendered Frozen and Timing surfaces.
  const orderBefore = await signalOrder(surface);
  const frozenBefore = await frozenOrder();
  const timingBefore = await timingOrder();
  const validSvg = await surface.locator("[data-signal-id='sig_cycle_valid'] > svg").elementHandle();

  const source = surface.locator("[data-role='left-row'][data-row-id='sig_cycle_valid']");
  const target = surface.locator("[data-role='left-row'][data-row-id='sig_cycle_reset_n']");
  await source.dragTo(target, { targetPosition: { x: 120, y: 2 } });
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  const orderMoved = await signalOrder(surface);
  expect(orderMoved).not.toEqual(orderBefore);

  await page.getByTestId("ribbon").getByRole("button", { name: "Undo" }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 1");
  expect(await signalOrder(surface)).toEqual(orderBefore);
  expect(await frozenOrder()).toEqual(frozenBefore);
  expect(await timingOrder()).toEqual(timingBefore);
  let restoredSvg = await surface.locator("[data-signal-id='sig_cycle_valid'] > svg").elementHandle();
  expect(await validSvg!.evaluate((before, after) => before === after, restoredSvg)).toBe(true);

  await page.getByTestId("ribbon").getByRole("button", { name: "Redo" }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  expect(await signalOrder(surface)).toEqual(orderMoved);
  // The lightweight Frozen label shells DO get reordered to match Canonical (like the Left tree),
  // but the heavy Timing waveform owners intentionally never reorder in the DOM - only their CSS
  // position changes - to avoid moving/rerendering heavy WaveDrom SVG (see stable-surface.spec.ts).
  // So Frozen must track Canonical order exactly, while Timing's owner *set* must stay identical.
  expect(await frozenOrder()).toEqual(orderMoved);
  expect(new Set(await timingOrder())).toEqual(new Set(timingBefore));
  restoredSvg = await surface.locator("[data-signal-id='sig_cycle_valid'] > svg").elementHandle();
  expect(await validSvg!.evaluate((before, after) => before === after, restoredSvg)).toBe(true);
});

test("cancels a drag preview without canonical or History changes", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const surface = host.locator("[data-role='timing-chart-surface']");
  const source = surface.locator("[data-role='left-row'][data-row-id='sig_cycle_valid']");
  const target = surface.locator("[data-role='left-row'][data-row-id='sig_cycle_reset_n']");
  await source.evaluate((element) => {
    const transfer = new DataTransfer();
    element.dispatchEvent(new DragEvent("dragstart", { bubbles: true, dataTransfer: transfer }));
  });
  await target.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    element.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, clientY: bounds.top + 2, dataTransfer: new DataTransfer() }));
  });
  await expect(target).toHaveAttribute("data-drop-position", "before");
  await source.dispatchEvent("dragend");
  await expect(surface.locator("[data-drop-position]")).toHaveCount(0);
  await expect(page.getByTestId("revision-status")).toHaveText("Canonical revision 0");
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
});
