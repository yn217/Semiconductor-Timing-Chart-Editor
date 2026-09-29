import { expect, test } from "@playwright/test";
import { startInCycleSample } from "./cycle-startup.js";

// Written against the plain Cycle sample (no demo Bookmarks); the product default document is the Transaction demo.
startInCycleSample(test);

// #772 Failure B: an unapplied Bookmark Name/Cycle/Comment draft must not be silently destroyed by selecting another Bookmark row --
// it is kept under the original stable Bookmark ID and announced, mirroring #763's Transaction Phase draft policy.
test("switching Bookmark selection keeps an unapplied draft, announced, until Apply or explicit Discard", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Timeline", exact: true }).click();
  for (const start of [3, 10]) {
    // End first: raising Start past the previous End would otherwise be rejected and both markers would land on the old range.
    await page.getByLabel("Timeline range end").fill(String(start + 1));
    await page.getByLabel("Timeline range start").fill(String(start));
    await page.getByRole("button", { name: "Add marker" }).click();
  }
  await page.getByRole("button", { name: "Open Bookmarks panel", exact: true }).click();
  const panel = page.getByTestId("bookmark-editor-panel");
  await expect(panel).toBeVisible();
  const history = await page.getByTestId("history-status").innerText();
  const revision = await page.getByTestId("cycle-surface").getAttribute("data-canonical-revision");

  const rows = panel.getByTestId(/bookmark-row-/);
  await rows.nth(0).click();
  const nameField = panel.getByLabel("Bottom Bookmark name");
  await nameField.fill("DRAFT_A");
  await expect(panel.getByTestId("bottom-bookmark-unapplied")).toBeVisible();
  await expect(panel.getByTestId("bottom-bookmark-unapplied")).not.toContainText("kept from earlier");
  await expect(panel.getByTestId("bookmark-retained-drafts")).toHaveCount(0);

  // Switch: the draft is kept and announced instead of vanishing silently.
  await rows.nth(1).click();
  await expect(panel.getByTestId("bookmark-retained-drafts")).toBeVisible();
  expect(await history === (await page.getByTestId("history-status").innerText())).toBe(true);

  // Return: the same draft is back, marked as kept from earlier.
  await rows.nth(0).click();
  await expect(nameField).toHaveValue("DRAFT_A");
  await expect(panel.getByTestId("bottom-bookmark-unapplied")).toContainText("kept from earlier");

  // Explicit Discard from the other row restores canonical values exactly.
  await rows.nth(1).click();
  await panel.getByRole("button", { name: /Discard the unapplied draft/ }).click();
  await expect(panel.getByTestId("bookmark-retained-drafts")).toHaveCount(0);
  await rows.nth(0).click();
  await expect(nameField).not.toHaveValue("DRAFT_A");
  await expect(panel.getByTestId("bottom-bookmark-unapplied")).toHaveCount(0);

  await expect(page.getByTestId("history-status")).toHaveText(history);
  expect(await page.getByTestId("cycle-surface").getAttribute("data-canonical-revision")).toBe(revision);
  expect(errors).toEqual([]);
});

test("Bookmark Bottom Pin follows the pinned stable ID and deletes the displayed Bookmark", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Timeline", exact: true }).click();
  for (const start of [3, 10]) {
    // End first: raising Start past the previous End would otherwise be rejected and both markers would land on the old range.
    await page.getByLabel("Timeline range end").fill(String(start + 1));
    await page.getByLabel("Timeline range start").fill(String(start));
    await page.getByRole("button", { name: "Add marker" }).click();
  }
  await page.getByRole("button", { name: "Open Bookmarks panel", exact: true }).click();
  const panel = page.getByTestId("bookmark-editor-panel");
  const rows = panel.getByTestId(/bookmark-row-/);
  await expect(rows).toHaveCount(2);
  await rows.nth(0).click();
  const firstName = await panel.locator("header strong").innerText();
  expect(firstName).toContain("Editing:");
  const revision = await page.getByTestId("cycle-surface").getAttribute("data-canonical-revision");
  const history = await page.getByTestId("history-status").innerText();

  await page.getByTestId("bottom-settings").click();
  await page.getByTestId("bottom-pin").click();
  await expect(page.getByTestId("bottom-pin")).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("bottom-settings").click();
  await rows.nth(1).click();
  await expect(panel.locator("header strong")).toHaveText(firstName);
  expect(await page.getByTestId("cycle-surface").getAttribute("data-canonical-revision")).toBe(revision);
  expect(await page.getByTestId("history-status").innerText()).toBe(history);

  await panel.getByTestId("delete-bottom-bookmark").click();
  await expect(rows).toHaveCount(1);
  await expect(panel.locator("header strong")).not.toHaveText(firstName);
  await expect(panel).toContainText("Editing:");
  expect(await page.getByTestId("cycle-surface").getAttribute("data-canonical-revision")).not.toBe(revision);
});
