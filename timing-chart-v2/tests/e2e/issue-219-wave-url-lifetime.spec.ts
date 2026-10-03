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

type OwnerSnapshot = Record<"mountedWaveOwners" | "cachedWaveOwners" | "waveOwnerCacheLimit" | "rowYSize" | "rowYStaleCount" | "dirtyWaveSize" | "waveVersionSize" | "waveRendersBySignalCount" | "localGeometryBuildsBySignalCount" | "wavePrefetchOwnerCount" | "wavePrefetchPreparedCount" | "waveArtifactDisposals" | "documentEpoch", number>;
// Renderer owner/index sizes via the existing pull-only test hook (no production push cost).
const ownerSnapshot = (page: Page): Promise<OwnerSnapshot> => page.locator("[data-role='timing-chart-surface']").first().evaluate((element) => {
  const s = (element as HTMLElement & { requestPerformanceSnapshot: () => Record<string, number> }).requestPerformanceSnapshot();
  const keys = ["mountedWaveOwners", "cachedWaveOwners", "waveOwnerCacheLimit", "rowYSize", "rowYStaleCount", "dirtyWaveSize", "waveVersionSize", "waveRendersBySignalCount", "localGeometryBuildsBySignalCount", "wavePrefetchOwnerCount", "wavePrefetchPreparedCount", "waveArtifactDisposals", "documentEpoch"];
  return Object.fromEntries(keys.map((key) => [key, s[key]])) as OwnerSnapshot;
});

for (const size of [{ width: 1280, height: 720 }, { width: 1672, height: 941 }] as const) {
  test(`Open A/B/C/A with scroll, edit and mode switch: URL and renderer owner/index state plateau at ${size.width}x${size.height}`, async ({ page }) => {
    test.setTimeout(300_000);
    await install(page);
    await page.setViewportSize(size);
    await page.goto("/");
    const surface = page.getByTestId("cycle-surface");
    await expect(surface).toHaveAttribute("data-cycle-view-ready", "true");
    const idle = () => expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 120_000 });
    const open = async (seed: number, label: string) => {
      await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: `u219-${label}.tcd.json`, mimeType: "application/json", buffer: Buffer.from(JSON.stringify(uniqueWaveDocument(seed))) });
      const discard = page.getByTestId("unsaved-discard");
      if (await discard.isVisible({ timeout: 1500 }).catch(() => false)) await discard.click();
      await page.waitForTimeout(800);
      await idle();
    };
    const sweep = async () => {
      for (const fraction of [0.25, 0.5, 0.75, 1, 0]) {
        await page.getByTestId("cycle-viewport").evaluate(async (el, f) => { el.scrollTop = Math.floor((el.scrollHeight - el.clientHeight) * f); await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))); }, fraction);
        await idle();
      }
    };
    const rows: Array<Record<string, number | string | undefined>> = [];
    const record = async (step: string) => {
      await page.waitForTimeout(600);
      const urls = await snapshot(page);
      const owners = await ownerSnapshot(page);
      rows.push({ step, ...urls, ...owners });
      expect(urls.earlyRevoked, `${step}: a mounted waveform references a revoked URL`).toBe(0);
      expect(owners.rowYStaleCount, `${step}: rowY retains stale document IDs`).toBe(0);
      expect(owners.cachedWaveOwners, `${step}: owner cache exceeds mounted + cache limit`).toBeLessThanOrEqual(owners.mountedWaveOwners + owners.waveOwnerCacheLimit);
    };
    await open(100, "A"); await sweep();
    await surface.locator("[data-role='frozen-row']:not([data-kind='comment'])").first().click();
    const name = page.getByTestId("inspector").getByLabel("Inspector signal name", { exact: true });
    if (await name.count()) { await name.fill("EDIT_A"); await name.press("Enter"); await idle(); }
    await record("A");
    await open(200, "B"); await sweep();
    await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
    await page.waitForTimeout(800);
    await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
    await expect(surface).toHaveAttribute("data-cycle-view-ready", "true");
    await idle();
    await record("B");
    await open(300, "C"); await sweep(); await record("C");
    await open(100, "A2"); await sweep(); await record("A2");
    console.log("E219-ABCA", JSON.stringify({ size, rows }));
    const first = rows[0]!, last = rows.at(-1)!;
    const num = (row: Record<string, unknown>, key: string) => row[key] as number;
    expect(num(last, "created"), "> 64 unique artifacts exercised").toBeGreaterThan(64);
    // Plateau: after the 4th Open each state size stays within the 1st-Open size (+ small slack), i.e. it does not scale with Open count.
    for (const key of ["live", "cachedWaveOwners", "mountedWaveOwners", "rowYSize", "dirtyWaveSize", "waveVersionSize", "waveRendersBySignalCount", "localGeometryBuildsBySignalCount"]) {
      expect(num(last, key), `${key} plateau across A/B/C/A`).toBeLessThanOrEqual(Math.max(num(first, key) * 1.5, num(first, key) + 16));
    }
    const heap = rows.map((row) => row.heapMb).filter((value): value is number => typeof value === "number");
    if (heap.length === rows.length) expect(heap.at(-1)! - heap[0]!, "JS heap trend across A/B/C/A (MB)").toBeLessThan(80);
  });
}
