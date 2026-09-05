import { expect, test } from "@playwright/test";

// #395 PR1: the AI Ribbon tab is now a compact Ask/Edit trigger -- the
// actual query/preview/apply surface (AIOperationPanel, unchanged
// internally) lives in the Bottom Panel's own "AI Assistant" tab, the
// same relocation this codebase already uses for Transaction/Bookmarks.
async function openAIAssistant(page: import("@playwright/test").Page) {
  await page.getByLabel("Ribbon tabs").getByRole("button", { name: "AI", exact: true }).click();
  await page.getByRole("button", { name: "Ask or edit with the AI Assistant" }).click();
  return page.getByTestId("ai-operation-panel");
}

test("AI proposal uses preview, deterministic validation, atomic apply, and exact persistence", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();

  const ai = await openAIAssistant(page);
  await ai.getByLabel("AI semantic query").fill("rename selected signal to AI_REQUEST");
  await ai.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(ai.getByTestId("ai-preview")).toContainText("Rename REQUEST to AI_REQUEST");
  await expect(host).toHaveAttribute("data-canonical-revision", "0");
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");

  await ai.getByTestId("ai-validate").click();
  await expect(ai.getByTestId("ai-status")).toHaveText("Validated · deterministic local checks passed");
  await ai.getByTestId("ai-apply").click();
  await expect(ai.getByTestId("ai-status")).toHaveText("Applied · one atomic SemanticCommand transaction");
  await expect(host).toHaveAttribute("data-canonical-revision", "1");
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await expect(host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']")).toContainText("AI_REQUEST");

  // #395 PR1: Ask/Edit switches the Bottom Panel to "AI Assistant" (away
  // from its default "Signal" tab, whose own Undo/Redo this test used to
  // incidentally hit) -- Undo/Redo are Home Ribbon controls, not part of
  // AIOperationPanel itself, so switch tabs to reach them like any other
  // Ribbon-tab-scoped test does.
  await page.getByLabel("Ribbon tabs").getByRole("button", { name: "Home", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Undo", exact: true }).click();
  await expect(host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']")).toContainText("REQUEST");
  await page.getByTestId("ribbon").getByRole("button", { name: "Redo", exact: true }).click();
  await expect(host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']")).toContainText("AI_REQUEST");

  const downloadPromise = page.waitForEvent("download");
  await page.getByLabel("Ribbon tabs").getByRole("button", { name: "File", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Save", exact: true }).click();
  const savedPath = await (await downloadPromise).path();
  expect(savedPath).toBeTruthy();
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(savedPath!);
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']")).toContainText("AI_REQUEST");
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
});

test("AI proposal rejects a stale revision after an intervening semantic edit", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  const ai = await openAIAssistant(page);
  await ai.getByLabel("AI semantic query").fill("rename selected signal to STALE_PROPOSAL");
  await ai.getByRole("button", { name: "Preview", exact: true }).click();

  const inspector = page.getByTestId("inspector");
  await inspector.getByLabel("Inspector signal name").fill("INTERVENING_EDIT");
  await inspector.getByTestId("apply-inspector-signal").click();
  await expect(host).toHaveAttribute("data-canonical-revision", "1");
  await ai.getByTestId("ai-validate").click();
  await expect(ai.getByTestId("ai-status")).toHaveText(/Conflict · preview revision 0, current revision 1/);
  await expect(ai.getByTestId("ai-preview")).toHaveCount(0);
  await expect(host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']")).toContainText("INTERVENING_EDIT");
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await page.locator(".bottom-tabs").getByRole("tab", { name: "Problems" }).click();
  await expect(page.getByTestId("problems-panel")).toContainText("AI_PREVIEW_STALE");
  await expect(page.getByTestId("problems-panel")).toContainText("Regenerate the preview from the current document");
});

test("AI Apply reports a stale proposal through the shared Problems diagnostic path", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  const ai = await openAIAssistant(page);
  await ai.getByLabel("AI semantic query").fill("rename selected signal to STALE_APPLY");
  await ai.getByRole("button", { name: "Preview", exact: true }).click();

  const inspector = page.getByTestId("inspector");
  await inspector.getByLabel("Inspector signal name").fill("INTERVENING_APPLY_EDIT");
  await inspector.getByTestId("apply-inspector-signal").click();
  await expect(host).toHaveAttribute("data-canonical-revision", "1");
  await ai.getByTestId("ai-apply").click();
  await expect(ai.getByTestId("ai-status")).toHaveText(/Conflict · preview revision 0, current revision 1/);
  await expect(host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']")).toContainText("INTERVENING_APPLY_EDIT");
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await page.locator(".bottom-tabs").getByRole("tab", { name: "Problems" }).click();
  const problems = page.getByTestId("problems-panel");
  await expect(problems).toContainText("AI_PREVIEW_STALE");
  await expect(problems).toContainText("Apply AI proposal");
  await expect(problems).toContainText("Regenerate the preview from the current document before applying it");
});

// #395 PR1: the AI Ribbon tab used to host the entire query/preview/apply
// surface directly, including RibbonIcon's bare <svg> (no width/height/
// viewBox), which fell back to the CSS spec's default replaced-element
// intrinsic size (300x150) since nothing constrained it -- rendering a
// giant logo that pushed the whole AI Ribbon tab far taller than every
// other tab. The Ribbon is now a compact Ask/Edit trigger (icon sized
// through the normal DsIconBox wrapper like every other Ribbon button)
// plus a truthful Provider status; the full surface moved to a Bottom
// Panel tab.
test("AI Ribbon is a compact Ask/Edit trigger matching other tabs' geometry, with a truthful provider status", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  const tabs = page.locator(".ribbon-tabs");
  const ribbon = page.getByTestId("ribbon");

  await tabs.getByRole("button", { name: "Home", exact: true }).click();
  const homeHeight = (await ribbon.boundingBox())!.height;

  await tabs.getByRole("button", { name: "AI", exact: true }).click();
  await expect(ribbon.getByTestId("ai-operation-panel")).toHaveCount(0);
  const trigger = ribbon.getByRole("button", { name: "Ask or edit with the AI Assistant" });
  const icon = trigger.locator("svg");
  const iconBox = (await icon.boundingBox())!;
  expect(iconBox.width, JSON.stringify(iconBox)).toBeLessThanOrEqual(28);
  expect(iconBox.height, JSON.stringify(iconBox)).toBeLessThanOrEqual(28);
  const aiHeight = (await ribbon.boundingBox())!.height;
  expect(Math.abs(aiHeight - homeHeight)).toBeLessThanOrEqual(2);

  // Never claims a Claude/Codex connection that doesn't exist -- there is
  // no external bridge implemented yet (see #395).
  const status = ribbon.getByTestId("ai-provider-status");
  await expect(status).toContainText("offline");
  await expect(status).not.toContainText("Connected");

  await trigger.click();
  await expect(page.getByTestId("bottom-editor").getByTestId("ai-operation-panel")).toBeVisible();
});
