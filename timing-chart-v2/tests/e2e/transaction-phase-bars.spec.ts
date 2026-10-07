import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { visualArtifactRoot } from "./artifact-output.js";

// Transaction Mode opens with the approved six-transaction sample so the
// phase projection can be verified directly in the production surface.
async function openTransactionSample(page: import("@playwright/test").Page) {
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Home", exact: true }).click();
  await expect(page.getByTestId("transaction-left-tree-row-demo_txn_read")).toBeVisible();
}

test("Transaction mode keeps the inspection sample available after reload", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");
  await openTransactionSample(page);
  await expect(page.getByTestId("transaction-left-tree-row-demo_txn_read")).toBeVisible();
  await expect(page.locator(".transaction-list-row[data-transaction-row-id]")).toHaveCount(6);
  await page.reload();
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  await expect(page.getByTestId("transaction-left-tree-row-demo_txn_read")).toBeVisible();
  await expect(page.locator(".transaction-list-row[data-transaction-row-id]")).toHaveCount(6);
  await expect(page.locator("[data-transaction-id='demo_txn_read'] .transaction-phases small")).toHaveCount(3);
});

for (const width of [1280, 1672]) test(`Transaction phases follow semantic durations at ${width}`, async ({ page }) => {
  await page.setViewportSize({ width, height: width === 1280 ? 720 : 941 });
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await openTransactionSample(page);
  const phases = page.locator("[data-transaction-id='demo_txn_read'] .transaction-phases small");
  await expect(phases).toHaveCount(3);
  const boxes = await phases.evaluateAll(es => es.map(e => ({ width: e.getBoundingClientRect().width, left: e.getBoundingClientRect().left, right: e.getBoundingClientRect().right })));
  expect(Math.abs(boxes[0]!.width / 10 - boxes[1]!.width / 30)).toBeLessThan(1);
  expect(Math.abs(boxes[0]!.right - boxes[1]!.left)).toBeLessThan(1);
  expect(Math.abs(boxes[1]!.right - boxes[2]!.left)).toBeLessThan(1);
  await page.screenshot({ path: resolve(visualArtifactRoot(), `transaction-phases-${width}.png`) });
});

test("Phase-protected Transaction edge resize is rejected without a canonical change", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await openTransactionSample(page);
  const bar = page.locator("[data-transaction-id='demo_txn_read']");
  // The semantic Phase hit targets intentionally sit over the lower phase
  // strip. Select the Transaction through its unoccluded upper bar surface.
  await bar.click({ position: { x: 12, y: 4 } });
  const inspector = page.getByTestId("inspector");
  const beforeStart = await inspector.getByLabel("Transaction start").inputValue();
  const beforeRevision = await host.getAttribute("data-canonical-revision");
  const handle = bar.locator(":scope > i[data-edge='start']");
  const box = await handle.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  // Move past the first authored phase boundary (10 -> 20). Resizing
  // within the edge-attached phase is valid; crossing its boundary is not.
  await page.mouse.move(box!.x + 420, box!.y + box!.height / 2, { steps: 4 });
  await page.mouse.up();
  await expect(inspector.getByLabel("Transaction start")).toHaveValue(beforeStart);
  await expect(host).toHaveAttribute("data-canonical-revision", beforeRevision!);

  const beforeEnd = await inspector.getByLabel("Transaction end").inputValue();
  const endHandle = bar.locator(":scope > i[data-edge='end']");
  const endBox = await endHandle.boundingBox();
  expect(endBox).not.toBeNull();
  await page.mouse.move(endBox!.x + endBox!.width / 2, endBox!.y + endBox!.height / 2);
  await page.mouse.down();
  // Move past the last authored phase boundary (50 -> 60).
  await page.mouse.move(endBox!.x - 420, endBox!.y + endBox!.height / 2, { steps: 4 });
  await page.mouse.up();
  await expect(inspector.getByLabel("Transaction end")).toHaveValue(beforeEnd);
  await expect(host).toHaveAttribute("data-canonical-revision", beforeRevision!);
});

test("Transaction Phase selection restores by stable Phase ID after mode remount", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");
  await openTransactionSample(page);
  const phase = page.locator(".transaction-phase-hit-target").first();
  await expect(phase).toBeVisible();
  const phaseId = await phase.getAttribute("data-phase-id");
  expect(phaseId).toBeTruthy();
  const revision = await page.getByTestId("revision-status").textContent();
  const history = await page.getByTestId("history-status").textContent();
  const dirty = await page.getByTestId("dirty-status").textContent();
  await phase.click();
  const selectedPhase = page.locator(`.transaction-phase-hit-target[data-phase-id="${phaseId}"]`);
  await expect(selectedPhase).toHaveAttribute("data-selected", "true");
  await expect(selectedPhase).toHaveAttribute("aria-pressed", "true");
  await expect(selectedPhase).toHaveCSS("outline-style", "solid");
  await expect(selectedPhase).toHaveCSS("outline-width", "2px");
  const transactionId = await phase.getAttribute("data-phase-transaction-id");
  expect(transactionId).toBeTruthy();
  await expect(page.locator(`[data-transaction-id="${transactionId}"]`)).toHaveAttribute("data-selected", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  await expect(selectedPhase).toHaveAttribute("data-selected", "true");
  await expect(selectedPhase).toHaveAttribute("aria-pressed", "true");
  await expect(selectedPhase).toHaveCSS("outline-style", "solid");
  await expect(selectedPhase).toHaveCSS("outline-width", "2px");
  await expect(page.getByTestId("revision-status")).toHaveText(revision!);
  await expect(page.getByTestId("history-status")).toHaveText(history!);
  await expect(page.getByTestId("dirty-status")).toHaveText(dirty!);
});
