import { expect, test } from "@playwright/test";
import { generatePerformanceDocument } from "@timing-chart-v2/testing";

/**
 * #726 (presentation only): in standalone Transaction mode a Lane stays identifiable while following it horizontally (sticky Lane chip),
 * the selected Transaction is visually primary, unselected bars do not carry the selection treatment, labels never shrink into
 * unreadable micro-text across Zoom, and none of it mutates Canonical/History/Dirty. Both required viewports.
 */
for (const size of [{ width: 1280, height: 720 }, { width: 1672, height: 941 }]) {
  test(`Lane chip stays pinned, selection is primary, labels stay readable across Zoom at ${size.width}x${size.height}`, async ({ page }) => {
    test.setTimeout(150_000);
    await page.addInitScript(() => { try { window.localStorage.setItem("timing-chart-v2.view-mode", "Transaction"); } catch { /* best effort */ } });
    await page.setViewportSize(size);
    await page.goto("/");
    const base = generatePerformanceDocument({ signalCount: 4, cycleCount: 2000, profile: "standard" });
    const document = { ...base, transactions: Array.from({ length: 12 }, (_, index) => ({ id: `tx_${index}`, name: `Transfer ${index}`, start: index * 150, end: index * 150 + 60, laneId: `lane_${index % 3}`, linkedSignals: [] })) };
    await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "p726.tcd", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(document)) });
    const lanes = page.getByTestId("transaction-lanes");
    await expect(lanes.locator("[data-transaction-id='tx_0']")).toHaveCount(1, { timeout: 60_000 });
    const host = page.getByTestId("cycle-surface");
    await expect(host).toHaveAttribute("data-canonical-revision", /^\d+$/);
    const revision = await host.getAttribute("data-canonical-revision");
    const history = await page.getByTestId("history-status").textContent();
    const dirty = await page.getByTestId("dirty-status").textContent();
    const viewport = page.getByTestId("cycle-viewport");

    // 1. Follow a Lane horizontally: the Lane chip stays at the scroll owner's left edge instead of scrolling away.
    const chipOffsets = async () => page.evaluate(() => {
      const owner = document.querySelector<HTMLElement>("[data-testid='cycle-viewport']")!.getBoundingClientRect();
      return [...document.querySelectorAll<HTMLElement>("[data-testid='transaction-lane-label'] .transaction-lane-label-name")].map((chip) => Math.round(chip.getBoundingClientRect().left - owner.left));
    });
    const initial = await chipOffsets();
    expect(initial.length).toBeGreaterThanOrEqual(3);
    await viewport.evaluate((element) => { element.scrollLeft = element.scrollWidth * 0.4; });
    await expect.poll(() => viewport.evaluate((element) => element.scrollLeft)).toBeGreaterThan(300);
    const scrolled = await chipOffsets();
    expect(scrolled.length).toBeGreaterThanOrEqual(3);
    for (const offset of scrolled) expect(offset, `Lane chip stays within the left edge of the scroll owner: ${scrolled.join(",")}`).toBeLessThanOrEqual(8);
    for (const offset of scrolled) expect(offset).toBeGreaterThanOrEqual(-1);

    // 2. Selection is primary: only the selected bar carries the selection treatment.
    const bars = lanes.locator("[data-transaction-id]");
    const visibleIds = await bars.evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-transaction-id")!));
    expect(visibleIds.length).toBeGreaterThan(1);
    await bars.first().click();
    await expect(bars.first()).toHaveAttribute("data-selected", "true");
    const treatment = async (id: string) => lanes.locator(`[data-transaction-id='${id}']`).evaluate((element) => { const style = getComputedStyle(element); return `${style.boxShadow}|${style.outlineStyle}|${style.borderTopColor}|${style.opacity}`; });
    const selectedTreatment = await treatment(visibleIds[0]!);
    for (const other of visibleIds.slice(1)) {
      await expect(lanes.locator(`[data-transaction-id='${other}']`)).toHaveAttribute("data-selected", "false");
      expect(await treatment(other), `unselected ${other} must not carry the selection treatment`).not.toBe(selectedTreatment);
    }

    // 3. Labels stay readable across Zoom: bar text never drops below 9px and is clipped, not shrunk.
    const zoomIn = page.getByTestId("ribbon").getByRole("button", { name: "Zoom In", exact: true });
    const zoomOut = page.getByTestId("ribbon").getByRole("button", { name: "Zoom Out", exact: true });
    const labelSizes = async () => lanes.locator("[data-transaction-id]").evaluateAll((nodes) => nodes.flatMap((node) => [...node.querySelectorAll<HTMLElement>("span")].map((label) => parseFloat(getComputedStyle(label).fontSize))));
    for (const step of ["in", "in", "out", "out", "out"] as const) {
      await (step === "in" ? zoomIn : zoomOut).click();
      await page.waitForTimeout(250);
      const sizes = await labelSizes();
      expect(sizes.length).toBeGreaterThan(0);
      for (const size of sizes) expect(size, `label font size after zoom ${step}`).toBeGreaterThanOrEqual(9);
    }

    // Presentation only.
    expect(await host.getAttribute("data-canonical-revision")).toBe(revision);
    await expect(page.getByTestId("history-status")).toHaveText(history!);
    await expect(page.getByTestId("dirty-status")).toHaveText(dirty!);
  });
}
