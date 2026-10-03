import { expect, test, type Page } from "@playwright/test";
import { generatePerformanceDocument } from "@timing-chart-v2/testing";
import { startInCycleMode } from "./cycle-startup.js";

startInCycleMode(test);

/**
 * #219 renderer lifetime matrix: repeated production Open / vertical scroll / edit with MORE than 64 unique waveform artifacts. Records
 * created / revoked / live blob URLs, and asserts (a) no waveform <image> in the DOM ever references a revoked URL (early revoke), (b) live URLs
 * stay bounded by the mounted-owner cache rather than growing with the number of Opens, (c) JS heap does not trend upward across Opens.
 */
type Counters = { created: string[]; revoked: string[] };
const URLS = "__waveUrlCounters";

async function install(page: Page): Promise<void> {
  await page.addInitScript((key) => {
    const counters = { created: [] as string[], revoked: [] as string[] };
    (window as unknown as Record<string, unknown>)[key] = counters;
    const create = URL.createObjectURL.bind(URL);
    const revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = (object: Blob | MediaSource) => { const url = create(object); counters.created.push(url); return url; };
    URL.revokeObjectURL = (url: string) => { counters.revoked.push(url); revoke(url); };
  }, URLS);
}

const snapshot = (page: Page) => page.evaluate((key) => {
  const counters = (window as unknown as Record<string, { created: string[]; revoked: string[] }>)[key]!;
  const revoked = new Set(counters.revoked);
  const live = counters.created.filter((url) => !revoked.has(url));
  const referenced = [...document.querySelectorAll("image[data-wave-svg-image]")].map((image) => image.getAttribute("href") ?? "");
  const memory = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize;
  return { created: counters.created.length, revoked: counters.revoked.length, live: live.length, referenced: referenced.length, earlyRevoked: referenced.filter((href) => revoked.has(href)).length, heapMb: memory === undefined ? undefined : Math.round(memory / 1048576) };
}, URLS);

function uniqueWaveDocument(seed: number) {
  const base = generatePerformanceDocument({ signalCount: 150, cycleCount: 200, profile: "standard" });
  // Every Signal gets a distinct pseudo-random change pattern (distinct per seed too), so each waveform artifact is unique (> 64 per document)
  // and different Opens do not hit the markup cache.
  const signals = base.signals.map((signal, index) => {
    if (signal.type !== "binary") return signal;
    let state = (index + 1) * 2654435761 + (seed + 1) * 40503;
    const next = () => { state = (state * 1103515245 + 12345) >>> 0; return state; };
    const starts = new Set<number>([0]);
    while (starts.size < 14) starts.add(next() % 200);
    return { ...signal, values: [...starts].sort((x, y) => x - y).map((start, change) => ({ start, value: (change + (next() & 1)) % 2 })) };
  });
  return { ...base, signals };
}

for (const size of [{ width: 1280, height: 720 }, { width: 1672, height: 941 }] as const) {
  test(`>64 unique waveform artifacts: no early revoke, bounded live URLs, flat heap across repeated Open/scroll/edit at ${size.width}x${size.height}`, async ({ page }) => {
    test.setTimeout(300_000);
    await install(page);
    await page.setViewportSize(size);
    await page.goto("/");
    const surface = page.getByTestId("cycle-surface");
    await expect(surface).toHaveAttribute("data-cycle-view-ready", "true");
    const rows: Array<Record<string, unknown>> = [];
    const viewport = page.getByTestId("cycle-viewport");
    for (let round = 0; round < 5; round += 1) {
      await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: `u219-${round}.tcd.json`, mimeType: "application/json", buffer: Buffer.from(JSON.stringify(uniqueWaveDocument(round))) });
      const discard = page.getByTestId("unsaved-discard");
      if (await discard.isVisible({ timeout: 1500 }).catch(() => false)) await discard.click();
      await expect(page.getByText(`u219-${round}`, { exact: false }).first().or(page.locator(".app-titlebar h1")).first()).toBeAttached();
      await page.waitForTimeout(800);
      await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 120_000 });
      // Vertical sweep through the whole document (eviction/reuse), then one edit.
      for (const fraction of [0.25, 0.5, 0.75, 1, 0]) {
        await viewport.evaluate(async (el, f) => { el.scrollTop = Math.floor((el.scrollHeight - el.clientHeight) * f); await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))); }, fraction);
        await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 60_000 });
      }
      const first = surface.locator("[data-role='frozen-row']:not([data-kind='comment'])").first();
      await first.click();
      const name = page.getByTestId("inspector").getByLabel("Inspector signal name", { exact: true });
      if (await name.count()) { await name.fill(`EDIT_${round}`); await name.press("Enter"); await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 60_000 }); }
      await page.waitForTimeout(600);
      const s = await snapshot(page);
      rows.push({ round, ...s });
      expect(s.earlyRevoked, `round ${round}: a mounted waveform references a revoked URL`).toBe(0);
    }
    console.log("E219-LIFETIME", JSON.stringify({ size, rows }));
    const created = rows.map((row) => row.created as number);
    expect(created.at(-1)!, "the matrix really exercised > 64 unique artifacts").toBeGreaterThan(64);
    const live = rows.map((row) => row.live as number);
    expect(Math.max(...live), "live blob URLs stay bounded by the mounted cache, not by Open count").toBeLessThan(Math.max(250, live[0]! * 2));
    const heap = rows.map((row) => row.heapMb as number | undefined).filter((value): value is number => value !== undefined);
    if (heap.length === rows.length) expect(heap.at(-1)! - heap[0]!, "JS heap trend across 5 Opens (MB)").toBeLessThan(80);
  });
}
