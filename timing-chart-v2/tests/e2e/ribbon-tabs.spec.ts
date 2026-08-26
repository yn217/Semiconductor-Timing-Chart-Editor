import { expect, test, type Page } from "@playwright/test";

async function ready(page: Page) {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
}

const tabGroups: Record<string, string> = {
  File: "file-group",
  Home: "history-group",
  Insert: "insert-group",
  Timeline: "timeline-group",
  Annotation: "annotation-group",
  View: "view-group",
  Review: "review-group",
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
    await expect(ribbon.locator(".ribbon-group")).toHaveCount(tab === "Home" ? 7 : 1);
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
});

test("Insert tab creates a real canonical Signal through a SemanticCommand", async ({ page }) => {
  await ready(page);
  const host = page.getByTestId("cycle-surface");
  const surface = host.locator("[data-role='timing-chart-surface']");
  const tabs = page.locator(".ribbon-tabs");
  const ribbon = page.getByTestId("ribbon");
  await tabs.getByRole("button", { name: "Insert", exact: true }).click();

  const canonicalRowsBefore = (await surface.getAttribute("data-canonical-row-ids"))?.split(",") ?? [];
  const historyBefore = await page.getByTestId("history-status").textContent();
  await ribbon.getByRole("button", { name: "Signal", exact: true }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(page.getByTestId("history-status")).not.toHaveText(historyBefore!);
  const canonicalRowsAfter = (await surface.getAttribute("data-canonical-row-ids"))?.split(",") ?? [];
  expect(canonicalRowsAfter.length).toBe(canonicalRowsBefore.length + 1);
});

test("Review tab Problems button navigates to the Problems panel", async ({ page }) => {
  await ready(page);
  const tabs = page.locator(".ribbon-tabs");
  const ribbon = page.getByTestId("ribbon");
  await tabs.getByRole("button", { name: "Review", exact: true }).click();
  await ribbon.getByRole("button", { name: "Problems", exact: true }).click();
  await expect(page.getByTestId("problems-panel")).toBeVisible();
});
