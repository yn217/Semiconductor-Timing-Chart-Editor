import { expect, test } from "@playwright/test";
import { startInCycleSample } from "./cycle-startup.js";

startInCycleSample(test);

// #426: the Inspector Bookmark draft must follow the shared external-update contract (Legend/Annotation): a same-Bookmark Canonical
// update rebases clean fields and preserves a dirty unrelated local draft; the same field edited locally AND externally is an
// explicit conflict with Reload / Keep actions.
test("Inspector Bookmark keeps a dirty Name draft when Start changes externally, and flags a same-field conflict", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Timeline", exact: true }).click();
  await page.getByLabel("Timeline range start").fill("3");
  await page.getByLabel("Timeline range end").fill("4");
  await page.getByRole("button", { name: "Add marker" }).click();
  await page.getByRole("button", { name: "Open Bookmarks panel", exact: true }).click();
  const panel = page.getByTestId("bookmark-editor-panel");
  await panel.getByTestId(/bookmark-row-/).first().click();

  const inspector = page.getByTestId("inspector");
  const name = inspector.getByLabel("Inspector bookmark name");
  const cycle = inspector.getByLabel("Inspector bookmark cycle");
  await expect(name).toBeVisible();
  const originalCycle = await cycle.inputValue();
  await name.fill("LOCAL_DRAFT");

  // External update of Start through the Bottom editor (a Canonical bookmark.update on the SAME Bookmark id).
  await panel.getByLabel("Bottom Bookmark cycle").fill("9");
  await panel.getByTestId("apply-bottom-bookmark").click();
  await expect(cycle).toHaveValue("9");
  expect(originalCycle).not.toBe("9");
  await expect(name, "the unapplied Name draft must survive the external Start update").toHaveValue("LOCAL_DRAFT");
  await expect(inspector.getByTestId("bookmark-draft-conflict")).toHaveCount(0);

  // Same field edited locally and externally -> explicit conflict, Apply blocked until resolved.
  await cycle.fill("12");
  await panel.getByLabel("Bottom Bookmark cycle").fill("15");
  await panel.getByTestId("apply-bottom-bookmark").click();
  await expect(inspector.getByTestId("bookmark-draft-conflict")).toBeVisible();
  await expect(inspector.getByTestId("apply-inspector-bookmark")).toBeDisabled();
  await inspector.getByRole("button", { name: "Reload latest" }).click();
  await expect(cycle).toHaveValue("15");
  await expect(inspector.getByTestId("bookmark-draft-conflict")).toHaveCount(0);
});

test("Bottom Bookmark draft rebases unrelated Inspector updates and requires a choice for same-field conflicts", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Timeline", exact: true }).click();
  await page.getByLabel("Timeline range start").fill("3");
  await page.getByLabel("Timeline range end").fill("4");
  await page.getByRole("button", { name: "Add marker" }).click();
  const panel = page.getByTestId("bookmark-editor-panel");
  await panel.getByTestId(/bookmark-row-/).first().click();
  const inspector = page.getByTestId("inspector");
  const bottomName = panel.getByLabel("Bottom Bookmark name");
  const inspectorName = inspector.getByLabel("Inspector bookmark name");
  const bottomCycle = panel.getByLabel("Bottom Bookmark cycle");
  const inspectorCycle = inspector.getByLabel("Inspector bookmark cycle");

  await bottomName.fill("local bottom name");
  await inspectorCycle.fill("9");
  await inspector.getByTestId("apply-inspector-bookmark").click();
  await expect(bottomCycle).toHaveValue("9");
  await expect(bottomName).toHaveValue("local bottom name");
  await expect(panel.getByTestId("bottom-bookmark-draft-conflict")).toHaveCount(0);

  await inspectorName.fill("external inspector name");
  await inspector.getByTestId("apply-inspector-bookmark").click();
  await expect(panel.getByTestId("bottom-bookmark-draft-conflict")).toBeVisible();
  await expect(bottomName).toHaveValue("local bottom name");
  await expect(panel.getByTestId("apply-bottom-bookmark")).toBeDisabled();
  await panel.getByRole("button", { name: "Keep my draft" }).click();
  await expect(panel.getByTestId("bottom-bookmark-draft-conflict")).toHaveCount(0);
  await expect(panel.getByTestId("apply-bottom-bookmark")).toBeEnabled();
  await panel.getByTestId("apply-bottom-bookmark").click();
  await expect(inspectorName).toHaveValue("local bottom name");
});
