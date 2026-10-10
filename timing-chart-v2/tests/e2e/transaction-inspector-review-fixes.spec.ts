import { expect, test } from "@playwright/test";

// Code-review follow-up for the Transaction Inspector Apply path:
// 1. "Ungrouped" and "Use group color" must reach transaction.update as explicit clears
//    (they used to be silently dropped, so Apply was a no-op).
// 2. A pending Name/Description draft must not hide an external Start/End change
//    (timeline drag / Undo); Apply must never re-send a stale Start/End.
// 3. A pure Start/End shift of a phased Transaction must move its Phases with it
//    (mirrors transaction.move) instead of dead-ending on a Phase validation error.

async function openDemoTransaction(page: import("@playwright/test").Page) {
  await page.goto("/?transaction-demo");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  await page.locator('[data-transaction-row-id="demo_txn_read"]').click();
  return page.getByTestId("inspector");
}

test("Ungrouped in the Inspector really removes the Transaction from its Group", async ({ page }) => {
  const inspector = await openDemoTransaction(page);
  await expect(inspector.getByLabel("Transaction group")).toHaveValue("demo_tgrp_memory");
  await inspector.getByLabel("Transaction group").selectOption("");
  await inspector.getByTestId("apply-inspector-transaction").click();
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await expect(inspector.getByLabel("Transaction group")).toHaveValue("");
});

test("Use group color in the Inspector clears the Transaction's own colour override", async ({ page }) => {
  const inspector = await openDemoTransaction(page);
  const useGroupColor = inspector.getByTestId("transaction-use-group-color");
  await expect(useGroupColor).not.toBeChecked();
  await useGroupColor.check();
  await inspector.getByTestId("apply-inspector-transaction").click();
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await expect(inspector.getByTestId("transaction-use-group-color")).toBeChecked();
});

test("an external End change (Undo) is not hidden by a pending Name draft and is not re-sent by Apply", async ({ page }) => {
  const inspector = await openDemoTransaction(page);
  const end = inspector.getByLabel("Transaction end");
  const originalEnd = await end.inputValue();
  await end.fill(String(Number(originalEnd) + 1));
  await inspector.getByTestId("apply-inspector-transaction").click();
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");

  await inspector.getByLabel("Transaction name").fill("Pending name");
  await page.getByTestId("ribbon").getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 1");
  await expect(inspector.getByLabel("Transaction end")).toHaveValue(originalEnd);

  await inspector.getByTestId("apply-inspector-transaction").click();
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await expect(inspector.getByLabel("Transaction end")).toHaveValue(originalEnd);
  await expect(inspector.getByLabel("Transaction name")).toHaveValue("Pending name");
});

test("a pure Start/End shift of a phased Transaction moves its Phases instead of being rejected", async ({ page }) => {
  const inspector = await openDemoTransaction(page);
  const start = inspector.getByLabel("Transaction start");
  const end = inspector.getByLabel("Transaction end");
  const originalStart = await start.inputValue();
  const originalEnd = await end.inputValue();
  await start.fill(String(Number(originalStart) + 1));
  await end.fill(String(Number(originalEnd) + 1));
  await inspector.getByTestId("apply-inspector-transaction").click();
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await expect(inspector.getByRole("status")).toHaveCount(0);
  await expect(inspector.getByLabel("Transaction start")).toHaveValue(String(Number(originalStart) + 1));
  await expect(inspector.getByLabel("Phase 1 start")).toHaveValue(String(Number(originalStart) + 1));
});
