import { expect, test } from "@playwright/test";
import { canonicalFixture } from "../fixtures/canonical";

// #395 PR1: the AI Ribbon tab is now a compact Ask/Edit trigger -- the
// actual query/preview/apply surface (AIOperationPanel, unchanged
// internally) lives in the Bottom Panel's own "AI Assistant" tab, the
// same relocation this codebase already uses for Transaction/Bookmarks.
async function openAIAssistant(page: import("@playwright/test").Page) {
  await page.getByLabel("Ribbon tabs").getByRole("button", { name: "AI", exact: true }).click();
  await page.getByRole("button", { name: "Ask or edit with the AI Assistant" }).click();
  return page.getByTestId("ai-operation-panel");
}

async function selectRequest(page: import("@playwright/test").Page, host: import("@playwright/test").Locator) {
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
}

test("AI proposal uses preview, deterministic validation, atomic apply, and exact persistence", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await selectRequest(page, host);

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
  await selectRequest(page, host);
  const ai = await openAIAssistant(page);
  await ai.getByLabel("AI semantic query").fill("rename selected signal to STALE_PROPOSAL");
  await ai.getByRole("button", { name: "Preview", exact: true }).click();

  const inspector = page.getByTestId("inspector");
  // #402/#426 (Bottom Panel Visual Reference pass): Inspector's Apply is
  // now Draft/Apply-gated (disabled while unchanged), same as Bottom's own
  // form used to be -- and `name` is deliberately excluded from that gate,
  // since InlineNameInput already commits immediately on its own gesture
  // (Enter), independent of Apply.
  await inspector.getByLabel("Inspector signal name").fill("INTERVENING_EDIT");
  await inspector.getByLabel("Inspector signal name").press("Enter");
  await expect(host).toHaveAttribute("data-canonical-revision", "1");
  await ai.getByTestId("ai-validate").click();
  await expect(ai.getByTestId("ai-status")).toHaveText("Preview is out of date. Regenerate it.");
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
  await selectRequest(page, host);
  const ai = await openAIAssistant(page);
  await ai.getByLabel("AI semantic query").fill("rename selected signal to STALE_APPLY");
  await ai.getByRole("button", { name: "Preview", exact: true }).click();

  const inspector = page.getByTestId("inspector");
  await inspector.getByLabel("Inspector signal name").fill("INTERVENING_APPLY_EDIT");
  await inspector.getByLabel("Inspector signal name").press("Enter");
  await expect(host).toHaveAttribute("data-canonical-revision", "1");
  await ai.getByTestId("ai-apply").click();
  await expect(ai.getByTestId("ai-status")).toHaveText("Preview is out of date. Regenerate it.");
  await expect(host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']")).toContainText("INTERVENING_APPLY_EDIT");
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await page.locator(".bottom-tabs").getByRole("tab", { name: "Problems" }).click();
  const problems = page.getByTestId("problems-panel");
  await expect(problems).toContainText("AI_PREVIEW_STALE");
  await expect(problems).toContainText("Apply AI proposal");
  await expect(problems).toContainText("Regenerate the preview from the current document before applying it");
});

test("AI preview cannot cross an Open document epoch when IDs and revision are unchanged", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await selectRequest(page, host);

  const ai = await openAIAssistant(page);
  await ai.getByLabel("AI semantic query").fill("rename selected signal to STALE_AFTER_OPEN");
  await ai.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(ai.getByTestId("ai-preview")).toContainText("Rename REQUEST to STALE_AFTER_OPEN");
  await expect(host).toHaveAttribute("data-canonical-revision", "0");

  // The replacement deliberately keeps the same signal IDs and starts at
  // revision 0, so revision equality alone cannot make the proposal fresh.
  const replacement = canonicalFixture();
  replacement.document = { ...replacement.document, id: "opened-document-b", title: "Opened Document B" };
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({
    name: "opened-document-b.tcd",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(replacement)),
  });
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(host).toHaveAttribute("data-canonical-revision", "0");
  await expect(page.getByTestId("bottom-editor").getByTestId("ai-operation-panel")).toBeVisible();
  await expect(ai.getByTestId("ai-preview")).toHaveCount(0);
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");

  // A proposal rebuilt after Open belongs to the new epoch and can apply.
  await ai.getByLabel("AI semantic query").fill("create group named OPENED_DOCUMENT_GROUP");
  await ai.getByRole("button", { name: "Preview", exact: true }).click();
  await ai.getByTestId("ai-validate").click();
  await ai.getByTestId("ai-apply").click();
  await expect(ai.getByTestId("ai-status")).toHaveText("Applied · one atomic SemanticCommand transaction");
  await expect(host).toHaveAttribute("data-canonical-revision", "1");
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
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

// #395 PR2 (partial): Approval Policy defaults to "Always require
// approval" per the issue's own explicit requirement, and the Activity
// Log records every Preview/Validate/Apply outcome with a timestamp,
// provider identity, and result -- a real, auditable record of what the
// one provider that exists today actually did.
test("AI Settings default to Always require approval, and every Preview/Validate/Apply is recorded in the Activity Log", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await selectRequest(page, host);
  const ai = await openAIAssistant(page);

  const activityLog = ai.getByTestId("ai-activity-log");
  await expect(activityLog).toContainText("AI Activity (0)");

  await ai.getByTestId("ai-settings-toggle").click();
  const settings = ai.getByTestId("ai-settings");
  await expect(settings.getByLabel("Always require approval")).toBeChecked();
  await expect(settings.getByLabel("Auto-apply view-only operations")).not.toBeChecked();
  // #395 PR3: Agent Connection is a real control surface now (see
  // tests/e2e/ai-bridge.spec.ts for the actual connected-bridge case) --
  // off by default, and truthfully "Disconnected" until enabled.
  await expect(settings.getByLabel("Enable external agents")).not.toBeChecked();
  await expect(settings).toContainText("Status: Disconnected");
  await ai.getByTestId("ai-settings-toggle").click();

  await ai.getByLabel("AI semantic query").fill("rename selected signal to AI_LOGGED");
  await ai.getByRole("button", { name: "Preview", exact: true }).click();
  await ai.getByTestId("ai-validate").click();
  await ai.getByTestId("ai-apply").click();
  await expect(host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']")).toContainText("AI_LOGGED");

  await expect(activityLog).toContainText("AI Activity (3)");
  const entries = activityLog.locator("[data-testid='ai-activity-entry']");
  await expect(entries).toHaveCount(3);
  await expect(entries.nth(0)).toContainText("Applied · one atomic SemanticCommand transaction");
  await expect(entries.nth(1)).toContainText("Validated · deterministic local checks passed");
  await expect(entries.nth(2)).toContainText("Preview ready");
  await expect(entries.nth(0)).toContainText("Proposal");
});

// #395 PR2 (partial): "Auto-apply view-only operations" is a real,
// working setting -- it only ever short-circuits the manual Validate/
// Apply button clicks for a proposal already confirmed view-only, going
// through the exact same validate/apply functions. It must never affect
// a document-mutating (semantic-command) proposal, which still requires
// explicit manual Validate + Apply regardless of this setting.
test("Auto-apply view-only operations applies a view-only proposal immediately, but never a document-mutating one", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const ai = await openAIAssistant(page);
  await ai.getByTestId("ai-settings-toggle").click();
  await ai.getByTestId("ai-settings").getByLabel("Auto-apply view-only operations").check();
  await ai.getByTestId("ai-settings-toggle").click();

  // View-only: Preview alone is enough -- no manual Validate/Apply click.
  await ai.getByLabel("AI semantic query").fill("fit all");
  await ai.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(ai.getByTestId("ai-status")).toHaveText("Applied · view-only intent");
  await expect(ai.getByTestId("ai-preview")).toHaveCount(0);
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");

  // Document-mutating: still requires the explicit manual click chain --
  // Preview alone must not commit anything.
  await ai.getByLabel("AI semantic query").fill("create group named AI_AUTO_GROUP");
  await ai.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(ai.getByTestId("ai-preview")).toBeVisible();
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
  await ai.getByTestId("ai-validate").click();
  await ai.getByTestId("ai-apply").click();
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
});

// #395 PR5 (part 3): Scope (acceptance item 2, "Scope can be switched
// Selection / Current View / Document") is a real, switchable control,
// not a static label -- Current View genuinely refuses to edit a hidden
// entity even when it is still the current selection (a Signal you just
// hid does not stop being "selected", but it is no longer in the Current
// View), while Document allows it and Selection allows it too (a hidden
// Signal you still have selected is still your Selection).
test("Scope switches between Selection / Current View / Document, and Current View genuinely refuses to edit a hidden signal", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await selectRequest(page, host);
  await page.getByRole("button", { name: "Hide REQUEST" }).click();
  await expect(page.getByTestId("selection-status")).toHaveText("REQUEST");

  const ai = await openAIAssistant(page);
  await expect(ai.getByTestId("ai-scope-select")).toHaveValue("document");
  const context = ai.getByTestId("ai-context-summary");
  await expect(context.locator("[data-context-field='document']")).toContainText("Sample");
  await expect(context.locator("[data-context-field='view']")).toHaveText("Cycle");
  await expect(context.locator("[data-context-field='selection']")).toHaveText("Signal: REQUEST (hidden)");
  await expect(context.locator("[data-context-field='scope']")).toHaveText("Document");

  await ai.getByTestId("ai-scope-select").selectOption("current-view");
  await expect(context.locator("[data-context-field='scope']")).toHaveText("Current View");
  await ai.getByLabel("AI semantic query").fill("rename selected signal to REQ");
  await ai.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(ai.getByTestId("ai-status")).toContainText("hidden and outside the Current View scope");
  await expect(ai.getByTestId("ai-preview")).toHaveCount(0);

  await ai.getByTestId("ai-scope-select").selectOption("selection");
  await ai.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(ai.getByTestId("ai-preview")).toBeVisible();
  await ai.getByRole("button", { name: "Cancel" }).click();

  await ai.getByTestId("ai-scope-select").selectOption("document");
  await ai.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(ai.getByTestId("ai-preview")).toBeVisible();
  await ai.getByTestId("ai-validate").click();
  await ai.getByTestId("ai-apply").click();
  // History 2, not 1: the earlier "Hide REQUEST" click is itself a real,
  // separate History entry -- this Apply is the second.
  await expect(page.getByTestId("history-status")).toHaveText("History 2 / Redo 0");
});

// #395 acceptance item 16: "1672x941 and 1280x720 remain readable/
// unclipped." Not exercised anywhere in this issue's 5-PR split until
// now -- checks both the compact AI Ribbon tab's own controls and the
// Bottom AI Assistant panel's actual interactive surface (query input,
// Scope select, Preview/Settings buttons, Settings section once opened,
// Activity Log) stay fully inside the viewport at both named
// resolutions, the same "clamped at every corner" style of check this
// codebase already uses for context menus (home-command-surface.spec.ts).
for (const viewport of [{ width: 1672, height: 941 }, { width: 1280, height: 720 }]) {
  test(`AI Ribbon tab and Bottom AI Assistant panel stay readable and unclipped at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    const host = page.getByTestId("cycle-surface");
    await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
    await selectRequest(page, host);

    await page.getByLabel("Ribbon tabs").getByRole("button", { name: "AI", exact: true }).click();
    const ribbon = page.getByTestId("ribbon");
    const trigger = ribbon.getByRole("button", { name: "Ask or edit with the AI Assistant" });
    const providerStatus = ribbon.getByTestId("ai-provider-status");
    for (const element of [trigger, providerStatus]) {
      const box = (await element.boundingBox())!;
      expect(box.x, JSON.stringify(box)).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, JSON.stringify(box)).toBeLessThanOrEqual(viewport.width);
      expect(box.y + box.height, JSON.stringify(box)).toBeLessThanOrEqual(viewport.height);
    }

    await trigger.click();
    const ai = page.getByTestId("bottom-editor").getByTestId("ai-operation-panel");
    // The top query/scope/Preview/Settings-toggle row must always be fully
    // on-screen without scrolling first -- checked for both x and y.
    for (const element of [ai.getByLabel("AI semantic query"), ai.getByTestId("ai-scope-select"), ai.getByRole("button", { name: "Preview", exact: true }), ai.getByTestId("ai-settings-toggle")]) {
      const box = (await element.boundingBox())!;
      expect(box.x, JSON.stringify(box)).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, JSON.stringify(box)).toBeLessThanOrEqual(viewport.width);
      expect(box.y, JSON.stringify(box)).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height, JSON.stringify(box)).toBeLessThanOrEqual(viewport.height);
    }
    // The Settings section and Activity Log below it live inside the
    // Bottom Panel's own scrollable region (the same as every other
    // Bottom Panel tab in this app), so they are only held to the
    // viewport's horizontal bounds -- never clipped sideways -- not to
    // its exact bottom edge.
    await ai.getByTestId("ai-settings-toggle").click();
    const settings = ai.getByTestId("ai-settings");
    await expect(settings).toBeVisible();
    for (const element of [settings, ai.getByTestId("ai-activity-log")]) {
      const box = (await element.boundingBox())!;
      expect(box.x, JSON.stringify(box)).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, JSON.stringify(box)).toBeLessThanOrEqual(viewport.width);
    }
  });
}
