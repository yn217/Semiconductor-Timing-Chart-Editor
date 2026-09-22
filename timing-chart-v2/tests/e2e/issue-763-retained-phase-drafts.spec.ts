import { expect, test, type Page } from "@playwright/test";

// #763: an unapplied Phase draft is never invisible. Switching Transactions keeps the draft under its stable Transaction ID and announces it
// (Inspector shows it while another Transaction is selected); returning marks it as kept on BOTH Bottom and Inspector (one shared store);
// Discard clears it; History/Canonical are never touched.
const openPhases = (page: Page) => page.locator(".bottom-tabs").getByRole("tab", { name: "Phases", exact: true }).click();
for (const viewport of [{ width: 1672, height: 941 }, { width: 1280, height: 720 }]) {
  test(`retained Phase drafts are explicit at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize(viewport);
    await page.goto("/?transaction-demo");
    await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
    await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
    const history = () => page.getByTestId("history-status").innerText();
    const revision = () => page.getByTestId("cycle-surface").getAttribute("data-canonical-revision");
    const h0 = await history(); const r0 = await revision();
    const bottom = page.getByTestId("transaction-bottom-phases");
    const inspector = page.getByTestId("inspector-phase-editor");
    const read = page.getByTestId("transaction-left-tree-row-demo_txn_read");
    const write = page.getByTestId("transaction-left-tree-row-demo_txn_write");

    await read.click();
    await openPhases(page);
    await bottom.getByLabel("Bottom Phase 1 name").fill("DRAFT_A");
    await expect(bottom.getByTestId("transaction-bottom-phases-unapplied")).toHaveAttribute("data-retained", "false");
    await expect(page.getByTestId("transaction-retained-drafts")).toHaveCount(0);

    // Switch: the draft is kept and announced instead of vanishing silently.
    await write.click();
    await expect(page.getByTestId("transaction-retained-drafts")).toContainText("Read_0");
    expect(await history()).toBe(h0);

    // Return: the same draft is back and marked as kept - on Bottom and on the Inspector (same store, same state).
    await read.click();
    await openPhases(page);
    await expect(bottom.getByLabel("Bottom Phase 1 name")).toHaveValue("DRAFT_A");
    await expect(bottom.getByTestId("transaction-bottom-phases-unapplied")).toHaveAttribute("data-retained", "true");
    await expect(bottom.getByTestId("transaction-bottom-phases-unapplied")).toContainText("kept from earlier");
    await expect(inspector.getByTestId("transaction-bottom-phases-unapplied")).toBeVisible();

    // Explicit Discard from another Transaction restores canonical values exactly.
    await write.click();
    await page.getByRole("button", { name: "Discard the unapplied Phase draft for Read_0" }).click();
    await expect(page.getByTestId("transaction-retained-drafts")).toHaveCount(0);
    await read.click();
    await openPhases(page);
    await expect(bottom.getByLabel("Bottom Phase 1 name")).not.toHaveValue("DRAFT_A");
    await expect(bottom.getByTestId("transaction-bottom-phases-unapplied")).toHaveCount(0);

    // Retained drafts never fabricate History / Canonical changes.
    expect(await history()).toBe(h0);
    expect(await revision()).toBe(r0);
    expect(errors).toEqual([]);
  });
}

test("opening another document drops every retained Phase draft", async ({ page }) => {
  await page.goto("/?transaction-demo");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  await page.getByTestId("transaction-left-tree-row-demo_txn_read").click();
  await openPhases(page);
  await page.getByTestId("transaction-bottom-phases").getByLabel("Bottom Phase 1 name").fill("DRAFT_A");
  await page.getByTestId("transaction-left-tree-row-demo_txn_write").click();
  await expect(page.getByTestId("transaction-retained-drafts")).toContainText("Read_0");
  // Reload the same demo through Open (same Transaction IDs and Phases): the retained draft must not carry over.
  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "New", exact: true }).click();
  const discard = page.getByTestId("unsaved-discard");
  if (await discard.isVisible().catch(() => false)) await discard.click();
  await expect(page.getByTestId("transaction-retained-drafts")).toHaveCount(0);
});
