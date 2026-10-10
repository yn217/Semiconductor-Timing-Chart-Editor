import { expect, test } from "@playwright/test";
import { canonicalFixture } from "../fixtures/canonical.js";

// #422: Bottom Bookmarks panel gets its own Previous/Next (sharing the
// exact same resolver as the Timeline Ribbon's Previous/Next, never a
// second Bottom-only algorithm), plus explicit Draft -> Apply Changes: the
// Apply button stays disabled until the draft actually differs from the
// selected Bookmark, and typing never touches Canonical/History/Dirty.

async function openBookmarkFixture(page: import("@playwright/test").Page, bookmarks: readonly { id: string; name: string; start: number; comment: string }[]): Promise<void> {
  const document = canonicalFixture();
  document.timeline.end = 20;
  document.timeline.cycleCount = 20;
  document.bookmarks = bookmarks;
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({
    name: "bookmark-navigation.tcd",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(document)),
  });
  const discard = page.getByTestId("unsaved-discard");
  if (await discard.isVisible().catch(() => false)) await discard.click();
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true");
}

test("Bottom Bookmarks Previous/Next navigate relative to the selected Bookmark, sharing the Ribbon's own resolver, view-only", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");

  await openBookmarkFixture(page, [
    { id: "bm_three", name: "Three", start: 3, comment: "" },
    { id: "bm_ten", name: "Ten", start: 10, comment: "" },
    { id: "bm_sixteen", name: "Sixteen", start: 16, comment: "" },
  ]);
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Timeline", exact: true }).click();
  await page.getByRole("button", { name: "Open Bookmarks panel", exact: true }).click();

  const panel = page.getByTestId("bookmark-editor-panel");
  const rows = panel.locator("[data-testid^='bookmark-row-']");
  // Select the middle Bookmark (cycle 10) explicitly.
  await rows.filter({ hasText: "10" }).first().click();
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

  await openBookmarkFixture(page, [{ id: "bm_five", name: "Five", start: 5, comment: "" }]);
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Timeline", exact: true }).click();
  await page.getByRole("button", { name: "Open Bookmarks panel", exact: true }).click();
  const panel = page.getByTestId("bookmark-editor-panel");
  await panel.locator("[data-testid^='bookmark-row-']").filter({ hasText: "5" }).first().click();

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
  await expect(panel.getByLabel("Bottom Bookmark name")).toHaveValue("Five");
  await expect(panel.getByTestId("apply-bottom-bookmark")).toBeDisabled();
  await expect(host).toHaveAttribute("data-canonical-revision", before.revision!);

  await panel.getByLabel("Bottom Bookmark name").fill("Renamed Marker");
  await applyButton.click();
  await expect(panel.locator("[data-testid^='bookmark-row-']")).toContainText("Renamed Marker");
  await expect(page.getByTestId("history-status")).not.toHaveText(before.history!);
  await expect(applyButton).toBeDisabled();
});

test("Bottom Bookmarks Next and Previous visit every Bookmark that shares a cycle", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await openBookmarkFixture(page, [
    { id: "bm_a", name: "Alpha", start: 4, comment: "" },
    { id: "bm_b", name: "Beta", start: 4, comment: "" },
    { id: "bm_c", name: "Gamma", start: 12, comment: "" },
  ]);
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Timeline", exact: true }).click();
  await page.getByRole("button", { name: "Open Bookmarks panel", exact: true }).click();
  const panel = page.getByTestId("bookmark-editor-panel");
  const name = panel.getByLabel("Bottom Bookmark name");
  await panel.locator("[data-testid^='bookmark-row-']").filter({ hasText: "Alpha" }).first().click();
  await expect(name).toHaveValue("Alpha");
  const visited: string[] = [];
  for (let step = 0; step < 3; step += 1) {
    await panel.getByLabel("Next bookmark", { exact: true }).click();
    await expect(name).not.toHaveValue(visited.at(-1) ?? "Alpha");
    visited.push(await name.inputValue());
  }
  expect(visited).toEqual(["Beta", "Gamma", "Alpha"]);
  await panel.getByLabel("Previous bookmark", { exact: true }).click();
  await expect(name).toHaveValue("Gamma");
  await panel.getByLabel("Previous bookmark", { exact: true }).click();
  await expect(name).toHaveValue("Beta");
});
