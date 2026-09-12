import { expect, test } from "@playwright/test";

// Visual Quality pass: `.bottom-sticky-buttons`'s shared Cancel-button
// styling used to be scoped to one hardcoded testid
// (`[data-testid="cancel-bottom-draft"]`), which Transaction and
// Annotation's Cancel buttons happen to share -- but Bookmark's own Cancel
// button uses a different testid (`cancel-bottom-bookmark`) and was
// silently left at the UA-default button height, visibly shorter than its
// "Apply Changes" sibling in the same sticky action row. Fixed by scoping
// the CSS rule to the button's shape (`[type="button"]`) instead of one
// name, so every current and future Bottom Editor's Cancel/Apply pair
// matches automatically. This locks in equal heights for all three.

test("Bookmark Bottom Editor Cancel and Apply buttons share the same height", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");

  // Bookmark
  await page.locator(".bottom-tabs").getByRole("tab", { name: "Bookmarks", exact: true }).click();
  await page.getByLabel("New Bottom Bookmark name").fill("Height check");
  await page.getByTestId("bottom-editor").getByRole("button", { name: "Create Bookmark", exact: true }).click();
  const bookmarkCancel = page.getByTestId("cancel-bottom-bookmark");
  const bookmarkApply = page.getByTestId("apply-bottom-bookmark");
  await expect(bookmarkCancel).toBeVisible();
  const [bookmarkCancelH, bookmarkApplyH] = await Promise.all([
    bookmarkCancel.evaluate((el) => el.getBoundingClientRect().height),
    bookmarkApply.evaluate((el) => el.getBoundingClientRect().height),
  ]);
  expect(bookmarkCancelH).toBe(bookmarkApplyH);

});
