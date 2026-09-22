import { expect, test } from "@playwright/test";

// #775: Annotation Inspector sub-editors commit independently -- applying Anchor must not silently discard an unrelated, still-unapplied
// General (Label/Color) draft, and vice versa.
test("Apply Anchor does not discard an unapplied Label/Color draft", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  const host = page.getByTestId("cycle-surface");
  await host.locator("[data-role='frozen-row']").first().click();
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Annotation", exact: true }).click();
  await page.getByLabel("Annotation type").selectOption("text");
  await page.getByRole("button", { name: "Add annotation" }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  const inspector = page.getByTestId("annotation-editor");
  await expect(inspector).toBeVisible();
  const history = await page.getByTestId("history-status").innerText();

  // Dirty the General draft (do NOT apply it).
  const label = inspector.getByLabel("Annotation label").first();
  await label.fill("DRAFT_LABEL");

  // Commit an unrelated sub-editor (Anchor) -- a real Canonical change to the SAME Annotation.
  const cycleField = inspector.getByLabel("Anchor cycle");
  await cycleField.fill("5");
  await inspector.getByTestId("apply-inspector-annotation-anchor").click();
  await expect.poll(() => page.getByTestId("history-status").innerText()).not.toBe(history);

  // The unrelated Label draft must survive the Anchor commit.
  await expect(label).toHaveValue("DRAFT_LABEL");
});
