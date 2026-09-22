import { expect, test } from "@playwright/test";
import { timelineOwner } from "./timeline-scroll.js";
import { generatePerformanceDocument } from "@timing-chart-v2/testing";

// #755 step 1: the renderer-independent uniform cycle grid must reproduce the SVG-derived cycle boundaries.
const TOLERANCE = 0.001;

async function boundaryReport(page: import("@playwright/test").Page) {
  return page.evaluate(() => [...document.querySelectorAll<HTMLElement>("[data-role='wave-owner']")].flatMap((owner) => {
    const raw = owner.dataset.cycleBoundaryGeometry;
    if (!raw) return [];
    const map = JSON.parse(raw) as Record<string, number>;
    const cycles = Object.keys(map).map(Number).sort((a, b) => a - b);
    return [{ id: owner.dataset.waveOwner ?? "", cycles, xs: cycles.map((cycle) => map[String(cycle)]!) }];
  }));
}

function maxDeviation(report: Awaited<ReturnType<typeof boundaryReport>>[number]): number {
  // Analytic model: local boundary i sits at 20.5 + 40 * i (sourceCycles supplies identity only).
  const origin = report.xs[0]!;
  let worst = Math.abs(origin - 20.5);
  report.xs.forEach((x, index) => { worst = Math.max(worst, Math.abs(x - (20.5 + 40 * index))); });
  return worst;
}

test("analytic cycle grid equals SVG-derived boundaries (unwindowed document)", async ({ page }) => {
  await page.goto("/");
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true", { timeout: 60_000 });
  const reports = await boundaryReport(page);
  expect(reports.length).toBeGreaterThan(0);
  for (const report of reports) expect(maxDeviation(report), `${report.id} max |analytic - svg|`).toBeLessThanOrEqual(TOLERANCE);
});

test("analytic cycle grid equals SVG-derived boundaries (bounded window on a >4096-cycle document)", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto("/");
  const surface = page.getByTestId("cycle-surface");
  await expect(surface).toHaveAttribute("data-cycle-view-ready", "true");
  const document = generatePerformanceDocument({ signalCount: 30, cycleCount: 10_000, profile: "transaction-heavy" });
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "p755.tcd", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(document)) });
  await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 60_000 });
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 60_000 });
  const viewport = timelineOwner(page);
  await viewport.evaluate((el) => { el.scrollLeft = 200_000; });
  await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 60_000 });
  await expect.poll(async () => (await boundaryReport(page)).some((report) => report.cycles[0]! > 0), { timeout: 30_000, message: "a far jump must rebase at least one owner's window" }).toBe(true);
  const reports = await boundaryReport(page);
  expect(reports.length).toBeGreaterThan(0);
  expect(reports.some((report) => report.cycles[0]! > 0), `at least one owner must be a rebased window (starts: ${reports.map((report) => `${report.cycles[0]}@${report.xs[0]}n${report.cycles.length}`).join(",")})`).toBe(true);
  for (const report of reports) expect(maxDeviation(report), `${report.id} max |analytic - svg|`).toBeLessThanOrEqual(TOLERANCE);
});
