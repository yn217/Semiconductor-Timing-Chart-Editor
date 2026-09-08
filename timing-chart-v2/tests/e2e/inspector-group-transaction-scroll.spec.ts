import { expect, test } from "@playwright/test";

// #426 Visual Quality Closure ("clipping" / "scrollbar/panel collision"):
// the Group and Transaction Inspector variants (packages/editor's
// InspectorPanel, distinct from the value-Signal/Annotation/Bookmark
// editors, which already wrap in a top-level <form>) rendered their
// sections as direct children of `.inspector` with no scroll wrapper.
// `.inspector`'s own `overflow: hidden` then silently clipped anything
// past the panel's visible height with NO way to reach it -- confirmed via
// measurement before this fix: Transaction Inspector's own "Delete
// Transaction" button sat ~270px below the clipped edge at 1280x720,
// completely unreachable (not just visually cut off -- literally
// unclickable, since there was no scrollbar). Fixed by wrapping both in
// `.inspector-scroll`, the exact same utility class
// inspector-clock-editor.tsx already established for this identical shape.

test("Group and Transaction Inspector content is reachable by scroll, with Apply/Revert/Delete never clipped", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");

  // Group Inspector
  await page.getByLabel("Select Control group").click();
  const inspector = page.getByTestId("inspector");
  const groupScroll = inspector.locator(".inspector-scroll");
  await expect(groupScroll).toBeVisible();
  const groupOverflow = await groupScroll.evaluate((el) => el.scrollHeight - el.clientHeight);
  expect(groupOverflow).toBeGreaterThan(0); // this Inspector genuinely needs to scroll at 1280x720
  await inspector.getByTestId("apply-group-properties").scrollIntoViewIfNeeded();
  await expect(inspector.getByTestId("apply-group-properties")).toBeVisible();

  // Transaction Inspector
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Create Transaction", exact: true }).click();
  const txnScroll = inspector.locator(".inspector-scroll");
  await expect(txnScroll).toBeVisible();
  const deleteBtn = inspector.getByRole("button", { name: "Delete Transaction", exact: true });
  // Reachable via real scroll (not just DOM-present) -- Playwright's own
  // actionability check requires the target to be in the viewport and
  // not clipped by a non-scrolling ancestor before it will click.
  await deleteBtn.scrollIntoViewIfNeeded();
  await expect(deleteBtn).toBeInViewport();
  await expect(inspector.getByTestId("apply-inspector-transaction")).toBeInViewport();
});
