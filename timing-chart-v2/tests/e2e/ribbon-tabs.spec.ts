import { expect, test, type Page } from "@playwright/test";

async function ready(page: Page) {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
}

const tabGroups: Record<string, string> = {
  File: "file-group",
  Home: "home-file-group",
  Insert: "insert-group",
  Timeline: "timeline-ribbon",
  Annotation: "annotation-group",
  View: "view-show-group",
  Check: "review-group",
  AI: "ai-group",
};

test("switches Ribbon tab content without touching Canonical, History, WaveDrom, RowLayout, geometry, or Inspector/Bottom state", async ({ page }) => {
  await ready(page);
  const host = page.getByTestId("cycle-surface");
  const surface = host.locator("[data-role='timing-chart-surface']");
  const tabs = page.locator(".ribbon-tabs");
  const ribbon = page.getByTestId("ribbon");

  const revisionBefore = await page.getByTestId("revision-status").textContent();
  const historyBefore = await page.getByTestId("history-status").textContent();
  const countersBefore = JSON.parse(await surface.getAttribute("data-render-counters") ?? "null") as Record<string, number>;
  const sessionCountersBefore = JSON.parse(await host.getAttribute("data-session-counters") ?? "null") as Record<string, number>;
  const ribbonBoxBefore = await ribbon.boundingBox();
  const workspaceBoxBefore = await page.locator(".desktop-workspace").boundingBox();
  const inspectorVisibleBefore = await page.getByTestId("inspector").count();
  const bottomVisibleBefore = await page.getByTestId("bottom-editor").count();

  for (const [tab, groupClass] of Object.entries(tabGroups)) {
    await tabs.getByRole("button", { name: tab, exact: true }).click();
    await expect(tabs.getByRole("button", { name: tab, exact: true })).toHaveClass(/active/);
    await expect(ribbon.locator(`.${groupClass}`)).toHaveCount(1);
    // Ribbon height must never change across tabs, and the waveform workspace must not shift.
    const ribbonBox = await ribbon.boundingBox();
    expect(ribbonBox!.height).toBe(ribbonBoxBefore!.height);
    const workspaceBox = await page.locator(".desktop-workspace").boundingBox();
    expect(workspaceBox!.y).toBe(workspaceBoxBefore!.y);
  }

  await expect(page.getByTestId("revision-status")).toHaveText(revisionBefore!);
  await expect(page.getByTestId("history-status")).toHaveText(historyBefore!);
  const countersAfter = JSON.parse(await surface.getAttribute("data-render-counters") ?? "null") as Record<string, number>;
  expect(countersAfter.waveDromRenders).toBe(countersBefore.waveDromRenders);
  expect(countersAfter.localGeometryBuilds).toBe(countersBefore.localGeometryBuilds);
  const sessionCountersAfter = JSON.parse(await host.getAttribute("data-session-counters") ?? "null") as Record<string, number>;
  expect(sessionCountersAfter.rowLayoutBuilds).toBe(sessionCountersBefore.rowLayoutBuilds);
  expect(sessionCountersAfter.commits).toBe(sessionCountersBefore.commits);
  // Inspector / Bottom Editor visibility state is untouched by pure tab switching.
  expect(await page.getByTestId("inspector").count()).toBe(inspectorVisibleBefore);
  expect(await page.getByTestId("bottom-editor").count()).toBe(bottomVisibleBefore);

  await tabs.getByRole("button", { name: "Home", exact: true }).click();
  await expect(ribbon.locator(".home-file-group").getByRole("button", { name: "Save", exact: true })).toBeVisible();
  await expect(ribbon.locator(".home-timeline-group").getByRole("button", { name: "Insert one cycle", exact: true })).toBeVisible();
  await expect(ribbon.locator(".home-display-group").getByTestId("home-grid-toggle")).toBeVisible();
  await expect(ribbon.locator(".home-display-group").getByTestId("home-snap-toggle")).toBeVisible();
  await expect(ribbon.locator(".home-options-group").getByRole("button", { name: "More", exact: true })).toBeVisible();
});

test("Insert tab creates a real canonical Signal through a SemanticCommand", async ({ page }) => {
  await ready(page);
  const host = page.getByTestId("cycle-surface");
  const tabs = page.locator(".ribbon-tabs");
  const ribbon = page.getByTestId("ribbon");
  await tabs.getByRole("button", { name: "Insert", exact: true }).click();

  const signalCountBefore = Number((await page.getByTestId("signal-count-status").textContent())?.match(/\d+/)?.[0]);
  const historyBefore = await page.getByTestId("history-status").textContent();
  await ribbon.getByRole("button", { name: "Signal", exact: true }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(page.getByTestId("history-status")).not.toHaveText(historyBefore!);
  const signalCountAfter = Number((await page.getByTestId("signal-count-status").textContent())?.match(/\d+/)?.[0]);
  expect(signalCountAfter).toBe(signalCountBefore + 1);
});

test("Review tab Problems button navigates to the Problems panel", async ({ page }) => {
  await ready(page);
  const tabs = page.locator(".ribbon-tabs");
  const ribbon = page.getByTestId("ribbon");
  await tabs.getByRole("button", { name: "Check", exact: true }).click();
  await ribbon.getByRole("button", { name: "Problems", exact: true }).click();
  await expect(page.getByTestId("problems-panel")).toBeVisible();
});

test("AI query previews and applies one scoped SemanticCommand", async ({ page }) => {
  await ready(page);
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  const beforeRevision = await host.getAttribute("data-canonical-revision");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "AI", exact: true }).click();
  await page.getByRole("tab", { name: "AI", exact: true }).click();
  const ai = page.getByTestId("ai-operation-panel");
  await ai.getByLabel("AI semantic query").fill("rename selected signal to AI_REQ");
  await ai.getByRole("button", { name: "Preview" }).click();
  await expect(ai.getByTestId("ai-status")).toHaveText("Preview ready · no document mutation");
  await expect(ai.getByTestId("ai-preview")).toContainText("Rename");
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
  await expect(host).toHaveAttribute("data-canonical-revision", beforeRevision!);
  await ai.getByRole("button", { name: "Validate Proposal" }).click();
  await expect(ai.getByTestId("ai-status")).toHaveText("Validated · deterministic local checks passed");
  await ai.getByRole("button", { name: "Apply Preview" }).click();
  await expect(host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request'] [data-role='frozen-signal-name']")).toHaveText("AI_REQ");
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await expect(ai.getByTestId("ai-status")).toHaveText("Applied · one atomic SemanticCommand transaction");
  await expect(host).toHaveAttribute("data-canonical-revision", String(Number(beforeRevision) + 1));
});

test("AI preview cancels and rejects stale revision without mutation", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  await page.locator(".ribbon-tabs").getByRole("button", { name: "AI", exact: true }).click();
  await page.getByRole("tab", { name: "AI", exact: true }).click();
  const ai = page.getByTestId("ai-operation-panel");
  await ai.getByLabel("AI semantic query").fill("hide selected signal");
  await ai.getByRole("button", { name: "Preview" }).click();
  await ai.getByRole("button", { name: "Cancel" }).click();
  await expect(ai.getByTestId("ai-status")).toHaveText("Preview cancelled · no document mutation");
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
  await ai.getByRole("button", { name: "Preview" }).click();
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Home", exact: true }).click();
  await page.getByTestId("ribbon").locator(".home-timeline-group").getByRole("button", { name: "Insert one cycle", exact: true }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(ai.getByRole("button", { name: "Apply Preview" })).toHaveCount(1);
  await ai.getByRole("button", { name: "Apply Preview" }).click();
  await expect(ai.getByTestId("ai-status")).toContainText("Conflict · preview revision");
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
});
