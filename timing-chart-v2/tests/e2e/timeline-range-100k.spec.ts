import { expect, test } from "@playwright/test";
import { startInCycleSample } from "./cycle-startup.js";

startInCycleSample(test);

const scaleSignal = {
  id: "sig_range_scale",
  name: "RANGE_SCALE",
  type: "binary",
  role: "internal",
  source: { instancePath: [], signalName: "range_scale" },
  display: { name: "RANGE_SCALE" },
  values: [{ start: 0, value: 0 }, { start: 99_999, value: 1 }],
};
const scaleClock = {
  id: "sig_range_clock",
  name: "RANGE_CLOCK",
  type: "clock",
  role: "input",
  source: { instancePath: [], signalName: "range_clock" },
  display: { name: "RANGE_CLOCK" },
  generator: { start: 0, period: 2, duty: 0.5, phase: 0, initial: 0, polarity: "positive" },
  edgeCounter: { show: false, mode: "both", startNumber: 1, countFrom: "signal-start", labelEvery: 1, position: "above", offset: { x: 0, y: -6 } },
};

const scaleDocument = {
  formatVersion: 2,
  document: { id: "range-scale-100k", title: "Range Scale", header: { subtitle: "", description: "", notes: "", preconditions: [], constraints: [], exceptions: [] }, footer: { figureNumber: "", revision: "V2", text: "" } },
  timeline: { start: 0, end: 100_000, cycleCount: 100_000, timeBase: "cycle", referenceClock: scaleClock.id, edge: "rising", labelAnchors: [] },
  signalGroups: [{ id: "grp_range_scale", name: "Range Scale", rows: [scaleClock.id, scaleSignal.id] }],
  signals: [scaleClock, scaleSignal],
  bookmarks: [{ id: "bookmark-50k", name: "Cycle 50k", start: 50_000 }, { id: "bookmark-99k", name: "Cycle 99k", start: 99_000 }], timeGroups: [], annotations: [], annotationGroups: [], transactions: [], constraints: [],
  legend: { show: false, orientation: "horizontal", usedRolesOnly: true, position: { x: 0, y: 0 } },
  layout: { roleColumnWidth: 62, signalNameWidth: 178, signalNameAlign: "left", rowHeight: 30, signalSpacing: 4, overflow: "ellipsis" },
  checkSettings: {},
};

test("selects an unsampled 100k-cycle boundary through shared geometry", async ({ page }) => {
  test.setTimeout(120_000);
  // The 20-cycle drag (800px) must fit inside the Timeline viewport, which needs the locked wide viewport.
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto("/");
  await page.getByRole("button", { name: "Cycle", exact: true }).click();
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "range-scale-100k.tcd.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(scaleDocument)) });
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-editor-idle", "true", { timeout: 120_000 });
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Timeline", exact: true }).click();
  // The wave window is viewport-bounded (#757), so bring cycle 1000 into view first; the window then rebases around it.
  await page.getByTestId("cycle-viewport").evaluate((element) => { element.scrollLeft = 1000 * 40 - 806; element.dispatchEvent(new Event("scroll", { bubbles: true })); }); // cycle 1000 lands inside the Timeline viewport, left of the Inspector
  await expect.poll(async () => page.locator("[data-role='wave-owner'][data-signal-id]").first().getAttribute("data-cycle-boundary-geometry"), { timeout: 120_000 }).toContain("\"1000\"");
  await expect(host).toHaveAttribute("data-editor-idle", "true", { timeout: 120_000 });

  const before = await host.evaluate((element) => ({
    revision: element.getAttribute("data-canonical-revision"),
    history: element.getAttribute("data-history-depth"),
    dirty: document.querySelector("[data-testid='dirty-status']")?.textContent,
  }));
  const geometry = await page.evaluate(() => {
    const viewport = document.querySelector<HTMLElement>("[data-testid='cycle-viewport']");
    const wave = document.querySelector<HTMLElement>("[data-role='wave-owner'][data-signal-id]");
    const svg = wave?.querySelector("svg");
    const marks = svg ? [...svg.querySelectorAll<SVGLineElement>("[id^='gmark_']")] : [];
    const boundaryGeometry = wave?.getAttribute("data-cycle-boundary-geometry");
    const boundaries = boundaryGeometry ? JSON.parse(boundaryGeometry) as Record<string, number> : {};
    const viewportBox = viewport?.getBoundingClientRect();
    const waveBox = wave?.getBoundingClientRect();
    const ruler = document.querySelector<HTMLElement>("[data-testid='cycle-ruler']");
    if (!viewport || !viewportBox || !waveBox) throw new Error("100k semantic geometry unavailable");
    const endX = waveBox.x + (boundaries["1000"] ?? NaN);
    if (!Number.isFinite(endX)) throw new Error("100k semantic geometry unavailable");
    const scrolledWaveBox = wave?.getBoundingClientRect();
    if (!scrolledWaveBox) throw new Error("100k semantic geometry unavailable after scroll");
    return {
      rulerTicks: ruler?.querySelectorAll("[data-cycle]").length ?? 0,
      hasUnsampledTick: Boolean(ruler?.querySelector("[data-cycle='1000']")),
      marks: marks.length,
      startX: scrolledWaveBox.x + (boundaries["980"] ?? NaN),
      endX: scrolledWaveBox.x + (boundaries["1000"] ?? NaN),
      y: scrolledWaveBox.y + scrolledWaveBox.height / 2,
    };
  });
  expect(geometry.rulerTicks).toBe(512);
  expect(geometry.hasUnsampledTick).toBe(false);
  // The production path must render only the bootstrap/viewport window, not
  // one WaveDrom grid mark per canonical cycle.
  expect(geometry.marks).toBeGreaterThan(0);
  expect(geometry.marks).toBeLessThan(10_000);

  await page.mouse.move(geometry.startX + 1, geometry.y);
  await page.mouse.down();
  await page.mouse.move(geometry.endX + 1, geometry.y);
  await expect(host).toHaveAttribute("data-range-preview-cycle", "1000");
  await page.mouse.up();

  await expect(page.getByLabel("Timeline range start")).toHaveValue("980");
  await expect(page.getByLabel("Timeline range end")).toHaveValue("1000");
  const after = await host.evaluate((element) => ({
    revision: element.getAttribute("data-canonical-revision"),
    history: element.getAttribute("data-history-depth"),
    dirty: document.querySelector("[data-testid='dirty-status']")?.textContent,
  }));
  expect(after).toEqual(before);
});

test("reveals offscreen 50k and 99k cycles through the production bookmark path", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/");
  await page.getByRole("button", { name: "Cycle", exact: true }).click();
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "range-scale-100k-bookmarks.tcd", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(scaleDocument)) });
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-editor-idle", "true", { timeout: 120_000 });
  await page.getByRole("tab", { name: "Bookmarks", exact: true }).click();
  const rows = page.getByTestId("bookmark-list").getByRole("row");
  await expect(rows).toHaveCount(3); // header + two bookmark rows
  await rows.filter({ hasText: "Cycle 50k" }).dblclick();
  await expect(host).toHaveAttribute("data-selected-cycle", "50000", { timeout: 30_000 });
  await rows.filter({ hasText: "Cycle 99k" }).dblclick();
  await expect(host).toHaveAttribute("data-selected-cycle", "99000", { timeout: 30_000 });
  await page.getByRole("tab", { name: "Signal", exact: true }).click();
  await host.locator("[data-role='left-row'][data-row-id='sig_range_clock']").click();
  const clockOwner = host.locator("[data-role='wave-owner'][data-signal-id='sig_range_clock']");
  await expect(clockOwner).not.toHaveAttribute("data-wave-error", /.+/, { timeout: 30_000 });
  await expect.poll(async () => {
    const raw = await clockOwner.getAttribute("data-cycle-boundary-geometry");
    return raw ? Object.keys(JSON.parse(raw)).length : 0;
  }, { timeout: 30_000 }).toBeGreaterThan(0);
  await host.locator("[data-role='left-row'][data-row-id='sig_range_scale']").click();
  await expect(page.getByRole("table", { name: "Signal events" })).toBeVisible({ timeout: 30_000 });
});

test("re-evaluates mounted waveform source windows after horizontal scroll", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/");
  await page.getByRole("button", { name: "Cycle", exact: true }).click();
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "range-scroll-windowed.tcd", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(scaleDocument)) });
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-editor-idle", "true", { timeout: 120_000 });
  const viewport = page.getByTestId("cycle-viewport");
  const owner = page.locator("[data-role='wave-owner'][data-signal-id]").first();
  const before = await page.evaluate(() => {
    const viewport = document.querySelector<HTMLElement>("[data-testid='cycle-viewport']");
    const owner = document.querySelector<HTMLElement>("[data-role='wave-owner'][data-signal-id]");
    if (!viewport || !owner) throw new Error("waveform owner unavailable");
    return { scrollLeft: viewport.scrollLeft, start: owner.dataset.renderedSourceWindowStart, end: owner.dataset.renderedSourceWindowEnd };
  });
  const maxScroll = await viewport.evaluate((element) => element.scrollWidth - element.clientWidth);
  expect(maxScroll).toBeGreaterThan(0);
  await viewport.evaluate((element) => { element.scrollLeft = element.scrollWidth - element.clientWidth; element.dispatchEvent(new Event("scroll", { bubbles: true })); });
  await expect.poll(async () => viewport.evaluate((element) => element.scrollLeft)).toBeGreaterThan(before.scrollLeft);
  await expect.poll(async () => ({ start: await owner.getAttribute("data-rendered-source-window-start"), end: await owner.getAttribute("data-rendered-source-window-end") }), { timeout: 30_000 }).not.toEqual({ start: before.start, end: before.end });
});
