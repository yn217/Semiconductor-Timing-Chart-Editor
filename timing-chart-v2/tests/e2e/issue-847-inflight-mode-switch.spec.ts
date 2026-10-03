import { expect, test } from "@playwright/test";
import { resolve } from "node:path";
import { startInCycleMode } from "./cycle-startup.js";

startInCycleMode(test);

/**
 * #847 independent verification of mode-prefetch lifecycle: a Cycle prefetch that is actually in flight (CPU throttled, plan just rebuilt by a
 * scroll) is abandoned by Cycle -> Transaction (no stale publish, no continued prefetch), Transaction -> Cycle rebuilds the plan at the same
 * viewport, and the vertical-scroll ownership contract still holds after the roundtrip. View-only throughout: Canonical/History/Dirty unchanged.
 */
const showcase = resolve("samples/old/pre-reset-2026-10-02/showcase/21_large_feature_showcase.tcd.json");
type Counters = { wavePrefetchOwnerCount: number; wavePrefetchRequestedCount: number; wavePrefetchPreparedCount: number; wavePrefetchFailedCount: number };

for (const size of [{ width: 1280, height: 720 }, { width: 1672, height: 941 }]) {
  for (const bottomVisible of [true, false]) {
    test(`in-flight Cycle prefetch is abandoned by Transaction and rebuilt on return, then wheel scroll keeps row/wave ownership (${size.width}x${size.height}, Bottom ${bottomVisible ? "open" : "closed"})`, async ({ page }) => {
      test.setTimeout(120_000);
      const problems: string[] = [];
      page.on("pageerror", (error) => problems.push(error.message));
      await page.setViewportSize(size);
      await page.goto("/");
      const host = page.getByTestId("cycle-surface");
      await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
      await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(showcase);
      await expect(host).toHaveAttribute("data-editor-idle", "true");
      if (!bottomVisible) {
        await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
        await page.getByTestId("ribbon").getByRole("button", { name: "Bottom Editor", exact: true }).click();
        await expect(page.locator(".editor-shell")).toHaveAttribute("data-bottom-visible", "false");
      }
      const surface = page.locator("[data-role='timing-chart-surface']");
      const counters = async () => surface.evaluate((element) => JSON.parse((element as HTMLElement).dataset.performanceCounters ?? "{}")) as Promise<Counters>;
      await expect.poll(async () => (await counters()).wavePrefetchRequestedCount).toBeGreaterThan(0);
      const before = { revision: await host.getAttribute("data-canonical-revision"), history: await page.getByTestId("history-status").textContent(), dirty: await page.getByTestId("dirty-status").textContent() };

      // Throttle the CPU so the prefetch the scroll rebuilds is still running when the mode switches.
      const cdp = await page.context().newCDPSession(page);
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 8 });
      const viewport = page.getByTestId("cycle-viewport");
      const maxTop = await viewport.evaluate((element) => element.scrollHeight - element.clientHeight);
      await viewport.evaluate((element, top) => element.scrollTo({ top, behavior: "instant" }), Math.min(maxTop, 700));
      const requestedAtSwitch = (await counters()).wavePrefetchRequestedCount;
      await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
      await expect(page.locator(".editor-shell")).toHaveAttribute("data-view-mode", "Transaction");
      await expect.poll(async () => (await counters()).wavePrefetchOwnerCount).toBe(0);
      const inTransaction = await counters();
      await page.waitForTimeout(2500);
      const settled = await counters();
      // The abandoned generation must not publish and no prefetch may continue under Transaction.
      expect(settled.wavePrefetchRequestedCount, "stale/detached prefetch published under Transaction").toBe(inTransaction.wavePrefetchRequestedCount);
      expect(settled.wavePrefetchPreparedCount).toBe(inTransaction.wavePrefetchPreparedCount);
      expect(settled.wavePrefetchOwnerCount).toBe(0);
      console.info("#847 in-flight", { size, bottomVisible, requestedAtSwitch, inTransaction, settled });

      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
      await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
      await expect(page.locator(".editor-shell")).toHaveAttribute("data-view-mode", "Cycle");
      await expect.poll(async () => (await counters()).wavePrefetchOwnerCount, { timeout: 15_000 }).toBeGreaterThan(0);
      await expect.poll(async () => (await counters()).wavePrefetchRequestedCount, { timeout: 15_000 }).toBeGreaterThan(settled.wavePrefetchRequestedCount);

      // Real wheel scrolling after the roundtrip: each visible Signal row has its matching, non-blank wave owner and no stale owner remains.
      const box = (await viewport.boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 3);
      for (const delta of [400, 600, -300, 900, -1200]) {
        await page.mouse.wheel(0, delta);
        await page.waitForTimeout(150);
      }
      await expect.poll(() => viewport.evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        const root = element.ownerDocument.querySelector<HTMLElement>("[data-testid='cycle-surface']")!;
        const rows = [...root.querySelectorAll<HTMLElement>("[data-role='timing-row'][data-kind='timing']")].filter((row) => { const r = row.getBoundingClientRect(); return r.bottom > bounds.top && r.top < bounds.bottom; });
        if (rows.length === 0) return "no rows";
        for (const row of rows) {
          const owner = root.querySelector<HTMLElement>(`[data-role='wave-owner'][data-signal-id='${CSS.escape(row.dataset.rowId ?? "")}']`);
          if (!owner) return `missing owner ${row.dataset.rowId}`;
          if (!owner.querySelector("svg, canvas[data-wave-canvas]") && !owner.hasAttribute("data-wave-error")) return `blank ${row.dataset.rowId}`;
          const dy = Math.abs(owner.getBoundingClientRect().top - row.getBoundingClientRect().top);
          if (dy > 2) return `Y mismatch ${row.dataset.rowId} ${dy}`;
        }
        return "ok";
      }), { timeout: 15_000 }).toBe("ok");

      expect(await host.getAttribute("data-canonical-revision")).toBe(before.revision);
      expect(await page.getByTestId("history-status").textContent()).toBe(before.history);
      expect(await page.getByTestId("dirty-status").textContent()).toBe(before.dirty);
      expect(problems).toEqual([]);
    });
  }
}
