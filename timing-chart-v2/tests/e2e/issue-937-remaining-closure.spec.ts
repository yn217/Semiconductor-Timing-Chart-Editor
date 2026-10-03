import { expect, test, type Page } from "@playwright/test";
import { generatePerformanceDocument } from "@timing-chart-v2/testing";
import { readWave } from "./wave-probe.js";
import { documentState, expectViewOnly } from "./view-only.js";

/**
 * #937 closure audit: the coordinate-matrix rows not covered by the Cycle/Transaction/Combined/Signal Split matrices —
 * clockless axis, Inspector drag-resize and Transaction Phase boundaries. Expected X always comes from the Ruler.
 */
const sizes = [{ width: 1280, height: 720 }, { width: 1672, height: 941 }] as const;
const rulerTicks = (page: Page, attr: string) => page.evaluate((name) => [...document.querySelectorAll<HTMLElement>(`[data-testid='cycle-ruler'] .cycle-tick[${name}]`)]
  .map((tick) => ({ cycle: Number(tick.getAttribute(name)), x: tick.getBoundingClientRect().left })).sort((a, b) => a.cycle - b.cycle), attr);
const settle = (page: Page) => page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));

const clocklessDocument = (cycles: number) => {
  const data = { id: "sig_data", name: "DATA", type: "binary", role: "internal", source: { instancePath: [], signalName: "data" }, display: { name: "DATA" }, values: [{ start: 0, value: 0 }, { start: 4, value: 1 }, { start: 9, value: 0 }] };
  return {
    formatVersion: 2,
    document: { id: "c937", title: "Clockless 937", header: { subtitle: "", description: "", notes: "", preconditions: [], constraints: [], exceptions: [] }, footer: { figureNumber: "", revision: "V2", text: "" } },
    timeline: { start: 0, end: cycles, cycleCount: cycles, timeBase: "cycle", edge: "rising", labelAnchors: [] },
    signalGroups: [{ id: "grp_main", name: "Main", rows: [data.id] }], signals: [data],
    bookmarks: [], timeGroups: [], annotations: [], annotationGroups: [], transactions: [], constraints: [],
    legend: { show: false, orientation: "horizontal", usedRolesOnly: true, position: { x: 0, y: 0 } },
    layout: { roleColumnWidth: 62, signalNameWidth: 178, signalNameAlign: "left", rowHeight: 30, signalSpacing: 4, overflow: "ellipsis" }, checkSettings: {},
  };
};

for (const size of sizes) {
  test(`clockless axis: Ruler, Grid and Wave boundaries share X across zoom/scroll at ${size.width}x${size.height}`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize(size);
    await page.goto("/");
    const surface = page.getByTestId("cycle-surface");
    await expect(surface).toHaveAttribute("data-cycle-view-ready", "true");
    await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "c937.tcd.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(clocklessDocument(32))) });
    await expect(surface).toHaveAttribute("data-editor-idle", "true");
    await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
    await expect(page.getByTestId("time-axis-status")).toHaveText("Time Axis: Time · No Clock Reference");
    await page.getByTestId("home-grid-toggle").check();
    await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
    const failures: string[] = [];
    let compared = 0;
    for (const preset of ["100", "200", "400"]) {
      await page.getByLabel("Zoom preset").selectOption(preset);
      await expect(page.getByTestId("zoom-status")).toHaveText(`${preset}%`);
      for (const fraction of [0, 0.5]) {
        await page.evaluate((f) => { const owner = document.querySelector<HTMLElement>("[data-role='timeline-viewport']")!; owner.scrollLeft = Math.floor((owner.scrollWidth - owner.clientWidth) * f); }, fraction);
        await settle(page);
        await expect.poll(async () => (await readWave(page, "sig_data")).present).toBe(true);
        const wave = await readWave(page, "sig_data");
        const ticks = await rulerTicks(page, "data-cycle");
        const grid = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>("[data-role='geometry-grid-line']")].map((line) => line.getBoundingClientRect().left));
        for (const tick of ticks) {
          const boundary = wave.boundaries[tick.cycle];
          if (boundary !== undefined) { compared += 1; if (Math.abs(boundary - tick.x) > 1) failures.push(`${preset}% s${fraction} wave@${tick.cycle} off ruler by ${(boundary - tick.x).toFixed(2)}`); }
          if (grid.length > 0) { compared += 1; const nearest = Math.min(...grid.map((x) => Math.abs(x - tick.x))); if (nearest > 1) failures.push(`${preset}% s${fraction} grid not at ruler tick ${tick.cycle} (nearest ${nearest.toFixed(2)})`); }
        }
      }
    }
    expect(compared, "boundaries were actually compared").toBeGreaterThan(20);
    expect(failures, failures.slice(0, 12).join("\n")).toEqual([]);
  });

  test(`Inspector drag-resize keeps Ruler/Wave boundary alignment at ${size.width}x${size.height}`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize(size);
    await page.goto("/");
    const surface = page.getByTestId("cycle-surface");
    await expect(surface).toHaveAttribute("data-cycle-view-ready", "true");
    await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
    await expect(surface).toHaveAttribute("data-editor-idle", "true");
    const resizer = page.getByTestId("inspector-resizer");
    await expect(resizer).toBeVisible();
    const revision = await surface.getAttribute("data-canonical-revision");
    const viewOnlyBefore = await documentState(page);
    await expect.poll(() => surface.locator("[data-role='wave-owner'][data-signal-id]:has(image[data-wave-svg-image])").count()).toBeGreaterThan(0);
    const signalId = await surface.locator("[data-role='wave-owner'][data-signal-id]:has(image[data-wave-svg-image])").first().getAttribute("data-signal-id");
    const widths: number[] = [];
    const check = async (label: string) => {
      await settle(page); await page.waitForTimeout(400);
      const wave = await readWave(page, signalId!);
      const ticks = await rulerTicks(page, "data-cycle");
      let compared = 0;
      for (const tick of ticks) { const boundary = wave.boundaries[tick.cycle]; if (boundary === undefined) continue; compared += 1; expect(Math.abs(boundary - tick.x), `${label}: wave vs ruler @${tick.cycle}`).toBeLessThanOrEqual(1); }
      expect(compared, `${label}: compared`).toBeGreaterThan(2);
      widths.push((await page.getByTestId("inspector-shell").boundingBox())!.width);
    };
    await check("initial");
    for (const delta of [-90, 120, -60]) {
      const box = (await resizer.boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 + delta, box.y + box.height / 2, { steps: 8 });
      await page.mouse.up();
      await check(`inspector drag ${delta}`);
    }
    expect(new Set(widths.map(Math.round)).size, "the Inspector really changed width").toBeGreaterThan(1);
    expect(await surface.getAttribute("data-canonical-revision")).toBe(revision);
    await expectViewOnly(page, viewOnlyBefore);
  });

  test(`Transaction Phase boundaries stay on the Ruler across zoom at ${size.width}x${size.height}`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize(size);
    await page.goto("/?transaction-demo");
    const surface = page.getByTestId("cycle-surface");
    await expect(surface).toHaveAttribute("data-cycle-view-ready", "true");
    await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
    await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 30_000 });
    await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
    const failures: string[] = [];
    let compared = 0;
    for (const preset of ["50", "100", "400"]) {
      await page.getByLabel("Zoom preset").selectOption(preset);
      await expect(page.getByTestId("zoom-status")).toHaveText(`${preset}%`);
      await page.evaluate(() => { document.querySelector<HTMLElement>("[data-testid='cycle-viewport']")!.scrollLeft = 0; });
      await settle(page);
      const result = await page.evaluate(() => {
        const ticks = [...document.querySelectorAll<HTMLElement>("[data-testid='cycle-ruler'] .cycle-tick[data-source-cycle]")].map((t) => ({ cycle: Number(t.dataset.sourceCycle), x: t.getBoundingClientRect().left })).sort((a, b) => a.cycle - b.cycle);
        if (ticks.length < 2) return undefined;
        const slope = (ticks.at(-1)!.x - ticks[0]!.x) / (ticks.at(-1)!.cycle - ticks[0]!.cycle);
        const expected = (cycle: number) => ticks[0]!.x + (cycle - ticks[0]!.cycle) * slope;
        const phases = [...document.querySelectorAll<HTMLElement>("[data-transaction-id='demo_txn_read'] .transaction-phases small")].map((p) => p.getBoundingClientRect());
        const bar = document.querySelector<HTMLElement>("[data-transaction-id='demo_txn_read']")!.getBoundingClientRect();
        return { phases: phases.map((box) => ({ left: box.left, right: box.right })), start: expected(10), end: expected(60), barLeft: bar.left - expected(10), barRight: bar.right - expected(60) };
      });
      if (!result) { failures.push(`${preset}%: ruler ticks missing`); continue; }
      compared += 1;
      if (Math.abs(result.barLeft) > 2 || Math.abs(result.barRight) > 2) failures.push(`${preset}% bar edges off ruler (${result.barLeft.toFixed(2)}, ${result.barRight.toFixed(2)})`);
      if (result.phases.length === 3) {
        if (Math.abs(result.phases[0]!.left - result.start) > 2) failures.push(`${preset}% first phase start off ruler`);
        if (Math.abs(result.phases[2]!.right - result.end) > 2) failures.push(`${preset}% last phase end off ruler`);
        for (let index = 1; index < 3; index += 1) if (Math.abs(result.phases[index]!.left - result.phases[index - 1]!.right) > 1.5) failures.push(`${preset}% phase ${index} does not abut previous`);
      } else failures.push(`${preset}%: expected 3 phases, saw ${result.phases.length}`);
    }
    expect(compared).toBe(3);
    expect(failures, failures.join("\n")).toEqual([]);
  });
}

for (const size of sizes) {
  test(`Transaction items tighter than 2px stay mounted, hit-testable and on the Ruler at ${size.width}x${size.height}`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize(size);
    await page.goto("/");
    const surface = page.getByTestId("cycle-surface");
    await expect(surface).toHaveAttribute("data-cycle-view-ready", "true");
    const document = { ...generatePerformanceDocument({ signalCount: 6, cycleCount: 400, profile: "standard" }), transactions: [{ id: "tx_tiny", name: "Tiny", start: 40, end: 41, laneId: "lane_0", linkedSignals: [] }, { id: "tx_wide", name: "Wide", start: 80, end: 120, laneId: "lane_0", linkedSignals: [] }] };
    await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "t937.tcd.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(document)) });
    await expect(page.locator(".app-titlebar h1")).toHaveText(/.+/);
    await expect(surface).toHaveAttribute("data-editor-idle", "true");
    await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
    await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 30_000 });
    await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
    for (const preset of ["50", "100", "400"]) {
      await page.getByLabel("Zoom preset").selectOption(preset);
      await expect(page.getByTestId("zoom-status")).toHaveText(`${preset}%`);
      await page.evaluate(() => { document.querySelector<HTMLElement>("[data-testid='cycle-viewport']")!.scrollLeft = 0; });
      await settle(page);
      const tiny = page.getByTestId("transaction-lanes").locator("[data-transaction-id='tx_tiny']");
      await expect(tiny, `${preset}%: tiny Transaction stays mounted`).toHaveCount(1);
      const measured = await page.evaluate(() => {
        const ticks = [...document.querySelectorAll<HTMLElement>("[data-testid='cycle-ruler'] .cycle-tick[data-source-cycle]")].map((t) => ({ cycle: Number(t.dataset.sourceCycle), x: t.getBoundingClientRect().left })).sort((a, b) => a.cycle - b.cycle);
        const slope = (ticks.at(-1)!.x - ticks[0]!.x) / (ticks.at(-1)!.cycle - ticks[0]!.cycle);
        const bar = document.querySelector<HTMLElement>("[data-transaction-id='tx_tiny']")!.getBoundingClientRect();
        const centre = { x: bar.left + bar.width / 2, y: bar.top + bar.height / 2 };
        const hit = document.elementFromPoint(centre.x, centre.y)?.closest("[data-transaction-id]")?.getAttribute("data-transaction-id") ?? null;
        return { width: bar.width, startDelta: bar.left - (ticks[0]!.x + (40 - ticks[0]!.cycle) * slope), hit };
      });
      expect(measured.width, `${preset}%: not collapsed to nothing`).toBeGreaterThan(0.5);
      expect(Math.abs(measured.startDelta), `${preset}%: start on the Ruler`).toBeLessThanOrEqual(2);
      expect(measured.hit, `${preset}%: tiny item is hit-testable`).toBe("tx_tiny");
    }
  });
}
