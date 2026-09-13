import { expect, test } from "@playwright/test";

// Combined Mode's left column must stack the same production Transaction
// Tree used in standalone Transaction Mode above the same production Cycle
// Signal Tree used in standalone Cycle Mode -- never a second tree
// implementation, never a per-Signal pane-assignment property. See the
// layout-reference mockup review: only the upper/lower stacking concept was
// adopted, not its icons/ruler/waveform rendering (all of which stay the
// existing production Cycle/Transaction surfaces).

test("Combined left panel stacks the production Transaction Tree above the production Cycle Signal Tree", async ({ page }) => {
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto("/?transaction-demo");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Combined", exact: true }).click();

  const tree = page.locator(".transaction-left-tree");
  await expect(tree).toBeVisible();
  await expect(tree).toContainText("Read_0");

  const firstFrozenRow = host.locator("[data-role='frozen-row']").first();
  await expect(firstFrozenRow).toBeVisible();

  const treeBox = await tree.boundingBox();
  const signalBox = await firstFrozenRow.boundingBox();
  expect(treeBox).not.toBeNull();
  expect(signalBox).not.toBeNull();
  // Upper (Transaction Tree) sits strictly above lower (Signal Tree): no
  // vertical overlap between the two stacked left-column regions.
  expect(treeBox!.y + treeBox!.height).toBeLessThanOrEqual(signalBox!.y + 1);
  // Both share the same left column width (left + frozen width combined).
  expect(Math.abs(treeBox!.width - signalBox!.width - 265)).toBeLessThan(2);

  // Selecting a Transaction from the new tree works exactly like standalone
  // Transaction Mode's own tree, and stays view-only.
  const beforeRevision = await host.getAttribute("data-canonical-revision");
  await tree.locator(".transaction-left-tree-row", { hasText: "Read_0" }).click();
  await expect(page.getByTestId("selection-status")).toContainText("Read_0");
  await expect(host).toHaveAttribute("data-canonical-revision", beforeRevision!);
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
});

test("standalone Transaction Mode and Cycle Mode are unaffected by the Combined left panel change", async ({ page }) => {
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto("/?transaction-demo");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");

  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  const standaloneTree = page.locator(".transaction-left-tree");
  await expect(standaloneTree).toBeVisible();
  const standaloneBox = await standaloneTree.boundingBox();
  // Standalone Transaction Mode keeps its own narrower left-width-only tree
  // (its own `.transaction-lane-labels` strip still owns the frozen-width
  // column beside it) -- Combined's wider left+frozen combined tree column
  // must not leak into this mode.
  expect(standaloneBox!.width).toBeLessThan(300);

  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  await expect(page.locator(".transaction-left-tree")).toHaveCount(0);
  await expect(host.locator("[data-role='frozen-row']").first()).toBeVisible();
});
