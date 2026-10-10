import { expect, test } from "@playwright/test";
import { startInCycleMode } from "./cycle-startup.js";

startInCycleMode(test);

// #426/#431 item 3 ("Apply/Cancel乱立の整理"): Comment Row's Line Spacing
// field used to dispatch `commands.updateCommentRow` directly from its own
// onChange -- a fresh Semantic Command (and History entry) on every
// keystroke of a number input, unlike every other field on this same
// entity (Title/Body/Spacing Before/After), which already held local draft
// state committed only via the shared Apply button. This verifies Line
// Spacing now follows the same draft/Apply/Cancel contract: typing produces
// zero History delta until Apply, Apply commits everything as one entry,
// and Cancel discards the draft back to the committed value.
test("Comment Row Line Spacing follows the same Draft -> Apply contract as Title/Body (no per-keystroke History entries)", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Insert", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Comment", exact: true }).click();
  await page.getByTestId("cycle-viewport").evaluate((element) => { element.scrollTop = element.scrollHeight; });
  const commentRow = host.locator("[data-role='left-row'][data-kind='comment'][data-row-id]");
  await commentRow.click();

  const editor = page.getByTestId("comment-row-editor");
  await expect(editor).toBeVisible();
  const historyAfterCreate = await page.getByTestId("history-status").textContent();

  const lineHeight = editor.getByLabel("Comment Row line spacing");
  await lineHeight.fill("2");
  // Draft typing must not touch History -- the historical bug committed a
  // real Semantic Command on every keystroke here.
  await expect(page.getByTestId("history-status")).toHaveText(historyAfterCreate!);
  await expect(editor.getByTestId("comment-row-unapplied")).toBeVisible();
  await expect(editor.getByTestId("apply-comment-row")).toBeEnabled();

  await editor.getByTestId("apply-comment-row").click();
  await expect(page.getByTestId("history-status")).not.toHaveText(historyAfterCreate!);
  await expect(editor.getByTestId("apply-comment-row")).toBeDisabled();

  // Cancel discards an in-progress draft back to the committed value.
  await lineHeight.fill("2.8");
  await expect(editor.getByTestId("comment-row-unapplied")).toBeVisible();
  const historyAfterApply = await page.getByTestId("history-status").textContent();
  await editor.getByTestId("cancel-bottom-draft").click();
  await expect(page.getByTestId("history-status")).toHaveText(historyAfterApply!);
});

test("an empty or out-of-range Comment Row spacing is a draft problem that disables Apply", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Insert", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Comment", exact: true }).click();
  await page.getByTestId("cycle-viewport").evaluate((element) => { element.scrollTop = element.scrollHeight; });
  await host.locator("[data-role='left-row'][data-kind='comment'][data-row-id]").click();
  const editor = page.getByTestId("comment-row-editor");
  const history = await page.getByTestId("history-status").textContent();
  await editor.getByLabel("Comment Row line spacing").fill("");
  await expect(editor.getByTestId("comment-row-draft-problem")).toBeVisible();
  await expect(editor.getByTestId("apply-comment-row")).toBeDisabled();
  await editor.getByLabel("Comment Row line spacing").fill("5");
  await expect(editor.getByTestId("apply-comment-row")).toBeDisabled();
  await editor.getByLabel("Comment Row line spacing").fill("2");
  await editor.getByLabel("Comment Row spacing before").fill("");
  await expect(editor.getByTestId("apply-comment-row")).toBeDisabled();
  await expect(page.getByTestId("history-status")).toHaveText(history!);
});
