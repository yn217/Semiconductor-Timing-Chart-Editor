import path from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { startInCycleSample } from "./cycle-startup.js";

startInCycleSample(test);

const SAMPLE = path.resolve(process.cwd(), "samples/old/pre-reset-2026-10-02/acceptance-429/sample-transaction-mode-closure.tcd.json");

// txn_read0 is [10,60) with Phases Address [10,20), Read Data [20,50), Response [50,60).
// Dragging an edge past its edge-attached Phase boundary must clamp the live
// preview to the same limit the planner accepts, so the committed bar matches
// what the user saw during the drag (instead of previewing a position the
// planner then rejects and the bar snaps back from).

async function openTransactionSample(page: Page): Promise<Locator> {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(SAMPLE);
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  await page.getByRole("tab", { name: "Transaction", exact: true }).click();
  const transaction = page.getByTestId("transaction-lanes").locator("[data-transaction-id='txn_read0']");
  await expect(transaction).toBeVisible();
  return transaction;
}

async function dragEdgeTo(page: Page, transaction: Locator, edge: "start" | "end", targetCycle: number) {
  const host = page.getByTestId("cycle-surface");
  const revisionBefore = await host.getAttribute("data-canonical-revision");
  const box = (await transaction.boundingBox())!;
  const target = (await page.getByTestId("cycle-ruler").locator(`[data-cycle='${targetCycle}']`).boundingBox())!;
  await transaction.locator(`[data-edge='${edge}']`).hover({ position: { x: 2, y: 4 } });
  await page.mouse.down();
  await page.mouse.move(target.x, box.y + box.height / 2, { steps: 4 });
  await expect(transaction).toHaveAttribute("data-drag-preview-updates", /^[1-9]/);
  const duringBox = (await transaction.boundingBox())!;
  const during = edge === "start" ? duringBox.x : duringBox.x + duringBox.width;
  await page.mouse.up();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  const afterBox = (await transaction.boundingBox())!;
  const after = edge === "start" ? afterBox.x : afterBox.x + afterBox.width;
  const revisionAfter = await host.getAttribute("data-canonical-revision");
  return { during, after, target: target.x, committed: revisionAfter !== revisionBefore };
}

test("start-edge drag past the first Phase boundary previews the clamped edge and commits it", async ({ page }) => {
  const transaction = await openTransactionSample(page);
  const result = await dragEdgeTo(page, transaction, "start", 20);
  // Preview and committed bar agree, and the resize is accepted (revision moved).
  expect(Math.abs(result.during - result.after)).toBeLessThanOrEqual(1);
  expect(result.committed).toBe(true);
  // The pointer sat on cycle 20, so an unclamped preview would sit at the target.
  expect(Math.abs(result.during - result.target)).toBeGreaterThan(1);
});

test("end-edge drag past the last Phase start previews the clamped edge and commits it", async ({ page }) => {
  const transaction = await openTransactionSample(page);
  await transaction.locator("[data-edge='end']").scrollIntoViewIfNeeded();
  const result = await dragEdgeTo(page, transaction, "end", 50);
  expect(Math.abs(result.during - result.after)).toBeLessThanOrEqual(1);
  expect(result.committed).toBe(true);
  expect(Math.abs(result.during - result.target)).toBeGreaterThan(1);
});
