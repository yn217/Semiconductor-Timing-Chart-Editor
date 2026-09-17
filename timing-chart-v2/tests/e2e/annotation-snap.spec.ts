import { expect, test } from "@playwright/test";
import { canonicalFixture } from "../fixtures/canonical.js";

async function createAnnotation(page: import("@playwright/test").Page, type: string) {
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Annotation", exact: true }).click();
  await page.getByLabel("Annotation type").selectOption(type);
  const host = page.getByTestId("cycle-surface");
  const before = new Set(await host.locator("[data-role='annotation-owner'][data-annotation-id]").evaluateAll((items) => items.map((item) => item.getAttribute("data-annotation-id"))));
  await page.getByTestId("annotation-toolbar").getByRole("button", { name: "Add annotation" }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  const findNewId = () => host.locator("[data-role='annotation-owner'][data-annotation-id]").evaluateAll((items, previous) => items.map((item) => item.getAttribute("data-annotation-id")).find((id) => id && !previous.includes(id)), [...before]);
  await expect.poll(findNewId).toBeTruthy();
  const annotationId = await findNewId();
  expect(annotationId).toBeTruthy();
  return host.locator(`[data-role='annotation-owner'][data-annotation-id='${annotationId}']`);
}

async function selectRequestSignal(host: import("@playwright/test").Locator) {
  const row = host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']");
  await row.click({ force: true });
}

test("rejects non-timing and incompatible annotation anchors before replacing the document", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const before = {
    revision: await host.getAttribute("data-canonical-revision"),
    history: await page.getByTestId("history-status").textContent(),
    title: await page.locator(".app-titlebar h1").textContent(),
  };
  const source = canonicalFixture();
  const comment = { id: "comment_annotation_invalid", type: "commentRow" as const, name: "Note", role: "internal" as const, source: { instancePath: [], signalName: "note" }, display: { name: "Note" }, title: "Note", body: "Body" };
  const invalidDocument = {
    ...source,
    signals: [...source.signals, comment],
    signalGroups: source.signalGroups.map((group, index) => index === 0 ? { ...group, rows: [...group.rows, comment.id] } : group),
    annotations: [
      ...source.annotations,
      { id: "annotation_comment_invalid", type: "text" as const, label: "Comment target", visible: true, anchor: { signalId: comment.id, cycle: 1, point: "value-start" as const } },
      { id: "annotation_clock_transition_invalid", type: "text" as const, label: "Clock transition", visible: true, anchor: { signalId: "sig_clk" as const, cycle: 1, point: "transition-center" as const } },
    ],
  };
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "invalid-annotation-anchors.tcd", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(invalidDocument)) });
  await expect(host).toHaveAttribute("data-canonical-revision", before.revision!);
  await expect(page.getByTestId("history-status")).toHaveText(before.history!);
  await expect(page.locator(".app-titlebar h1")).toHaveText(before.title!);
  await page.locator(".bottom-tabs").getByRole("tab", { name: "Problems" }).click();
  const problems = page.getByTestId("problems-panel");
  await expect(problems.locator("tbody tr")).toHaveCount(2);
  await expect(problems).toContainText("NON_TIMING_ANCHOR_TARGET");
  await expect(problems).toContainText("INVALID_ANCHOR_POINT");
});

test("creates every Annotation type on a renderer-owned stable overlay surface", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await selectRequestSignal(host);
  const surface = host.locator("[data-role='timing-chart-surface']");
  const countersBefore = JSON.parse(await surface.getAttribute("data-render-counters") ?? "null") as Record<string, number>;
  const types = ["text", "callout", "verticalLine", "range", "bracket", "highlight", "marker", "measurement", "arrow", "dependency", "timingRegion", "ghostTrace"];
  const baselineCount = await surface.locator("[data-role='annotation-owner']").count();
  const baselineByType = new Map<string, number>();
  for (const type of types) baselineByType.set(type, await surface.locator(`[data-annotation-type='${type}']`).count());
  const baselineByShape = new Map<string, number>();
  for (const shape of ["point", "range", "line", "trace", "vertical"]) baselineByShape.set(shape, await surface.locator(`[data-annotation-shape='${shape}']`).count());
  for (const type of types) await createAnnotation(page, type);
  await expect(surface.locator("[data-role='annotation-owner']")).toHaveCount(baselineCount + types.length);
  for (const type of types) await expect(surface.locator(`[data-annotation-type='${type}']`)).toHaveCount((baselineByType.get(type) ?? 0) + 1);
  await expect(surface.locator("[data-annotation-shape='point']")).toHaveCount((baselineByShape.get("point") ?? 0) + 3);
  await expect(surface.locator("[data-annotation-shape='range']")).toHaveCount((baselineByShape.get("range") ?? 0) + 3);
  await expect(surface.locator("[data-annotation-shape='line']")).toHaveCount((baselineByShape.get("line") ?? 0) + 4);
  await expect(surface.locator("[data-annotation-shape='trace'] [data-role='ghost-trace-path']")).toHaveCount((baselineByShape.get("trace") ?? 0) + 1);
  await expect(surface.locator("[data-annotation-shape='vertical']")).toHaveCount((baselineByShape.get("vertical") ?? 0) + 1);
  const countersAfter = JSON.parse(await surface.getAttribute("data-render-counters") ?? "null") as Record<string, number>;
  expect(countersAfter.waveDromRenders).toBe(countersBefore.waveDromRenders);
  expect(countersAfter.localGeometryBuilds).toBe(countersBefore.localGeometryBuilds);
  expect(countersAfter.overlayUpdates).toBe(countersBefore.overlayUpdates + types.length);
  await expect(page.getByTestId("history-status")).toHaveText(`History ${types.length} / Redo 0`);
});

test("edits a linked Ghost Trace and Timing Region without WaveDrom regeneration", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await selectRequestSignal(host);
  const surface = host.locator("[data-role='timing-chart-surface']");
  const before = JSON.parse(await surface.getAttribute("data-render-counters") ?? "null") as Record<string, number>;
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Annotation", exact: true }).click();
  await page.getByLabel("Annotation type").selectOption("timingRegion");
  await page.getByRole("button", { name: "Add annotation" }).click();
  await page.getByLabel("Annotation type").selectOption("ghostTrace");
  const ghostIdsBeforeCreate = new Set(await host.locator("[data-role='annotation-owner'][data-annotation-id]").evaluateAll((items) => items.map((item) => item.getAttribute("data-annotation-id"))));
  await page.getByRole("button", { name: "Add annotation" }).click();
  const ghostId = await host.locator("[data-role='annotation-owner'][data-annotation-type='ghostTrace']").evaluateAll((items, previous) => items.map((item) => item.getAttribute("data-annotation-id")).find((id) => id && !previous.includes(id)), [...ghostIdsBeforeCreate]);
  expect(ghostId).toBeTruthy();
  const ghost = host.locator(`[data-role='annotation-owner'][data-annotation-id='${ghostId}']`);
  await expect(ghost.locator("[data-role='ghost-trace-path']")).toHaveCount(1);
  await ghost.locator("[data-role='annotation-label']").click({ force: true });
  const editor = page.getByTestId("annotation-editor");
  await editor.getByLabel("Ghost Trace cycle offset").fill("2");
  await editor.getByLabel("Annotation opacity").fill("0.35");
  await editor.getByTestId("apply-annotation-properties").click();
  await expect(ghost).toHaveAttribute("data-annotation-type", "ghostTrace");
  const sourceSignalId = await ghost.getAttribute("data-source-signal-id");
  expect(sourceSignalId).toMatch(/^sig_/);
  await expect(ghost).toHaveAttribute("data-trace-offset-cycles", "2");
  const after = JSON.parse(await surface.getAttribute("data-render-counters") ?? "null") as Record<string, number>;
  expect(after.waveDromRenders).toBe(before.waveDromRenders);
  expect(after.localGeometryBuilds).toBe(before.localGeometryBuilds);
  await expect(page.getByTestId("history-status")).toHaveText("History 3 / Redo 0");
  const save = page.waitForEvent("download");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Save", exact: true }).click();
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles((await (await save).path())!);
  const reopenedGhost = host.locator(`[data-role='annotation-owner'][data-annotation-id='${ghostId}']`);
  await expect(reopenedGhost).toHaveAttribute("data-source-signal-id", sourceSignalId!);
  await expect(reopenedGhost).toHaveAttribute("data-trace-offset-cycles", "2");
});

test("creates a geometry-backed 30/70 threshold Measurement and preserves it through Save/Open", async ({ page }) => {
  await page.goto("/");
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await selectRequestSignal(host);
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Timeline", exact: true }).click();
  await page.getByLabel("Timeline range start").fill("3");
  await page.getByLabel("Timeline range end").fill("8");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Annotation", exact: true }).click();
  await page.getByLabel("Annotation type").selectOption("measurement");
  await page.getByLabel("Measurement threshold").selectOption("30-70");
  const beforeRevision = await host.getAttribute("data-canonical-revision");
  const measurementCountBeforeCreate = await host.locator("[data-role='annotation-owner'][data-annotation-type='measurement']").count();
  const beforeIds = await host.locator("[data-role='annotation-owner'][data-annotation-id]").evaluateAll((items) => items.map((item) => item.getAttribute("data-annotation-id")));
  await page.getByTestId("annotation-toolbar").getByRole("button", { name: "Add annotation" }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  const measurementId = await host.locator("[data-role='annotation-owner'][data-annotation-id]").evaluateAll((items, previous) => items.map((item) => item.getAttribute("data-annotation-id")).find((id) => id && !previous.includes(id)), beforeIds);
  expect(measurementId).toBeTruthy();
  const measurement = host.locator(`[data-role='annotation-owner'][data-annotation-id='${measurementId}']`);
  await expect(measurement).toHaveAttribute("aria-label", /30%→70%/);
  await expect(measurement.locator("[data-role='annotation-handle'][data-anchor-threshold='0.3']")).toHaveCount(1);
  await expect(measurement.locator("[data-role='annotation-handle'][data-anchor-threshold='0.7']")).toHaveCount(1);
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await expect(host).toHaveAttribute("data-canonical-revision", String(Number(beforeRevision) + 1));
  const downloadPromise = page.waitForEvent("download");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Save", exact: true }).click();
  const download = await downloadPromise;
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles((await download.path())!);
  await expect(host.locator("[data-role='annotation-owner'][data-annotation-type='measurement']")).toHaveCount(measurementCountBeforeCreate + 1);
  await expect(host.locator(`[data-role='annotation-owner'][data-annotation-id='${measurementId}']`)).toHaveAttribute("aria-label", /30%→70%/);
});

test("updates Annotation style and label offset without waveform regeneration", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await selectRequestSignal(host);
  const owner = await createAnnotation(page, "arrow");
  await expect(owner).toHaveAttribute("data-selected", "true");
  const surface = host.locator("[data-role='timing-chart-surface']");
  const waveCounters = JSON.parse(await surface.getAttribute("data-render-counters") ?? "null") as Record<string, number>;
  const editor = page.getByTestId("annotation-editor");
  await editor.getByLabel("Annotation label", { exact: true }).fill("REQ to READY");
  await editor.getByLabel("Annotation color").fill("#3366cc");
  await editor.getByLabel("Annotation line type").selectOption("curve");
  await editor.getByLabel("Annotation arrowhead").selectOption("bidirectional");
  await page.getByTestId("apply-annotation-properties").click();
  await expect(owner).toHaveAttribute("data-line-type", "curve");
  await expect(owner).toHaveAttribute("data-arrowhead", "bidirectional");
  await expect(owner.locator("[data-role='annotation-label']")).toHaveText("REQ to READY");
  const labelBefore = await owner.locator("[data-role='annotation-label']").evaluate((element) => (element as HTMLElement).style.transform);
  await editor.getByLabel("Annotation label X").fill("12");
  await editor.getByLabel("Annotation label Y").fill("-20");
  await editor.locator(".annotation-label-offset-row").getByRole("button", { name: "Apply Annotation", exact: true }).click();
  const labelAfter = await owner.locator("[data-role='annotation-label']").evaluate((element) => (element as HTMLElement).style.transform);
  const x = (value: string) => Number.parseFloat(value.match(/translate\(([-\d.]+)px/)?.[1] ?? "NaN");
  expect(x(labelAfter) - x(labelBefore)).toBe(12);
  const after = JSON.parse(await surface.getAttribute("data-render-counters") ?? "null") as Record<string, number>;
  expect(after.waveDromRenders).toBe(waveCounters.waveDromRenders);
  expect(after.localGeometryBuilds).toBe(waveCounters.localGeometryBuilds);
  expect(after.overlayUpdates).toBe(waveCounters.overlayUpdates + 2);
});

test("snaps a dragged endpoint to exact rendered cycle geometry", async ({ page }) => {
  await page.goto("/");
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await selectRequestSignal(host);
  const owner = await createAnnotation(page, "arrow");
  const handle = owner.locator("[data-role='annotation-handle'][data-annotation-field='from']");
  const fromBox = await handle.boundingBox();
  const x2 = Number.parseFloat(await page.getByTestId("cycle-ruler").locator("[data-cycle='2']").evaluate((element) => (element as HTMLElement).style.left));
  // Ruler labels are a presentation subset on long timelines; use a
  // currently rendered semantic checkpoint rather than requiring a thinned
  // label to be mounted.
  const x4 = Number.parseFloat(await page.getByTestId("cycle-ruler").locator("[data-cycle='4']").evaluate((element) => (element as HTMLElement).style.left));
  expect(fromBox).not.toBeNull();
  await page.mouse.move(fromBox!.x + 4, fromBox!.y + 4);
  await page.mouse.down();
  await page.mouse.move(fromBox!.x + 4 + (x4 - x2), fromBox!.y + 4);
  await expect(host.locator("[data-role='snap-point']")).toHaveCount(1);
  await expect(host.locator("[data-role='snap-vertical-guide']")).toHaveCount(1);
  await expect(host.locator("[data-role='snap-signal-highlight']")).toHaveCount(1);
  await expect(host.locator("[data-role='snap-cycle-label']")).toContainText("cycle");
  await page.mouse.up();
  await expect(host.locator("[data-role='snap-point']")).toHaveCount(0);
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(host).toHaveAttribute("data-snap-kind", "cycle-boundary");
  await expect(host).toHaveAttribute("data-snap-distance", "0");
  const movedTransform = await owner.locator("[data-role='annotation-handle'][data-annotation-field='from']").evaluate((element) => (element as HTMLElement).style.transform);
  expect(movedTransform).toContain(`${x4}px`);
  await expect(page.getByTestId("history-status")).toHaveText("History 2 / Redo 0");
});

test("Snap OFF changes annotation endpoint interaction to free geometry", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await selectRequestSignal(host);
  const owner = await createAnnotation(page, "arrow");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
  await page.getByTestId("snap-toggle").uncheck();
  const handle = owner.locator("[data-role='annotation-handle'][data-annotation-field='from']");
  const box = await handle.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + 3, box!.y + 3);
  await page.mouse.down();
  await page.mouse.move(box!.x + 17, box!.y + 3);
  await expect(host.locator("[data-role='snap-point']")).toHaveCount(0);
  await expect(host).not.toHaveAttribute("data-snap-kind");
  await page.mouse.up();
  await expect(page.getByTestId("history-status")).toHaveText("History 2 / Redo 0");
});

test("Snap toggle and zoom preserve the derived candidate service without mutation", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const surface = host.locator("[data-role='timing-chart-surface']");
  const before = {
    revision: await host.getAttribute("data-canonical-revision"),
    history: await page.getByTestId("history-status").textContent(),
    dirty: await page.getByTestId("dirty-status").textContent(),
    counters: await surface.getAttribute("data-render-counters"),
    sessionCounters: await host.getAttribute("data-session-counters"),
  };

  await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
  await page.getByTestId("snap-toggle").uncheck();
  await page.getByTestId("ribbon").getByRole("button", { name: "Zoom in" }).click();
  await page.getByTestId("snap-toggle").check();
  await expect(page.getByTestId("snap-status")).toHaveText("Snap: On");
  await expect(page.getByTestId("zoom-status")).toHaveText("125%");

  await expect(host).toHaveAttribute("data-canonical-revision", before.revision!);
  await expect(page.getByTestId("history-status")).toHaveText(before.history!);
  await expect(page.getByTestId("dirty-status")).toHaveText(before.dirty!);
  expect(await surface.getAttribute("data-render-counters")).toBe(before.counters);
  expect(await host.getAttribute("data-session-counters")).toBe(before.sessionCounters);
});

test("preserves canonical source-cycle anchors through an Axis Break snap", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await selectRequestSignal(host);
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Timeline", exact: true }).click();
  await page.getByLabel("Timeline range start").fill("0");
  await page.getByLabel("Timeline range end").fill("2");
  const owner = await createAnnotation(page, "arrow");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Timeline", exact: true }).click();
  await page.getByLabel("Timeline range start").fill("2");
  await page.getByLabel("Timeline range end").fill("4");
  await page.getByRole("button", { name: "Axis Break", exact: true }).click();
  const handle = owner.locator("[data-role='annotation-handle'][data-annotation-field='from']");
  const fromBox = await handle.boundingBox();
  const cycle0 = Number.parseFloat(await page.getByTestId("cycle-ruler").locator("[data-cycle='0']").evaluate((element) => (element as HTMLElement).style.left));
  const cycle5 = Number.parseFloat(await page.getByTestId("cycle-ruler").locator("[data-cycle='5']").evaluate((element) => (element as HTMLElement).style.left));
  expect(fromBox).not.toBeNull();
  await page.mouse.move(fromBox!.x + 4, fromBox!.y + 4);
  await page.mouse.down();
  await page.mouse.move(fromBox!.x + 4 + (cycle5 - cycle0), fromBox!.y + 4);
  await expect(host).toHaveAttribute("data-snap-kind", "cycle-boundary");
  await expect(host).toHaveAttribute("data-snap-cycle", "5");
  await page.mouse.up();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(host).toHaveAttribute("data-snap-cycle", "5");
});

test("nudges by 1/10 px and cancels pointer preview without a commit", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await selectRequestSignal(host);
  const owner = await createAnnotation(page, "text");
  await owner.focus();
  await owner.press("ArrowRight");
  await expect(page.getByTestId("history-status")).toHaveText("History 2 / Redo 0");
  await owner.press("Shift+ArrowDown");
  await expect(page.getByTestId("history-status")).toHaveText("History 3 / Redo 0");
  const transform = await owner.locator("[data-role='annotation-handle']").evaluate((element) => (element as HTMLElement).style.transform);
  expect(transform).toMatch(/translate\([^,]+, [^)]+\)/);

  const body = owner.locator("[data-role='annotation-body']");
  await body.dispatchEvent("pointerdown", { button: 0, clientX: 100, clientY: 100, pointerId: 7 });
  await body.dispatchEvent("pointermove", { clientX: 130, clientY: 120, pointerId: 7 });
  await expect(owner).toHaveCSS("translate", "30px 20px");
  await body.dispatchEvent("pointercancel", { pointerId: 7 });
  await expect(owner).toHaveCSS("translate", "none");
  await expect(page.getByTestId("history-status")).toHaveText("History 3 / Redo 0");
});

test("moves the whole Annotation by visual offsets and resets offsets independently", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await selectRequestSignal(host);
  const owner = await createAnnotation(page, "dependency");
  const handles = owner.locator("[data-role='annotation-handle']");
  const before = await handles.evaluateAll((items) => items.map((item) => (item as HTMLElement).style.transform));
  const body = owner.locator("[data-role='annotation-body']");
  await body.dispatchEvent("pointerdown", { button: 0, clientX: 100, clientY: 100, pointerId: 8 });
  await body.dispatchEvent("pointermove", { clientX: 120, clientY: 112, pointerId: 8 });
  await body.dispatchEvent("pointerup", { clientX: 120, clientY: 112, pointerId: 8 });
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  const moved = await handles.evaluateAll((items) => items.map((item) => (item as HTMLElement).style.transform));
  expect(moved).not.toEqual(before);
  await page.getByRole("button", { name: "Reset offsets" }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  expect(await handles.evaluateAll((items) => items.map((item) => (item as HTMLElement).style.transform))).toEqual(before);
  await expect(page.getByTestId("history-status")).toHaveText("History 3 / Redo 0");
});

test("creates standard and Custom Measurement profiles with explicit transition semantics", async ({ page }) => {
  await page.goto("/");
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await selectRequestSignal(host);
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Timeline", exact: true }).click();
  await page.getByLabel("Timeline range start").fill("3");
  await page.getByLabel("Timeline range end").fill("8");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Annotation", exact: true }).click();
  await page.getByLabel("Annotation type").selectOption("measurement");
  const toolbar = page.getByTestId("annotation-toolbar");
  const profile = toolbar.getByTestId("measurement-profile");
  const measurementCountBeforeProfiles = await host.locator("[data-role='annotation-owner'][data-annotation-type='measurement']").count();
  for (const [index, [value, start, end]] of [["10-90", "0.1", "0.9"], ["20-80", "0.2", "0.8"], ["50%", "0.5", "0.5"]].entries()) {
    await profile.selectOption(value);
    await expect(profile).toHaveValue(value);
    const before = new Set(await host.locator("[data-role='annotation-owner'][data-annotation-id]").evaluateAll((items) => items.map((item) => item.getAttribute("data-annotation-id"))));
    await toolbar.getByRole("button", { name: "Add annotation" }).click();
    const findNewId = () => host.locator("[data-role='annotation-owner'][data-annotation-id]").evaluateAll((items, previous) => items.map((item) => item.getAttribute("data-annotation-id")).find((id) => id && !previous.includes(id)), [...before]);
    await expect.poll(findNewId).toBeTruthy();
    const annotationId = await findNewId();
    expect(annotationId).toBeTruthy();
    const owner = host.locator(`[data-role='annotation-owner'][data-annotation-id='${annotationId}']`);
    const displayProfile = value === "10-90" ? "10%→90%" : value === "20-80" ? "20%→80%" : "50%→50%";
    await expect(owner).toHaveAttribute("aria-label", new RegExp(`${displayProfile}.*threshold`));
    await expect(owner.locator(`[data-role='annotation-handle'][data-anchor-threshold='${start}']`)).toHaveCount(start === end ? 2 : 1);
    await expect(owner.locator(`[data-role='annotation-handle'][data-anchor-threshold='${end}']`)).toHaveCount(start === end ? 2 : 1);
  }
  await profile.selectOption("custom");
  await toolbar.getByLabel("Measurement anchor kind").selectOption("ratio");
  await toolbar.getByLabel("Custom measurement start").fill("17");
  await toolbar.getByLabel("Custom measurement end").fill("83");
  await selectRequestSignal(host);
  await toolbar.getByRole("button", { name: "Add annotation" }).click();
  const customId = await page.getByTestId("annotation-editor").getAttribute("data-annotation-id");
  expect(customId).toBeTruthy();
  const custom = host.locator(`[data-role='annotation-owner'][data-annotation-id='${customId}']`);
  await expect(custom).toHaveAttribute("aria-label", /17%→83%.*ratio/);
  await expect(custom.locator("[data-role='annotation-handle'][data-anchor-threshold='0.17']")).toHaveCount(1);
  await expect(custom.locator("[data-role='annotation-handle'][data-anchor-transition-kind='ratio']")).toHaveCount(2);
  await profile.selectOption("custom");
  await toolbar.getByLabel("Custom measurement start").fill("90");
  await toolbar.getByLabel("Custom measurement end").fill("10");
  await expect(page.getByRole("button", { name: "Add annotation" })).toBeDisabled();
  await expect(host.locator("[data-role='annotation-owner'][data-annotation-type='measurement']")).toHaveCount(measurementCountBeforeProfiles + 4);
});

test("edits Measurement semantics with one history step and preserves them through Undo/Redo and Save/Open", async ({ page }) => {
  await page.goto("/");
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await selectRequestSignal(host);
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Timeline", exact: true }).click();
  await page.getByLabel("Timeline range start").fill("3");
  await page.getByLabel("Timeline range end").fill("8");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Annotation", exact: true }).click();
  const toolbar = page.getByTestId("annotation-toolbar");
  await toolbar.getByLabel("Annotation type").selectOption("measurement");
  await toolbar.getByTestId("measurement-profile").selectOption("30-70");
  await toolbar.getByRole("button", { name: "Add annotation" }).click();
  const ownerId = await page.getByTestId("annotation-editor").getAttribute("data-annotation-id");
  expect(ownerId).toBeTruthy();
  const owner = host.locator(`[data-role='annotation-owner'][data-annotation-id='${ownerId}']`);
  const editor = page.getByTestId("annotation-editor");
  await editor.getByLabel("Measurement profile").selectOption("custom");
  await editor.getByLabel("Measurement anchor kind").selectOption("ratio");
  await editor.getByLabel("Custom measurement start").fill("17");
  await editor.getByLabel("Custom measurement end").fill("83");
  await editor.getByLabel("Measurement start marker").selectOption("arrow");
  await editor.getByLabel("Measurement end marker").selectOption("arrow");
  await editor.getByLabel("Measurement arrow layout").selectOption("inward");
  await editor.getByLabel("Measurement extension lines").selectOption("both");
  await editor.getByLabel("Measurement lane").fill("1");
  const historyBefore = await page.getByTestId("history-status").textContent();
  await editor.getByTestId("apply-measurement-semantics").click();
  await expect(owner).toHaveAttribute("aria-label", /17%→83%.*ratio/);
  await expect(owner).toHaveAttribute("data-measurement-lane", "1");
  await expect(owner).toHaveAttribute("data-measurement-arrow-layout", "inward");
  await expect(owner.locator("[data-role='measurement-marker'][data-marker-kind='arrow']")).toHaveCount(2);
  await expect(owner.locator("[data-role='measurement-extension']")).toHaveCount(2);
  await expect(page.getByTestId("history-status")).toHaveText(`History ${Number(historyBefore?.match(/History (\d+)/)?.[1] ?? 0) + 1} / Redo 0`);
  await editor.getByTestId("editor-undo").click();
  await expect(owner).toHaveAttribute("aria-label", /30%→70%.*threshold/);
  await editor.getByTestId("editor-redo").click();
  await expect(owner).toHaveAttribute("aria-label", /17%→83%.*ratio/);
  const save = page.waitForEvent("download");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Save", exact: true }).click();
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles((await (await save).path())!);
  await expect(owner).toHaveAttribute("aria-label", /17%→83%.*ratio/);
  await expect(owner.locator("[data-role='annotation-handle'][data-anchor-transition-kind='ratio']")).toHaveCount(2);
});

test("cancels an active Annotation drag when New replaces the document", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await selectRequestSignal(host);
  const owner = await createAnnotation(page, "dependency");
  const body = owner.locator("[data-role='annotation-body']");
  await body.dispatchEvent("pointerdown", { button: 0, clientX: 100, clientY: 100, pointerId: 19 });
  await body.dispatchEvent("pointermove", { clientX: 130, clientY: 120, pointerId: 19 });
  await expect(owner).toHaveCSS("translate", "30px 20px");

  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "New", exact: true }).click();
  await page.getByTestId("unsaved-discard").click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(host).toHaveAttribute("data-canonical-revision", "0");
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
  await expect(host.locator("[data-role='annotation-owner']")).toHaveCount(0);

  await host.locator("[data-role='timing-chart-surface']").dispatchEvent("pointerup", { clientX: 180, clientY: 140, pointerId: 19 });
  await expect(host).toHaveAttribute("data-canonical-revision", "0");
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
});

test("keeps semantic alignment through reorder, zoom, and scroll without waveform regeneration", async ({ page }) => {
  await page.goto("/");
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const surface = host.locator("[data-role='timing-chart-surface']");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_valid']").click({ force: true });
  const owner = await createAnnotation(page, "text");
  const handle = owner.locator("[data-role='annotation-handle']");
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  const beforeCounters = JSON.parse(await surface.getAttribute("data-render-counters") ?? "null") as Record<string, number>;
  const beforeY = (await handle.boundingBox())!.y;
  await surface.locator("[data-role='left-row'][data-row-id='sig_cycle_valid']").dragTo(surface.locator("[data-role='left-row'][data-row-id='sig_cycle_reset_n']"), { targetPosition: { x: 120, y: 2 } });
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  expect((await handle.boundingBox())!.y).not.toBe(beforeY);
  const afterReorderCounters = JSON.parse(await surface.getAttribute("data-render-counters") ?? "null") as Record<string, number>;
  expect(afterReorderCounters.waveDromRenders).toBe(beforeCounters.waveDromRenders);
  expect(afterReorderCounters.localGeometryBuilds).toBe(beforeCounters.localGeometryBuilds);
  await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
  await page.getByRole("button", { name: "Zoom in" }).click();
  await expect(page.getByTestId("zoom-status")).toHaveText("125%");
  const tick = page.getByTestId("cycle-ruler").locator("[data-cycle='2']");
  const aligned = async () => Math.abs((((await handle.boundingBox())!.x + (await handle.boundingBox())!.width / 2) - (await tick.boundingBox())!.x));
  expect(await aligned()).toBeLessThan(1);
  await page.getByTestId("cycle-viewport").evaluate((element) => { element.scrollLeft = 120; element.scrollTop = 40; element.dispatchEvent(new Event("scroll")); });
  expect(await aligned()).toBeLessThan(1);
});

test("ripples and clamps Annotation anchors through Timeline edits with Undo and Redo", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await selectRequestSignal(host);
  const owner = await createAnnotation(page, "text");
  const handle = owner.locator("[data-role='annotation-handle']");
  const originalX = (await handle.boundingBox())!.x;
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Timeline", exact: true }).click();
  await page.getByRole("button", { name: "Delete range" }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  expect(Math.abs((await handle.boundingBox())!.x - originalX)).toBeLessThan(1);
  await page.getByTestId("editor-undo").click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await page.getByLabel("Timeline insert count").fill("2");
  await page.getByRole("button", { name: "Insert before" }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  expect((await handle.boundingBox())!.x).toBeGreaterThan(originalX);
  await page.getByTestId("editor-undo").click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  expect(Math.abs((await handle.boundingBox())!.x - originalX)).toBeLessThan(1);
  await page.getByTestId("editor-redo").click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  expect((await handle.boundingBox())!.x).toBeGreaterThan(originalX);
});

test("creates a transition Arrow with two snapped clicks and cancels pending capture with Escape", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const surface = host.locator("[data-role='timing-chart-surface']");
  const waveLayer = surface.locator("[data-role='stable-waveform-surface']");
  const waveBox = await waveLayer.boundingBox();
  const requestBox = await surface.locator("[data-role='timing-row'][data-row-id='sig_cycle_request']").boundingBox();
  const readyBox = await surface.locator("[data-role='timing-row'][data-row-id='sig_cycle_ready']").boundingBox();
  const cycle3 = Number.parseFloat(await page.getByTestId("cycle-ruler").locator("[data-cycle='3']").evaluate((element) => (element as HTMLElement).style.left));
  const cycle5 = Number.parseFloat(await page.getByTestId("cycle-ruler").locator("[data-cycle='5']").evaluate((element) => (element as HTMLElement).style.left));
  expect(waveBox && requestBox && readyBox).toBeTruthy();

  await page.locator(".ribbon-tabs").getByRole("button", { name: "Annotation", exact: true }).click();
  await page.getByRole("button", { name: "Pick arrow endpoints" }).click();
  await expect(page.getByTestId("arrow-pick-status")).toHaveText("Click from transition");
  await page.mouse.click(waveBox!.x + cycle3, requestBox!.y + requestBox!.height / 2);
  await expect(page.getByTestId("arrow-pick-status")).toHaveText("Click to transition");
  await expect(page.getByTestId("revision-status")).toHaveText("Canonical revision 0");
  await page.mouse.click(waveBox!.x + cycle5, readyBox!.y + readyBox!.height / 2);
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(surface.locator("[data-annotation-type='arrow']")).toHaveCount(1);
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");

  await page.getByRole("button", { name: "Pick arrow endpoints" }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("arrow-pick-status")).toHaveCount(0);
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
});

// #375: the picked-transitions workflow (real snapped clicks against
// rendered geometry, not the generic "Add annotation" button's Timeline-
// range-derived anchors) must be able to produce a Dependency, the other
// line-shaped type with real From/To semantic anchors -- not just Arrow.
test("creates a Dependency (not just an Arrow) with two snapped clicks when Dependency is the selected Annotation type", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const surface = host.locator("[data-role='timing-chart-surface']");
  const waveLayer = surface.locator("[data-role='stable-waveform-surface']");
  const waveBox = await waveLayer.boundingBox();
  const requestBox = await surface.locator("[data-role='timing-row'][data-row-id='sig_cycle_request']").boundingBox();
  const readyBox = await surface.locator("[data-role='timing-row'][data-row-id='sig_cycle_ready']").boundingBox();
  const cycle3 = Number.parseFloat(await page.getByTestId("cycle-ruler").locator("[data-cycle='3']").evaluate((element) => (element as HTMLElement).style.left));
  const cycle5 = Number.parseFloat(await page.getByTestId("cycle-ruler").locator("[data-cycle='5']").evaluate((element) => (element as HTMLElement).style.left));
  // REQUEST's own transitions are at cycles 0/3/7; READY's are at 0/5/8
  // (fixtures-cycle-reference-documents.ts) -- cycle7/cycle8 are each a
  // real second transition on their own row, distinct from the cycle3/
  // cycle5 pair used for the Dependency above.
  const cycle7 = Number.parseFloat(await page.getByTestId("cycle-ruler").locator("[data-cycle='7']").evaluate((element) => (element as HTMLElement).style.left));
  const cycle8 = Number.parseFloat(await page.getByTestId("cycle-ruler").locator("[data-cycle='8']").evaluate((element) => (element as HTMLElement).style.left));
  expect(waveBox && requestBox && readyBox).toBeTruthy();

  await page.locator(".ribbon-tabs").getByRole("button", { name: "Annotation", exact: true }).click();
  await page.getByLabel("Annotation type").selectOption("dependency");
  await page.getByRole("button", { name: "Pick arrow endpoints" }).click();
  await expect(page.getByTestId("arrow-pick-status")).toHaveText("Click from transition");
  await page.mouse.click(waveBox!.x + cycle3, requestBox!.y + requestBox!.height / 2);
  await expect(page.getByTestId("arrow-pick-status")).toHaveText("Click to transition");
  await page.mouse.click(waveBox!.x + cycle5, readyBox!.y + readyBox!.height / 2);
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(surface.locator("[data-annotation-type='dependency']")).toHaveCount(1);
  await expect(surface.locator("[data-annotation-type='arrow']")).toHaveCount(0);
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");

  // Switching the dropdown back to Arrow afterward must not retroactively
  // change what was already picked, and must resume producing Arrows.
  // Different cycles than the Dependency above, so the click lands on the
  // underlying wave transition rather than the just-created overlay.
  await page.getByLabel("Annotation type").selectOption("arrow");
  await page.getByRole("button", { name: "Pick arrow endpoints" }).click();
  await page.mouse.click(waveBox!.x + cycle7, requestBox!.y + requestBox!.height / 2);
  await page.mouse.click(waveBox!.x + cycle8, readyBox!.y + readyBox!.height / 2);
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(surface.locator("[data-annotation-type='dependency']")).toHaveCount(1);
  await expect(surface.locator("[data-annotation-type='arrow']")).toHaveCount(1);
  await expect(page.getByTestId("history-status")).toHaveText("History 2 / Redo 0");
});
