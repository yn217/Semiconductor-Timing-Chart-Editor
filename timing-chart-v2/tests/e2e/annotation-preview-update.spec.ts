import { expect, test } from "@playwright/test";
import { annotationOwnerById, snapshotAnnotationIds, waitForCreatedAnnotationId } from "./annotation-identity.js";

// #332 item A: "Preview Update" must actually preview the draft
// Label/Color, not just bump a status counter -- with zero Canonical/
// History/Dirty delta while previewing, and the preview must revert to
// the real canonical rendering on Cancel or when selection moves away
// without an explicit Cancel.
test("Annotation Preview Update reflects draft Label/Color on the live overlay with zero Canonical delta, and reverts on Cancel", async ({ page }) => {
  await page.goto("/");
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Annotation", exact: true }).click();
  await page.getByLabel("Annotation type").selectOption("text");
  const previousIds = await snapshotAnnotationIds(host);
  await page.getByRole("button", { name: "Add annotation" }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");

  const owner = annotationOwnerById(host, await waitForCreatedAnnotationId(host, previousIds, "text"));
  const label = owner.locator("[data-role='annotation-label']");
  await expect(label).toHaveText("text 2");

  const editor = page.getByTestId("annotation-editor");
  await editor.getByLabel("Annotation label", { exact: true }).fill("PREVIEW LABEL");
  await editor.getByLabel("Annotation color").fill("#00cc44");

  const revisionBefore = await host.getAttribute("data-canonical-revision");
  const historyBefore = await page.getByTestId("history-status").textContent();

  await page.getByTestId("annotation-preview-action").click();
  await expect(label).toHaveText("PREVIEW LABEL");
  await expect(owner).toHaveAttribute("aria-label", "text: PREVIEW LABEL");
  await expect(owner).toHaveCSS("--annotation-color", "#00cc44");
  await expect(page.getByTestId("annotation-preview-status")).toContainText("canonical data unchanged");
  await expect(host).toHaveAttribute("data-canonical-revision", revisionBefore!);
  await expect(page.getByTestId("history-status")).toHaveText(historyBefore!);

  // Cancel reverts the preview back to the real canonical rendering.
  await page.getByTestId("cancel-inspector-draft").click();
  await expect(label).toHaveText("text 2");
  await expect(owner).toHaveAttribute("aria-label", "text: text 2");
  await expect(owner).toHaveCSS("--annotation-color", "#d04a36");
});

test("Annotation Preview Update reverts even without an explicit Cancel, when selection moves away", async ({ page }) => {
  await page.goto("/");
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Annotation", exact: true }).click();
  await page.getByLabel("Annotation type").selectOption("text");
  const previousIds = await snapshotAnnotationIds(host);
  await page.getByRole("button", { name: "Add annotation" }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");

  const owner = annotationOwnerById(host, await waitForCreatedAnnotationId(host, previousIds, "text"));
  const label = owner.locator("[data-role='annotation-label']");
  const editor = page.getByTestId("annotation-editor");
  await editor.getByLabel("Annotation label", { exact: true }).fill("LEAK TEST");
  await page.getByTestId("annotation-preview-action").click();
  await expect(label).toHaveText("LEAK TEST");

  // Move selection away without clicking Revert; the Inspector editor
  // unmounts and its transient preview must not leak onto the overlay.
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_ready']").click();
  await expect(label).toHaveText("text 2");
});

test("Apply commits the previewed draft as one real SemanticCommand", async ({ page }) => {
  await page.goto("/");
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Annotation", exact: true }).click();
  await page.getByLabel("Annotation type").selectOption("text");
  const previousIds = await snapshotAnnotationIds(host);
  await page.getByRole("button", { name: "Add annotation" }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");

  const owner = annotationOwnerById(host, await waitForCreatedAnnotationId(host, previousIds, "text"));
  const label = owner.locator("[data-role='annotation-label']");
  const editor = page.getByTestId("annotation-editor");
  await editor.getByLabel("Annotation label", { exact: true }).fill("COMMITTED LABEL");
  await page.getByTestId("annotation-preview-action").click();
  await expect(label).toHaveText("COMMITTED LABEL");

  const revisionBefore = await host.getAttribute("data-canonical-revision");
  await page.getByTestId("apply-annotation-properties").click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(host).not.toHaveAttribute("data-canonical-revision", revisionBefore!);
  await expect(label).toHaveText("COMMITTED LABEL");
  await expect(owner).not.toHaveAttribute("data-annotation-preview", "true");
});
