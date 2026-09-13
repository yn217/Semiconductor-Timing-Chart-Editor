import { expect, test } from "@playwright/test";

// #578: SignalEditor's remount key included the whole-document `revision`,
// so ANY canonical mutation anywhere -- not just edits to the open Signal --
// force-remounted the Bottom Signal editor and silently erased whatever the
// user was mid-typing into the Add/Edit Transition form. Verifies the
// documented contract instead: a dirty, uncommitted draft on one Signal
// survives an unrelated canonical edit to a different Signal, and the
// editor's own live display of the open Signal's data never goes stale.
test("Signal Editor's in-progress Add/Edit Transition draft survives an unrelated canonical edit", async ({ page }) => {
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();

  await page.getByRole("treeitem", { name: /REQUEST/ }).first().click();
  await page.getByRole("tab", { name: "Signal", exact: true }).click();

  const startInput = page.getByLabel("New event start");
  const commentInput = page.getByLabel("New event comment");
  await startInput.fill("7");
  await commentInput.fill("dirty draft comment");

  // An unrelated canonical edit: toggle visibility on a different Signal.
  // This bumps the document's canonical revision without touching REQUEST.
  await page.getByRole("button", { name: "Hide READY", exact: true }).click();

  await expect(page.locator("text=/Selected:/")).toHaveText("Selected: REQUEST");
  await expect(startInput).toHaveValue("7");
  await expect(commentInput).toHaveValue("dirty draft comment");
  await expect(page.locator(".editor-selection")).toHaveText("REQUEST · Signal");

  // Cancel still explicitly discards the draft as before.
  await page.getByTestId("cancel-bottom-draft").click();
  await expect(startInput).toHaveValue("0");
  await expect(commentInput).toHaveValue("");
});
