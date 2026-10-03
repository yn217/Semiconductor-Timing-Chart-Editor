import { expect, test, type Page } from "@playwright/test";
import { generatePerformanceDocument } from "@timing-chart-v2/testing";
import { documentState, expectViewOnly } from "./view-only.js";

/**
 * #593 independent verification: switching mode WHILE render / scroll / zoom / resize work is in flight (CPU throttled, no settle wait) leaves
 * no stale owner, duplicate scrollbar, Cycle chrome in Transaction, or inherited width, and the mode round trip restores Cycle's own state.
 */
const sizes = [{ width: 1280, height: 720 }, { width: 1672, height: 941 }] as const;
const setModeNow = (page: Page, mode: "Cycle" | "Transaction" | "Combined") => page.locator(".view-mode").getByRole("button", { name: mode, exact: true }).click();

for (const size of sizes) {
  // Known gap (#593, HANDOFF -> CODEX): Cycle frozen chrome is still mounted (hidden) in Transaction on main until PR #1005 lands; test.fail flips red when fixed, then remove the annotation.
  test.fail(`mode switch during in-flight work leaves no stale owner/chrome at ${size.width}x${size.height}`, async ({ page }) => {
    test.setTimeout(180_000);
    const problems: string[] = [];
    page.on("pageerror", (error) => problems.push(error.message));
    await page.setViewportSize(size);
    await page.goto("/");
    const host = page.getByTestId("cycle-surface");
    await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
    const base = generatePerformanceDocument({ signalCount: 40, cycleCount: 400, profile: "standard" });
    const document = { ...base, transactions: Array.from({ length: 12 }, (_, index) => ({ id: `tx_${index}`, name: `Transfer ${index}`, start: index * 30, end: index * 30 + 20, laneId: `lane_${index % 3}`, linkedSignals: [] })) };
    await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "p593f.tcd", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(document)) });
    await expect(host).toHaveAttribute("data-editor-idle", "true", { timeout: 60_000 });
    await setModeNow(page, "Cycle");
    await expect(page.locator(".cycle-panel")).toHaveAttribute("data-view-mode", "Cycle");
    await page.waitForTimeout(500);
    const shell = page.locator(".editor-shell");
    const cycleLeft = await shell.getAttribute("data-left-pane-width");
    const viewOnlyBefore = await documentState(page);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 6 });
    const viewport = page.getByTestId("cycle-viewport");
    const ribbon = page.getByTestId("ribbon");

    for (let round = 0; round < 3; round += 1) {
      // Kick off scroll + zoom work, then switch immediately without waiting for idle.
      await viewport.evaluate((element, top) => { element.scrollTo({ top, behavior: "instant" }); element.scrollLeft += 400; }, 300 + round * 200);
      await ribbon.getByRole("button", { name: "Zoom In", exact: true }).click();
      await setModeNow(page, "Transaction");
      await expect(page.locator(".cycle-panel")).toHaveAttribute("data-view-mode", "Transaction");
      await expect(host).toHaveAttribute("data-editor-idle", "true", { timeout: 60_000 });
      await expect(host.locator("[data-role='frozen-row'], [data-role='frozen-label-rows'], [data-role='frozen-group-header']"), "Cycle frozen chrome residue in Transaction").toHaveCount(0);
      await expect(page.getByTestId("left-pane-resizer")).toHaveCount(0);
      await expect(page.getByTestId("frozen-pane-resizer")).toHaveCount(0);
      await expect(page.locator("[data-role='timeline-viewport']"), "exactly one timeline viewport").toHaveCount(1);
      await expect(page.locator(".cycle-panel")).toHaveCount(1);
      await expect(page.getByTestId("left-workspace-rail")).toHaveCount(1);
      // Transaction must not inherit Cycle's frozen/left width as its own origin.
      const origin = await page.evaluate(() => getComputedStyle(document.querySelector(".editor-shell")!).getPropertyValue("--time-domain-left").trim());
      expect(parseFloat(origin || "0")).toBe(0);

      await ribbon.getByRole("button", { name: "Zoom Out", exact: true }).click();
      await setModeNow(page, "Cycle");
      await expect(page.locator(".cycle-panel")).toHaveAttribute("data-view-mode", "Cycle");
      await expect(host).toHaveAttribute("data-editor-idle", "true", { timeout: 60_000 });
      await expect(host.locator("[data-role='frozen-row']").first()).toBeVisible();
      await expect(page.getByTestId("left-pane-resizer")).toHaveCount(1);
      await expect(page.getByTestId("frozen-pane-resizer")).toHaveCount(1);
      expect(await shell.getAttribute("data-left-pane-width")).toBe(cycleLeft);
      expect(await page.locator("[data-role='timeline-viewport']").count()).toBe(1);
      expect(await page.locator("[data-testid='timeline-hscroll']").count(), "no duplicate horizontal scrollbar").toBeLessThanOrEqual(1);
    }
    // Combined in-flight, then back.
    await setModeNow(page, "Combined");
    await setModeNow(page, "Transaction");
    await setModeNow(page, "Cycle");
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
    await expect(page.locator(".cycle-panel")).toHaveAttribute("data-view-mode", "Cycle");
    await expect(host).toHaveAttribute("data-editor-idle", "true", { timeout: 60_000 });
    // No stale owner: every visible Signal row has exactly one matching wave owner at the matching Y.
    await expect.poll(() => viewport.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      const rows = [...document.querySelectorAll<HTMLElement>("[data-role='timing-row'][data-kind='timing']")].filter((row) => { const r = row.getBoundingClientRect(); return r.bottom > bounds.top && r.top < bounds.bottom; });
      for (const row of rows) {
        const owners = document.querySelectorAll<HTMLElement>(`[data-role='wave-owner'][data-signal-id='${CSS.escape(row.dataset.rowId ?? "")}']`);
        if (owners.length !== 1) return `owners=${owners.length} ${row.dataset.rowId}`;
        if (Math.abs(owners[0]!.getBoundingClientRect().top - row.getBoundingClientRect().top) > 2) return `Y mismatch ${row.dataset.rowId}`;
      }
      return rows.length > 0 ? "ok" : "no rows";
    }), { timeout: 20_000 }).toBe("ok");
    await expectViewOnly(page, viewOnlyBefore);
    expect(problems).toEqual([]);
  });
}
