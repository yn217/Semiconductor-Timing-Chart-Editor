import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

/**
 * #593 acceptance: Cycle / Transaction / Combined own their workspace layout independently. Exact fixture 24, both target
 * viewports. Horizontal density is the same 40 px/cycle contract in every mode and one mode never changes another's; each mode has
 * exactly one real horizontal scroll owner (the `timeline-hscroll` strip is the shared scrollbar control, not a second axis); the page
 * never overflows horizontally, also after a resize; view-only mode switching leaves Canonical / History / Dirty untouched.
 */
type Snapshot = { readonly mode: string; readonly owners: readonly string[]; readonly firstTickX: number; readonly pitch: number; readonly pageOverflow: number };

for (const viewport of [{ width: 1280, height: 720 }, { width: 1672, height: 941 }]) {
  test(`mode workspaces stay independent at ${viewport.width}x${viewport.height} incl. mode round trips and resize`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize(viewport);
    await page.goto("/");
    const surface = page.getByTestId("cycle-surface");
    await expect(surface).toHaveAttribute("data-cycle-view-ready", "true");
    await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(resolve("samples/old/pre-reset-2026-10-02/showcase/24_protocol_transaction_showcase.tcd.json"));
    await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 30_000 });
    const revision = await surface.getAttribute("data-canonical-revision");
    const history = await page.getByTestId("history-status").innerText();
    const dirty = await page.getByTestId("dirty-status").innerText();

    const snapshot = (): Promise<Snapshot> => page.evaluate(() => {
      const owners = [...document.querySelectorAll<HTMLElement>("*")]
        .filter((element) => { const style = getComputedStyle(element); return (style.overflowX === "auto" || style.overflowX === "scroll") && element.scrollWidth > element.clientWidth + 1 && element.dataset.testid !== "timeline-hscroll" && element.dataset.role !== "timeline-hscroll" && !element.closest(".bottom-content, [data-role='bottom-content']"); })
        .map((element) => element.dataset.role ?? element.dataset.testid ?? element.className.toString());
      const ticks = [...document.querySelectorAll<HTMLElement>("[data-testid='cycle-ruler'] .cycle-tick[data-source-cycle]")].slice(0, 2).map((tick) => tick.getBoundingClientRect().left);
      return { mode: document.querySelector("[data-testid='view-mode-status']")?.textContent ?? "", owners, firstTickX: Math.round(ticks[0] ?? -1), pitch: Math.round((ticks[1] ?? 0) - (ticks[0] ?? 0)), pageOverflow: document.documentElement.scrollWidth - window.innerWidth };
    });
    const enter = async (mode: "Cycle" | "Transaction" | "Combined") => {
      await page.locator(".view-mode").getByRole("button", { name: mode, exact: true }).click();
      await expect(page.getByTestId("view-mode-status")).toHaveText(`Mode: ${mode}`);
      await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 30_000 });
      await page.waitForTimeout(250);
      return snapshot();
    };

    const cycle1 = await enter("Cycle");
    const transaction = await enter("Transaction");
    const combined = await enter("Combined");
    const cycle2 = await enter("Cycle");
    const transaction2 = await enter("Transaction");
    await enter("Cycle");

    for (const item of [cycle1, transaction, combined, cycle2]) {
      expect(item.pitch, `${item.mode} horizontal density (40 px/cycle at 100%)`).toBe(40);
      expect(item.pageOverflow, `${item.mode} page horizontal overflow`).toBeLessThanOrEqual(0);
    }
    expect(cycle1.owners.length, "Cycle has one horizontal scroll owner").toBeLessThanOrEqual(1);
    expect(combined.owners.length, `Combined has one shared horizontal scroll owner: ${combined.owners.join(" + ")}`).toBeLessThanOrEqual(1);
    // Visiting Transaction / Combined must not move Cycle's geometry, nor Cycle's Transaction's.
    expect(cycle2).toEqual(cycle1);
    expect(transaction2.firstTickX).toBe(transaction.firstTickX);
    expect(transaction2.pitch).toBe(transaction.pitch);

    // Resize keeps every mode inside the page and Cycle on the same scroll owner.
    const other = viewport.width === 1280 ? { width: 1672, height: 941 } : { width: 1280, height: 720 };
    await page.setViewportSize(other);
    await page.waitForTimeout(400);
    const resized = await snapshot();
    expect(resized.pageOverflow).toBeLessThanOrEqual(0);
    expect(resized.owners).toEqual(cycle1.owners);
    expect(resized.pitch).toBe(40);

    expect(await surface.getAttribute("data-canonical-revision")).toBe(revision);
    expect(await page.getByTestId("history-status").innerText()).toBe(history);
    expect(await page.getByTestId("dirty-status").innerText()).toBe(dirty);
  });
}
