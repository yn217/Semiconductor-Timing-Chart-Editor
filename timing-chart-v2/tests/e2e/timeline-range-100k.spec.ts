import { expect, test } from "@playwright/test";

const scaleSignal = {
  id: "sig_range_scale",
  name: "RANGE_SCALE",
  type: "binary",
  role: "internal",
  source: { instancePath: [], signalName: "range_scale" },
  display: { name: "RANGE_SCALE" },
  values: [{ start: 0, value: 0 }, { start: 99_999, value: 1 }],
};

const scaleDocument = {
  formatVersion: 2,
  document: { id: "range-scale-100k", title: "Range Scale", header: { subtitle: "", description: "", notes: "", preconditions: [], constraints: [], exceptions: [] }, footer: { figureNumber: "", revision: "V2", text: "" } },
  timeline: { start: 0, end: 100_000, cycleCount: 100_000, timeBase: "cycle", edge: "rising", labelAnchors: [] },
  signalGroups: [{ id: "grp_range_scale", name: "Range Scale", rows: [scaleSignal.id] }],
  signals: [scaleSignal],
  bookmarks: [], timeGroups: [], annotations: [], annotationGroups: [], transactions: [], constraints: [],
  legend: { show: false, orientation: "horizontal", usedRolesOnly: true, position: { x: 0, y: 0 } },
  layout: { roleColumnWidth: 62, signalNameWidth: 178, signalNameAlign: "left", rowHeight: 30, signalSpacing: 4, overflow: "ellipsis" },
  checkSettings: {},
};

test("selects an unsampled 100k-cycle boundary through shared geometry", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/");
  await page.getByRole("button", { name: "Cycle", exact: true }).click();
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "range-scale-100k.tcd.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(scaleDocument)) });
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-editor-idle", "true", { timeout: 120_000 });
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Timeline", exact: true }).click();
  await expect.poll(async () => page.locator("[data-role='wave-owner'][data-signal-id]").first().getAttribute("data-cycle-boundary-geometry"), { timeout: 120_000 }).toContain("\"1000\"");

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
    const startX = waveBox?.x + (boundaries["980"] ?? NaN);
    const endX = waveBox?.x + (boundaries["1000"] ?? NaN);
    const ruler = document.querySelector<HTMLElement>("[data-testid='cycle-ruler']");
    if (!viewport || !Number.isFinite(startX) || !Number.isFinite(endX) || !viewportBox || !waveBox) throw new Error("100k semantic geometry unavailable");
    viewport.scrollLeft = Math.max(0, endX - 1400);
    viewport.dispatchEvent(new Event("scroll", { bubbles: true }));
    return {
      rulerTicks: ruler?.querySelectorAll("[data-cycle]").length ?? 0,
      hasUnsampledTick: Boolean(ruler?.querySelector("[data-cycle='1000']")),
      marks: marks.length,
      startX,
      endX,
      y: waveBox.y + waveBox.height / 2,
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
