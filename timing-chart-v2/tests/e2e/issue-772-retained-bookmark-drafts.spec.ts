import { expect, test } from "@playwright/test";

// #772 Failure B: an unapplied Bookmark Name/Cycle/Comment draft must not be silently destroyed by selecting another Bookmark row --
// it is kept under the original stable Bookmark ID and announced, mirroring #763's Transaction Phase draft policy.
test("switching Bookmark selection keeps an unapplied draft, announced, until Apply or explicit Discard", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Timeline", exact: true }).click();
  for (const start of [3, 10]) {
    await page.getByLabel("Timeline range start").fill(String(start));
    await page.getByLabel("Timeline range end").fill(String(start + 1));
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
