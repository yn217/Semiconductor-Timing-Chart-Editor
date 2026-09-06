import { expect, test } from "@playwright/test";

// #422: Bottom Bookmarks panel gets its own Previous/Next (sharing the
// exact same resolver as the Timeline Ribbon's Previous/Next, never a
// second Bottom-only algorithm), plus explicit Draft -> Apply Changes: the
// Apply button stays disabled until the draft actually differs from the
// selected Bookmark, and typing never touches Canonical/History/Dirty.

async function addMarkerAt(page: import("@playwright/test").Page, cycleStart: number, cycleEnd: number): Promise<void> {
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Timeline", exact: true }).click();
  // Fill end before start: `setBoundary` clamps a new start to
  // `range.end - 1`, so filling start first against a stale (small) end
  // left over from a previous marker silently keeps the old start.
  await page.getByLabel("Timeline range end").fill(String(cycleEnd));
  await page.getByLabel("Timeline range start").fill(String(cycleStart));
  await page.getByRole("button", { name: "Add marker" }).click();
}

test("Bottom Bookmarks Previous/Next navigate relative to the selected Bookmark, sharing the Ribbon's own resolver, view-only", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");

  await addMarkerAt(page, 3, 4);
  await addMarkerAt(page, 10, 11);
  await addMarkerAt(page, 16, 17);
  await page.getByRole("button", { name: "Open Bookmarks panel", exact: true }).click();

  const panel = page.getByTestId("bookmark-editor-panel");
  const rows = panel.locator("[data-testid^='bookmark-row-']");
  await expect(rows).toHaveCount(3);
  // Select the middle Bookmark (cycle 10) explicitly.
  await rows.filter({ hasText: "10" }).click();
  await expect(panel.getByLabel("Bottom Bookmark cycle")).toHaveValue("10");

  const before = {
    revision: await host.getAttribute("data-canonical-revision"),
    history: await page.getByTestId("history-status").textContent(),
  };

  await panel.getByLabel("Next bookmark", { exact: true }).click();
  await expect(panel.getByLabel("Bottom Bookmark cycle")).toHaveValue("16");
  await panel.getByLabel("Previous bookmark", { exact: true }).click();
  await panel.getByLabel("Previous bookmark", { exact: true }).click();
  await expect(panel.getByLabel("Bottom Bookmark cycle")).toHaveValue("3");

  await expect(host).toHaveAttribute("data-canonical-revision", before.revision!);
  await expect(page.getByTestId("history-status")).toHaveText(before.history!);
});

test("Bottom Bookmark edit stays a Draft until Apply Changes; the button is disabled with no changes and Cancel discards the draft", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");

  await addMarkerAt(page, 5, 6);
  await page.getByRole("button", { name: "Open Bookmarks panel", exact: true }).click();
  const panel = page.getByTestId("bookmark-editor-panel");
  await panel.locator("[data-testid^='bookmark-row-']").click();

  const applyButton = panel.getByTestId("apply-bottom-bookmark");
  await expect(applyButton).toBeDisabled();
  await expect(panel.getByTestId("bottom-bookmark-unapplied")).toHaveCount(0);

  const before = {
    revision: await host.getAttribute("data-canonical-revision"),
    history: await page.getByTestId("history-status").textContent(),
  };
  await panel.getByLabel("Bottom Bookmark name").fill("Renamed Marker");
  // Draft only -- Canonical/History untouched while typing.
  await expect(host).toHaveAttribute("data-canonical-revision", before.revision!);
  await expect(page.getByTestId("history-status")).toHaveText(before.history!);
  await expect(applyButton).toBeEnabled();
  await expect(panel.getByTestId("bottom-bookmark-unapplied")).toBeVisible();

  await panel.getByTestId("cancel-bottom-bookmark").click();
  await expect(panel.getByLabel("Bottom Bookmark name")).toHaveValue(/Marker/);
  await expect(panel.getByTestId("apply-bottom-bookmark")).toBeDisabled();
  await expect(host).toHaveAttribute("data-canonical-revision", before.revision!);

  await panel.getByLabel("Bottom Bookmark name").fill("Renamed Marker");
  await applyButton.click();
  await expect(panel.locator("[data-testid^='bookmark-row-']")).toContainText("Renamed Marker");
  await expect(page.getByTestId("history-status")).not.toHaveText(before.history!);
  await expect(applyButton).toBeDisabled();
});
