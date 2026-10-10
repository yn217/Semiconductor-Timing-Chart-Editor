import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { setTimelineScrollLeft, timelineScrollLeft } from "./timeline-scroll.js";

/**
 * #777 acceptance (remaining items): on the production File input, every current sample gets a representative edit, Save, New, re-Open,
 * Bottom/Inspector target synchronization on the reopened document, and a Cycle -> Transaction -> Combined -> Cycle walk with no
 * blank/stale surface and no console/page errors; the 100k-cycle performance sample gets MiniMap navigation, a far jump and Zoom.
 * Run at both required viewports. Native scrollbar thumbs are not rendered by headless Chromium, so scroll ownership is driven through
 * the scroll owner's scrollLeft and the MiniMap pointer path.
 */
const manifest = JSON.parse(await readFile(new URL("../../samples/current/manifest.json", import.meta.url), "utf8")) as { samples: ReadonlyArray<{ file: string; documentId: string }> };
const sizes = [{ width: 1280, height: 720 }, { width: 1672, height: 941 }] as const;
// Headless Chromium hides native scrollbars by default; keep them so a real thumb can be dragged with the pointer.
test.use({ launchOptions: { ignoreDefaultArgs: ["--hide-scrollbars"] } });
const fileInput = (page: Page) => page.locator("input[type='file'][accept='.json,.tcd']");

async function open(page: Page, path: string, name: string, buffer?: Buffer): Promise<void> {
  const surface = page.getByTestId("cycle-surface");
  await fileInput(page).setInputFiles({ name, mimeType: "application/json", buffer: buffer ?? await readFile(new URL(path, import.meta.url)) });
  await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 60_000 });
  await expect(page.getByTestId("cycle-ruler")).toBeVisible();
}

async function save(page: Page): Promise<Buffer> {
  const downloaded = page.waitForEvent("download");
  await page.getByTestId("ribbon").getByRole("button", { name: "Save", exact: true }).first().click();
  return readFile((await (await downloaded).path())!);
}

function collectProblems(page: Page): string[] {
  const problems: string[] = [];
  page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
  page.on("console", (message) => { if (message.type() === "error") problems.push(`console: ${message.text()}`); });
  return problems;
}

for (const size of sizes) {
  for (const sample of manifest.samples) {
    test(`${sample.file}: edit -> Save -> reopen -> target sync -> mode walk at ${size.width}x${size.height}`, async ({ page }) => {
      test.setTimeout(180_000);
      const problems = collectProblems(page);
      await page.setViewportSize(size);
      await page.goto("/");
      const surface = page.getByTestId("cycle-surface");
      await expect(surface).toHaveAttribute("data-cycle-view-ready", "true");
      await open(page, `../../samples/current/${sample.file}`, sample.file);
      await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
      await expect(page.getByTestId("view-mode-status")).toHaveText("Mode: Cycle");

      // Representative edit: rename the first non-comment Signal through the Inspector (one canonical command).
      const firstRow = surface.locator("[data-role='frozen-row']:not([data-kind='comment'])").first();
      await expect(firstRow).toBeVisible();
      await firstRow.click();
      const inspector = page.getByTestId("inspector");
      await expect(inspector.getByRole("heading", { name: "Signal Properties" })).toBeVisible();
      const name = inspector.getByLabel("Inspector signal name", { exact: true });
      await name.fill("EDITED_777");
      await name.press("Enter");
      await expect(surface).toHaveAttribute("data-editor-idle", "true");
      await expect(page.getByTestId("dirty-status")).not.toHaveText("Clean");
      await expect(page.getByTestId("selection-status")).toHaveText("EDITED_777");

      const saved = await save(page);
      expect(JSON.stringify(JSON.parse(saved.toString("utf8")).signals)).toContain("EDITED_777");
      await page.getByTestId("ribbon").getByRole("button", { name: "New", exact: true }).first().click();
      await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 60_000 });
      await open(page, "", `saved-${sample.file}`, saved);

      // Reopen: the edit survived and Bottom / Inspector follow a fresh selection of the edited Signal.
      await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
      const reopenedRow = surface.locator("[data-role='frozen-row']", { hasText: "EDITED_777" }).first();
      await expect(reopenedRow).toBeVisible();
      await reopenedRow.click();
      await expect(page.getByTestId("selection-status")).toHaveText("EDITED_777");
      await expect(page.getByTestId("inspector")).toHaveAttribute("data-inspector-context", /^(signal|clock)$/);
      await expect(page.getByTestId("signal-editor")).toBeVisible();
      // Follow Selection is implicit (#784): no Fixed/Pinned exception label may be shown after re-Open.
      await expect(page.getByTestId("bottom-target-mode")).toHaveCount(0);
      await expect(page.getByTestId("status-context")).not.toContainText("Fixed");

      // Mode walk: no blank/stale surface in any mode; selection and Canonical revision are untouched by mode switches.
      const revision = await surface.getAttribute("data-canonical-revision");
      for (const mode of ["Transaction", "Combined", "Cycle"] as const) {
        await page.locator(".view-mode").getByRole("button", { name: mode, exact: true }).click();
        await expect(page.getByTestId("view-mode-status")).toHaveText(mode === "Combined" ? /Mode: (Combined|Split)/ : `Mode: ${mode}`);
        await expect(surface).toHaveAttribute("data-editor-idle", "true");
        await expect(page.getByTestId("cycle-ruler")).toBeVisible();
        if (mode === "Transaction") await expect(page.getByTestId("transaction-lanes")).toBeVisible();
        else await expect(surface.locator("[data-role='frozen-row']").first()).toBeVisible();
        expect(await surface.getAttribute("data-canonical-revision")).toBe(revision);
      }
      await expect(surface.locator("[data-role='frozen-row']", { hasText: "EDITED_777" }).first()).toBeVisible();
      expect(problems, problems.join("\n")).toEqual([]);
    });
  }
}

for (const size of sizes) {
  test(`perf_100x100000_sparse_timeline: MiniMap, far jump and Zoom keep the surface live at ${size.width}x${size.height}`, async ({ page }) => {
    test.setTimeout(180_000);
    const problems = collectProblems(page);
    await page.setViewportSize(size);
    await page.goto("/");
    const surface = page.getByTestId("cycle-surface");
    await expect(surface).toHaveAttribute("data-cycle-view-ready", "true");
    await open(page, "../../samples/performance/perf_100x100000_sparse_timeline.tcd.json", "perf_100x100000_sparse_timeline.tcd.json");
    await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
    const revision = await surface.getAttribute("data-canonical-revision");
    // Scroll position and the rendered wave source window are the two observable time-navigation outputs.
    const firstTick = () => timelineScrollLeft(page);
    const visibleWaveReady = async () => expect.poll(() => surface.locator("[data-role='timing-chart-surface'] [data-signal-id][data-wave-state='ready']").count(), { timeout: 30_000 }).toBeGreaterThan(0);
    await visibleWaveReady();
    const initial = await firstTick();

    // MiniMap pointer navigation to ~70% of the timeline.
    await page.getByTestId("home-minimap-toggle").check(); // MiniMap is off by default
    const minimap = page.getByTestId("minimap");
    await expect(minimap).toBeVisible();
    const box = (await minimap.boundingBox())!;
    await page.mouse.click(box.x + box.width * 0.7, box.y + box.height / 2);
    await expect.poll(firstTick, { timeout: 15_000 }).toBeGreaterThan(initial + 1000);
    await visibleWaveReady();
    const afterMiniMap = await firstTick();

    // Far jump to the end through the scroll owner.
    await setTimelineScrollLeft(page, 10_000_000);
    await expect.poll(async () => timelineScrollLeft(page)).toBeGreaterThan(0);
    await expect.poll(firstTick, { timeout: 15_000 }).toBeGreaterThan(afterMiniMap);
    await visibleWaveReady();

    // Zoom in, then jump back to the start.
    await page.getByTestId("ribbon").getByRole("button", { name: "Zoom In", exact: true }).click();
    await expect(surface).toHaveAttribute("data-editor-idle", "true");
    await visibleWaveReady();
    await setTimelineScrollLeft(page, 0);
    await expect.poll(firstTick, { timeout: 15_000 }).toBeLessThanOrEqual(initial + 5);
    await visibleWaveReady();

    expect(await surface.getAttribute("data-canonical-revision")).toBe(revision);
    await expect(page.getByTestId("dirty-status")).toHaveText("Clean");
    expect(problems, problems.join("\n")).toEqual([]);
  });
}

{
  for (const size of sizes) {
    test(`perf_100x100000_sparse_timeline: dragging the horizontal scrollbar thumb moves time and keeps waves live at ${size.width}x${size.height}`, async ({ page }) => {
      test.setTimeout(180_000);
      const problems = collectProblems(page);
      await page.setViewportSize(size);
      await page.goto("/");
      const surface = page.getByTestId("cycle-surface");
      await expect(surface).toHaveAttribute("data-cycle-view-ready", "true");
      await open(page, "../../samples/performance/perf_100x100000_sparse_timeline.tcd.json", "perf_100x100000_sparse_timeline.tcd.json");
      await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
      // Cycle Mode owns a dedicated native horizontal scrollbar (timeline-hscroll) pinned under the time domain.
      const geometry = await page.evaluate(() => {
        const bar = document.querySelector<HTMLElement>("[data-testid='timeline-hscroll'], .timeline-hscroll")!;
        const box = bar.getBoundingClientRect();
        return { left: box.left, top: box.top, height: box.height, width: bar.clientWidth, scrollWidth: bar.scrollWidth, hasBar: bar.offsetHeight > 0 && bar.scrollWidth > bar.clientWidth };
      });
      expect(geometry.hasBar, "the native horizontal scrollbar must be present for a real thumb drag").toBe(true);
      expect(await timelineScrollLeft(page)).toBe(0);
      const thumbLength = Math.max(20, geometry.width * geometry.width / geometry.scrollWidth);
      const y = geometry.top + geometry.height / 2;
      const startX = geometry.left + 17 + thumbLength / 2;
      await page.mouse.move(startX, y);
      await page.mouse.down();
      await page.mouse.move(startX + geometry.width * 0.4, y, { steps: 12 });
      await page.mouse.up();
      await expect.poll(() => timelineScrollLeft(page), { timeout: 15_000 }).toBeGreaterThan(geometry.scrollWidth * 0.1);
      await expect.poll(() => surface.locator("[data-role='timing-chart-surface'] [data-signal-id][data-wave-state='ready']").count(), { timeout: 30_000 }).toBeGreaterThan(0);
      await expect(page.getByTestId("dirty-status")).toHaveText("Clean");
      expect(problems, problems.join("\n")).toEqual([]);
    });
  }
}
