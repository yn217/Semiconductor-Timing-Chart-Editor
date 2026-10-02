import { expect, test } from "@playwright/test";
import { generatePerformanceDocument } from "@timing-chart-v2/testing";

/**
 * #933: Transaction (groupId, laneId) identity must be injective in the center lanes. A persisted Group literally named
 * "ungrouped" must stay distinct from the synthetic Ungrouped section, and delimiter-bearing Group/Lane IDs ("a:b"+"c" vs
 * "a"+"b:c") must not merge. Every Transaction renders exactly once.
 */
test("Transaction lanes keep (groupId, laneId) ownership distinct for sentinel and delimiter-bearing IDs", async ({ page }) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => { try { window.localStorage.setItem("timing-chart-v2.view-mode", "Transaction"); } catch { /* best effort */ } });
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto("/");
  const base = generatePerformanceDocument({ signalCount: 4, cycleCount: 64, profile: "standard" });
  const tx = (id: string, start: number, laneId: string, groupId?: string) => ({ id, name: id, start, end: start + 6, laneId, ...(groupId === undefined ? {} : { groupId }), linkedSignals: [] });
  const document = {
    ...base,
    transactionGroups: [
      { id: "ungrouped", name: "Real ungrouped", color: "#2f6fd1", order: 0 },
      { id: "a:b", name: "Group a:b", color: "#d1602f", order: 1 },
      { id: "a", name: "Group a", color: "#2fd1a0", order: 2 },
    ],
    transactions: [
      tx("tx_synthetic", 2, "lane_0"),
      tx("tx_real_ungrouped", 10, "lane_0", "ungrouped"),
      tx("tx_ab_c", 18, "c", "a:b"),
      tx("tx_a_bc", 26, "b:c", "a"),
    ],
  };
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "p933.tcd", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(document)) });
  const lanes = page.getByTestId("transaction-lanes");
  await expect(lanes.locator("[data-transaction-id='tx_ab_c']")).toHaveCount(1, { timeout: 60_000 });

  for (const id of ["tx_synthetic", "tx_real_ungrouped", "tx_ab_c", "tx_a_bc"]) await expect(lanes.locator(`[data-transaction-id='${id}']`), id).toHaveCount(1);
  // Four distinct (group, lane) owners: 3 real Groups + the synthetic Ungrouped section, each with its own header and lane label.
  await expect(lanes.getByTestId("transaction-group-header")).toHaveCount(4);
  await expect(lanes.locator("[data-testid='transaction-group-header'][data-ungrouped='true']")).toHaveCount(1);
  await expect(lanes.locator("[data-testid='transaction-group-header'][data-transaction-group-id='ungrouped']")).toHaveCount(1);
  await expect(lanes.getByTestId("transaction-lane-label")).toHaveCount(4);
  await expect(lanes.locator("[data-testid='transaction-lane-label'][data-ungrouped='true'][data-lane-id='lane_0']")).toHaveCount(1);
  await expect(lanes.locator("[data-testid='transaction-lane-label'][data-transaction-group-id='ungrouped'][data-lane-id='lane_0']")).toHaveCount(1);
  await expect(lanes.locator("[data-testid='transaction-lane-label'][data-transaction-group-id='a:b'][data-lane-id='c']")).toHaveCount(1);
  await expect(lanes.locator("[data-testid='transaction-lane-label'][data-transaction-group-id='a'][data-lane-id='b:c']")).toHaveCount(1);
  // The two lane_0 transactions sit in different vertical bands (different sections), not one merged bucket.
  const top = async (id: string) => (await lanes.locator(`[data-transaction-id='${id}']`).boundingBox())!.y;
  expect(Math.abs((await top("tx_synthetic")) - (await top("tx_real_ungrouped")))).toBeGreaterThan(8);
  expect(Math.abs((await top("tx_ab_c")) - (await top("tx_a_bc")))).toBeGreaterThan(8);
});
