import { expect, test, type Page } from "@playwright/test";

// #750: 1 TC = 10 cycles -> 1 TC = 50 cycles changes the *presentation geometry* (ruler label positions, Bottom/Inspector
// values), while canonical source cycles and the source-cycle geometry of Transaction bars do not move.
const rulerLabelXs = (page: Page) => page.evaluate(() => [...document.querySelectorAll<HTMLElement>("[data-testid='cycle-ruler'] .cycle-tick")]
  .filter((tick) => (tick.textContent ?? "").trim() !== "").slice(0, 4).map((tick) => ({ label: (tick.textContent ?? "").trim(), source: Number(tick.dataset.sourceCycle), x: tick.getBoundingClientRect().x })));
const barBox = (page: Page) => page.evaluate(() => { const bar = document.querySelector<HTMLElement>("[data-transaction-id='demo_txn_read']")!; const b = bar.getBoundingClientRect(); return { x: Math.round(b.x * 10) / 10, width: Math.round(b.width * 10) / 10 }; });

for (const size of [{ width: 1672, height: 941 }, { width: 1280, height: 720 }]) {
  test(`1 TC = 10 cycles -> 50 cycles moves ruler labels, keeps canonical cycles and bar geometry (${size.width}x${size.height})`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.goto("/?transaction-demo");
    await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
    await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
    const select = page.getByTestId("transaction-tc-scale");
    await expect(select).toHaveValue("10");
    await page.getByTestId("transaction-left-tree-row-demo_txn_read").click();
    const inspector = page.getByTestId("inspector");
    const duration = inspector.locator(".property-row", { hasText: "Duration" });
    await expect(duration).toContainText("cycles");
    const cyclesOf = async () => Number(/\((\d+) cycles\)/.exec((await duration.innerText()) ?? "")?.[1]);
    const canonicalStart = async () => Number(await inspector.getByLabel("Transaction start").inputValue());

    const labelsBefore = await rulerLabelXs(page);
    const barBefore = await barBox(page);
    const durationBefore = await cyclesOf();
    const startTcBefore = await canonicalStart();
    expect(labelsBefore.map((l) => l.source)).toEqual([0, 10, 20, 30]);
    const spacingBefore = labelsBefore[1]!.x - labelsBefore[0]!.x;

    await select.selectOption("50");
    await expect.poll(async () => (await rulerLabelXs(page)).map((l) => l.source)).toEqual([0, 50, 100, 150]);
    const labelsAfter = await rulerLabelXs(page);
    const spacingAfter = labelsAfter[1]!.x - labelsAfter[0]!.x;
    // Geometry of the ruler labels really changed: 5x wider spacing (same px-per-cycle).
    expect(spacingAfter / spacingBefore).toBeGreaterThan(4.9);
    expect(spacingAfter / spacingBefore).toBeLessThan(5.1);
    expect(labelsAfter.map((l) => l.label)).toEqual(["0", "1", "2", "3"]);

    // Canonical source cycles + bar source-cycle geometry did not move.
    expect(await cyclesOf()).toBe(durationBefore);
    expect(await barBox(page)).toEqual(barBefore);
    // Displayed Start is the same canonical cycle re-expressed in the new unit.
    expect(await canonicalStart()).toBeCloseTo(startTcBefore * 10 / 50, 3);
    // Undo restores the presentation exactly.
    await page.getByTestId("ribbon").getByRole("button", { name: "Undo", exact: true }).click();
    await expect(select).toHaveValue("10");
    await expect.poll(async () => (await rulerLabelXs(page)).map((l) => l.source)).toEqual([0, 10, 20, 30]);
    expect(await canonicalStart()).toBeCloseTo(startTcBefore, 3);
  });
}
