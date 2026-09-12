import { expect, test } from "@playwright/test";

// Transaction Mode GUI realignment: `.frozen-pane-resize-handle` exists to
// split Cycle Mode's frozen Role/Signal-name columns from the waveform
// canvas. It used to render unconditionally in every view mode -- in
// Transaction Mode there is no such column split (the Tree is one unified
// panel; "Group"/"Transaction" are header labels only, not two
// independently-resizable body columns), so its full-height hit target
// landed inside the Transaction Tree's own content with nothing meaningful
// to resize -- reported as a stray vertical line bleeding through the
// Tree. It must stay gone in Transaction Mode and Split Mode, and stay
// exactly as before in Cycle Mode.

test("the Cycle-only frozen-pane splitter is absent in Transaction Mode and reappears in Cycle Mode", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  // Normal startup opens the built-in Transaction sample; this test covers
  // the Cycle-only splitter explicitly after entering Cycle mode.
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();

  await expect(page.getByTestId("frozen-pane-resizer")).toBeVisible();

  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  await expect(page.getByTestId("frozen-pane-resizer")).toHaveCount(0);
  // The Left Tree panel's own splitter is unaffected -- only the
  // Cycle-specific inner one is gone.
  await expect(page.getByTestId("left-pane-resizer")).toBeVisible();

  await page.locator(".view-mode").getByRole("button", { name: "Split", exact: true }).click();
  await expect(page.getByTestId("frozen-pane-resizer")).toHaveCount(0);

  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  await expect(page.getByTestId("frozen-pane-resizer")).toBeVisible();
});
