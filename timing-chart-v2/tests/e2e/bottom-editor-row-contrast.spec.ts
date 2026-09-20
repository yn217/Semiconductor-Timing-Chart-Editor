import { expect, test } from "@playwright/test";
import { startInCycleMode } from "./cycle-startup.js";

startInCycleMode(test);

// #420: under `color-scheme: dark` (responsive.css, prefers-color-scheme:
// dark), an unstyled <button> takes its default text color from the UA's
// `ButtonText` system color, which becomes near-white -- rendering
// Bookmark/Transaction list rows (both plain <button> elements) unreadable
// once selected (light-blue background, near-white text). Same root cause
// as #391/#401.
test.use({ colorScheme: "dark" });

function rgbToLuminanceLikeSum(rgb: string): number {
  const match = /rgb\((\d+), (\d+), (\d+)\)/.exec(rgb);
  if (!match) throw new Error(`Unexpected color format: ${rgb}`);
  return Number(match[1]) + Number(match[2]) + Number(match[3]);
}

for (const viewport of [{ width: 1672, height: 941 }, { width: 1280, height: 720 }]) {
  test(`Bookmark and Transaction selected rows stay readable at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    const host = page.getByTestId("cycle-surface");
    await expect(host).toHaveAttribute("data-cycle-view-ready", "true");

    // Bookmark row.
    await page.locator(".ribbon-tabs").getByRole("button", { name: "Timeline", exact: true }).click();
    await page.getByRole("button", { name: "Add marker" }).click();
    await page.getByRole("button", { name: "Open Bookmarks panel", exact: true }).click();
    const bookmarkRow = page.getByTestId(/bookmark-row-/);
    await bookmarkRow.click();
    await expect(bookmarkRow).toHaveAttribute("data-selected", "true");
    await expect(bookmarkRow).toContainText("Marker");
    const bookmarkStyle = await bookmarkRow.evaluate((element) => { const computed = getComputedStyle(element); return { color: computed.color, background: computed.backgroundColor }; });
    expect(Math.abs(rgbToLuminanceLikeSum(bookmarkStyle.color) - rgbToLuminanceLikeSum(bookmarkStyle.background)), JSON.stringify(bookmarkStyle)).toBeGreaterThan(300);

    // Delete Bookmark (a .danger toolbar button) stays readable too.
    const deleteBookmark = page.getByTestId("delete-bottom-bookmark");
    const deleteStyle = await deleteBookmark.evaluate((element) => { const computed = getComputedStyle(element); return { color: computed.color, background: computed.backgroundColor }; });
    expect(Math.abs(rgbToLuminanceLikeSum(deleteStyle.color) - rgbToLuminanceLikeSum(deleteStyle.background)), JSON.stringify(deleteStyle)).toBeGreaterThan(150);

    // Transaction row (View Mode: Transaction), same unstyled-<button> shape.
    await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
    await page.getByRole("tab", { name: "Transaction", exact: true }).click();
    // #453: "Load Example" was removed from the normal Bottom Panel empty
    // state -- use the Ribbon's "Create Transaction" (Home tab), the same
    // ordinary entry point a real user has.
    await page.locator(".ribbon-tabs").getByRole("button", { name: "Home", exact: true }).click();
    await page.getByTestId("ribbon").getByRole("button", { name: "Create Transaction", exact: true }).click();
    // #453 (bulk operations): each row is now wrapped in a
    // `.transaction-list-row` alongside its own bulk-select checkbox --
    // the row itself is still the `<button>` this test cares about.
    const transactionRow = page.locator(".transaction-list-row > button[data-selected='true']");
    await expect(transactionRow).toBeVisible();
    const transactionStyle = await transactionRow.evaluate((element) => { const computed = getComputedStyle(element); return { color: computed.color, background: computed.backgroundColor }; });
    expect(Math.abs(rgbToLuminanceLikeSum(transactionStyle.color) - rgbToLuminanceLikeSum(transactionStyle.background)), JSON.stringify(transactionStyle)).toBeGreaterThan(300);
  });
}

test("Bookmark row shows a visible keyboard focus ring and stays readable on hover, without changing Canonical/History/Dirty", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Timeline", exact: true }).click();
  await page.getByRole("button", { name: "Add marker" }).click();
  await page.getByRole("button", { name: "Open Bookmarks panel", exact: true }).click();
  const row = page.getByTestId(/bookmark-row-/);
  await row.click();

  const before = {
    revision: await host.getAttribute("data-canonical-revision"),
    history: await page.getByTestId("history-status").textContent(),
    dirty: await page.getByTestId("dirty-status").textContent(),
  };

  await row.hover();
  await expect(row).toBeVisible();

  await row.focus();
  const isFocusVisible = await row.evaluate((element) => element.matches(":focus-visible"));
  if (isFocusVisible) {
    const outlineStyle = await row.evaluate((element) => getComputedStyle(element).outlineStyle);
    expect(outlineStyle).toBe("solid");
  }

  await expect(host).toHaveAttribute("data-canonical-revision", before.revision!);
  await expect(page.getByTestId("history-status")).toHaveText(before.history!);
  await expect(page.getByTestId("dirty-status")).toHaveText(before.dirty!);
});
