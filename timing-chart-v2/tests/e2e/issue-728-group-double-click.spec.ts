import { expect, test } from "@playwright/test";
import { documentState, expectViewOnly } from "./view-only.js";

test("double-clicking a Transaction Group header toggles it and does not start rename", async ({ page }) => {
  await page.goto("/?transaction-demo");
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  const group = page.getByTestId("transaction-left-tree").locator('[data-transaction-group-id="demo_tgrp_memory"]');
  const header = group.locator(".transaction-left-tree-group-header");
  const rows = group.locator(".transaction-left-tree-row");
  const before = await rows.count();
  expect(before).toBeGreaterThan(0);
  const viewOnlyBefore = await documentState(page);
  const revision = await page.getByTestId("cycle-surface").getAttribute("data-canonical-revision");
  await header.dblclick({ position: { x: 90, y: 12 } });
  await expect(rows).toHaveCount(0);
  await expect(group.locator("input")).toHaveCount(0);
  await header.dblclick({ position: { x: 90, y: 12 } });
  await expect(rows).toHaveCount(before);
  await expectViewOnly(page, viewOnlyBefore);
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-canonical-revision", revision!);
});
