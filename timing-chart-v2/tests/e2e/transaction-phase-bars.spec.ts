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

test("Phase-protected Transaction edge resize stops at the Phase limit instead of crossing it", async ({ page }) => {
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
  // Move past the last authored phase start (50): the edge stops one cycle
  // after it (51 = 5.1 TC), the preview shows the same clamp, and it commits.
  await page.mouse.move(endBox!.x - 420, endBox!.y + endBox!.height / 2, { steps: 4 });
  await page.mouse.up();
  expect(beforeEnd).not.toBe("5.1");
  await expect(inspector.getByLabel("Transaction end")).toHaveValue("5.1");
  await expect(host).not.toHaveAttribute("data-canonical-revision", beforeRevision!);
});

test("Scenario switching never aliases a copied Transaction Phase selection", async ({ page }) => {
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto("/");
  await openTransactionSample(page);
  await page.getByTestId("scenario-enable").click();
  const active = page.getByTestId("active-scenario");
  const sourceScenarioId = await active.inputValue();
  const sourcePhase = page.getByRole("button", { name: "Read_0, phase Address, cycles 10 to 20", exact: true });
  await expect(sourcePhase).toBeVisible();
  const sourcePhaseId = await sourcePhase.getAttribute("data-phase-id");
  expect(sourcePhaseId).toBeTruthy();
  await sourcePhase.click();
  await expect(sourcePhase).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("scenario-duplicate").click();
  const copyScenarioId = await active.inputValue();
  expect(copyScenarioId).not.toBe(sourceScenarioId);
  await expect(page.locator(`.transaction-phase-hit-target[data-phase-id="${sourcePhaseId}"]`)).toHaveCount(0);
  // Identify the copied Address Phase by its semantic accessible name, not
  // creation order or viewport position. Its stable ID is then the locator.
  const copiedAddress = page.getByRole("button", { name: "Read_0, phase Address, cycles 10 to 20", exact: true });
  await expect(copiedAddress).toHaveCount(1);
  const copyPhaseId = await copiedAddress.getAttribute("data-phase-id");
  expect(copyPhaseId).toBeTruthy();
  expect(copyPhaseId).not.toBe(sourcePhaseId);
  await expect(copiedAddress).toHaveAttribute("aria-pressed", "false");
  await copiedAddress.click();
  await expect(copiedAddress).toHaveAttribute("aria-pressed", "true");
  const revision = await page.getByTestId("revision-status").textContent();
  const history = await page.getByTestId("history-status").textContent();
  const dirty = await page.getByTestId("dirty-status").textContent();
  await active.selectOption(sourceScenarioId);
  await expect(page.locator(`.transaction-phase-hit-target[data-phase-id="${copyPhaseId}"]`)).toHaveCount(0);
  await expect(sourcePhase).toHaveAttribute("aria-pressed", "false");
  await active.selectOption(copyScenarioId);
  await expect(page.locator(`.transaction-phase-hit-target[data-phase-id="${sourcePhaseId}"]`)).toHaveCount(0);
  await expect(page.getByTestId("revision-status")).toHaveText(revision!);
  await expect(page.getByTestId("history-status")).toHaveText(history!);
  await expect(page.getByTestId("dirty-status")).toHaveText(dirty!);
});

test("Phase deletion Undo/Redo prunes only the missing Phase selection", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");
  await openTransactionSample(page);
  const phase = page.getByRole("button", { name: "Read_0, phase Address, cycles 10 to 20", exact: true });
  await expect(phase).toBeVisible();
  const phaseId = await phase.getAttribute("data-phase-id");
  expect(phaseId).toBeTruthy();
  await phase.click();
  await expect(phase).toHaveAttribute("aria-pressed", "true");

  const inspector = page.getByTestId("inspector");
  await inspector.getByLabel("Delete phase 1").click();
  await inspector.getByTestId("apply-inspector-transaction").click();
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  const phaseById = page.locator(`.transaction-phase-hit-target[data-phase-id='${phaseId}']`);
  await expect(phaseById).toHaveCount(0);
  await expect(page.getByTestId("selection-status")).toHaveText("Read_0");

  await page.getByTestId("ribbon").getByRole("button", { name: "Undo", exact: true }).click();
  await expect(phaseById).toHaveCount(1);
  // Undo restores the selected stable Phase ID, so its decoration should return
  // with the same canonical entity rather than being dropped on history replay.
  await expect(phaseById).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("selection-status")).toHaveText("Read_0");

  await page.getByTestId("ribbon").getByRole("button", { name: "Redo", exact: true }).click();
  await expect(phaseById).toHaveCount(0);
  await expect(page.getByTestId("selection-status")).toHaveText("Read_0");

  // Redo removes the selected Phase; history repair must clear that now-stale
  // ID, so a later Undo restores the Phase without resurrecting its selection.
  await page.getByTestId("ribbon").getByRole("button", { name: "Undo", exact: true }).click();
  await expect(phaseById).toHaveCount(1);
  await expect(phaseById).toHaveAttribute("aria-pressed", "false");
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
