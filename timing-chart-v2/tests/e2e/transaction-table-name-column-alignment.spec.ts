import { expect, test } from "@playwright/test";
import { generatePerformanceDocument } from "@timing-chart-v2/testing";

/**
 * Bottom Transaction table: the Name column must start at the same X on every row (Transactions with Phases, without Phases, the
 * selected editing row, and expanded Phase rows). The row's disclosure toggle is also a direct <button> of the row and used to be
 * stretched by the row-button rule, pushing only Phase-bearing rows right. Expanded Phases carry a hierarchy guide.
 */
test("Transaction table Name column is aligned across rows and expanded Phases show a hierarchy guide", async ({ page }) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => { try { window.localStorage.setItem("timing-chart-v2.view-mode", "Transaction"); } catch { /* best effort */ } });
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto("/");
  const base = generatePerformanceDocument({ signalCount: 4, cycleCount: 64, profile: "standard" });
  const tx = (id: string, start: number, phases: ReadonlyArray<readonly [string, number, number]>) => ({ id, name: id, start, end: start + 8, laneId: "lane_0", linkedSignals: [], ...(phases.length ? { phases: phases.map(([name, s, e]) => ({ name, start: s, end: e })) } : {}) });
  const document = { ...base, transactionGroups: [], transactions: [tx("tx_with_phases", 2, [["Address", 2, 4], ["Wait", 4, 7], ["Response", 7, 10]]), tx("tx_plain", 20, []), tx("tx_more_phases", 30, [["Cmd", 30, 33], ["Data", 33, 38]])] };
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "tt.tcd", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(document)) });
  const table = page.locator(".transaction-list");
  await expect(table.locator("[data-transaction-row-id='tx_plain']")).toBeVisible({ timeout: 60_000 });
  await table.locator("[data-transaction-row-id='tx_with_phases'] > button:not(.transaction-disclosure-slot)").click();
  await table.getByRole("button", { name: "Expand phases for tx_with_phases" }).click();
  await table.getByRole("button", { name: "Expand phases for tx_more_phases" }).click();
  await expect(table.locator("[data-transaction-phase-row-id]")).toHaveCount(5);

  const nameLefts = await table.evaluate((root) => {
    const left = (element: Element | null) => element?.getBoundingClientRect().left;
    const rows = [...root.querySelectorAll<HTMLElement>("[data-transaction-row-id]")].map((row) => ({
      id: row.dataset.transactionRowId!,
      // editing row: the Name <input>; others: the <b> name cell
      x: left(row.querySelector("input[aria-label='Bottom Transaction name']") ?? row.querySelector("button:not(.transaction-disclosure-slot) > b")),
    }));
    const phases = [...root.querySelectorAll<HTMLElement>("[data-transaction-phase-row-id] .transaction-phase-cells > span:first-child")].map((cell) => left(cell));
    const header = left(root.querySelector(".transaction-list-header-cells > span:first-child"));
    return { header, rows, phases };
  });
  for (const row of nameLefts.rows) expect(Math.abs(row.x! - nameLefts.header!), `Name column of ${row.id} vs header`).toBeLessThanOrEqual(1);
  for (const x of nameLefts.phases) expect(Math.abs(x! - nameLefts.header!), "Phase name column vs header").toBeLessThanOrEqual(1);

  // Hierarchy guide: spine + elbow exist on Phase rows, and the last Phase ends the spine at mid-height.
  const guide = await table.evaluate((root) => [...root.querySelectorAll<HTMLElement>("[data-transaction-phase-row-id]")].map((row) => {
    const indent = row.querySelector<HTMLElement>(".transaction-phase-indent")!;
    return { last: row.dataset.phaseLast, spine: getComputedStyle(indent, "::before").bottom, elbow: getComputedStyle(indent, "::after").width };
  }));
  expect(guide.map((item) => item.last)).toEqual(["false", "false", "true", "false", "true"]);
  for (const item of guide) expect(item.elbow).toBe("11px");
  await table.screenshot({ path: "test-results/transaction-table-guide.png" });
});
