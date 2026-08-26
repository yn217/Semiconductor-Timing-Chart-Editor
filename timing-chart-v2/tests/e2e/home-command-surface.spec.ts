import { expect, test, type Page } from "@playwright/test";

async function ready(page: Page) {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
}

function revisionNumber(value: string | null) {
  const match = value?.match(/Canonical revision (\d+)/);
  expect(match).not.toBeNull();
  return Number(match?.[1]);
}

test("Home exposes grouped command surfaces and provides stable-ID Select All", async ({ page }) => {
  await ready(page);
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Home", exact: true }).click();
  const ribbon = page.getByTestId("ribbon");
  for (const group of ["History", "Clipboard", "Edit", "Selection", "Visibility", "Arrange", "Properties"]) {
    await expect(ribbon.locator(`[aria-label='${group}']`)).toBeVisible();
  }
  const selectAll = ribbon.getByRole("button", { name: "Select All", exact: true });
  await expect(selectAll).toBeEnabled();
  await expect(selectAll).toHaveAttribute("title", "Select all timing signals");
  const beforeRevision = await page.getByTestId("revision-status").textContent();
  const beforeHistory = await page.getByTestId("history-status").textContent();
  await selectAll.click();
  await expect(page.getByTestId("selection-status")).toHaveText("8 signals");
  await expect(page.getByTestId("revision-status")).toHaveText(beforeRevision!);
  await expect(page.getByTestId("history-status")).toHaveText(beforeHistory!);
});

test("Copy is view-only and Duplicate/Paste use one canonical command with fresh stable IDs", async ({ page }) => {
  await ready(page);
  const host = page.getByTestId("cycle-surface");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Home", exact: true }).click();
  const ribbon = page.getByTestId("ribbon");
  const beforeRevision = await page.getByTestId("revision-status").textContent();
  const beforeHistory = await page.getByTestId("history-status").textContent();
  const initialRevision = revisionNumber(beforeRevision);
  await ribbon.getByRole("button", { name: "Copy", exact: true }).click();
  await expect(ribbon.getByTestId("clipboard-status")).toHaveText("Copied REQUEST");
  await expect(page.getByTestId("revision-status")).toHaveText(beforeRevision!);
  await expect(page.getByTestId("history-status")).toHaveText(beforeHistory!);
  await ribbon.getByRole("button", { name: "Duplicate", exact: true }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(page.getByTestId("selection-status")).toHaveText("REQUEST_duplicate");
  expect(revisionNumber(await page.getByTestId("revision-status").textContent())).toBe(initialRevision + 1);
  await expect(page.getByTestId("history-status")).toHaveText(/History 1 \/ Redo 0/);
  const ids = await host.locator("[data-role='frozen-row']").evaluateAll((rows) => rows.map((row) => row.getAttribute("data-row-id")));
  expect(new Set(ids).size).toBe(ids.length);
  await page.getByTestId("ribbon").getByRole("button", { name: "Undo", exact: true }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(page.getByTestId("history-status")).toHaveText(/History 0 \/ Redo 1/);
  await ribbon.getByRole("button", { name: "Paste", exact: true }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(page.getByTestId("selection-status")).toHaveText("REQUEST_paste");
  expect(revisionNumber(await page.getByTestId("revision-status").textContent())).toBe(initialRevision + 3);
  await expect(page.getByTestId("history-status")).toHaveText(/History 1 \/ Redo 0/);
});

test("multi-selection clipboard preserves stable IDs and commits Duplicate/Cut as one operation", async ({ page }) => {
  await ready(page);
  const host = page.getByTestId("cycle-surface");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_ready']").click({ modifiers: ["Control"] });
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Home", exact: true }).click();
  const ribbon = page.getByTestId("ribbon");
  const revisionBeforeCopy = await page.getByTestId("revision-status").textContent();
  const historyBeforeCopy = await page.getByTestId("history-status").textContent();
  await ribbon.getByRole("button", { name: "Copy", exact: true }).click();
  await expect(ribbon.getByTestId("clipboard-status")).toHaveText("Copied 2 signals");
  await expect(page.getByTestId("revision-status")).toHaveText(revisionBeforeCopy!);
  await expect(page.getByTestId("history-status")).toHaveText(historyBeforeCopy!);
  await ribbon.getByRole("button", { name: "Duplicate", exact: true }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(ribbon.getByTestId("clipboard-status")).toHaveText("Duplicated 2 signals");
  await expect(page.getByTestId("selection-status")).toHaveText("2 signals");
  await expect(page.getByTestId("revision-status")).toHaveText("Canonical revision 1");
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  const ids = await host.locator("[data-role='frozen-row']").evaluateAll((rows) => rows.map((row) => row.getAttribute("data-row-id")));
  expect(new Set(ids).size).toBe(ids.length);
  await ribbon.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 1");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_ready']").click({ modifiers: ["Control"] });
  await ribbon.getByRole("button", { name: "Cut", exact: true }).click();
  await expect(ribbon.getByTestId("clipboard-status")).toHaveText("Cut 2 signals");
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await expect(host.locator("[data-row-id='sig_cycle_request'], [data-row-id='sig_cycle_ready']")).toHaveCount(0);
});

test("multi-selection Delete commits selected stable IDs as one atomic operation", async ({ page }) => {
  await ready(page);
  const host = page.getByTestId("cycle-surface");
  const request = host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']");
  const readyRow = host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_ready']");
  await request.click();
  await readyRow.click({ modifiers: ["Control"] });
  await expect(page.getByTestId("selection-status")).toHaveText("2 signals");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Home", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Delete", exact: true }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(host.locator("[data-row-id='sig_cycle_request']")).toHaveCount(0);
  await expect(host.locator("[data-row-id='sig_cycle_ready']")).toHaveCount(0);
  await expect(page.getByTestId("revision-status")).toHaveText("Canonical revision 1");
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
});

test("Cut uses the clipboard surface and one canonical delete operation", async ({ page }) => {
  await ready(page);
  const host = page.getByTestId("cycle-surface");
  const row = host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']");
  await row.click();
  const surface = host.locator("[data-role='timing-chart-surface']");
  const before = JSON.parse(await surface.getAttribute("data-render-counters") ?? "null") as Record<string, number>;
  const ribbon = page.getByTestId("ribbon");
  await ribbon.getByRole("button", { name: "Cut", exact: true }).click();
  await expect(page.getByTestId("clipboard-status")).toHaveText("Cut REQUEST");
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await expect(host).toHaveAttribute("data-canonical-revision", "1");
  await expect(host.locator("[data-row-id='sig_cycle_request']")).toHaveCount(0);
  const after = JSON.parse(await surface.getAttribute("data-render-counters") ?? "null") as Record<string, number>;
  expect(after.waveDromRenders).toBe(before.waveDromRenders);
  expect(after.localGeometryBuilds).toBe(before.localGeometryBuilds);
  await page.keyboard.press("Control+V");
  await expect(page.getByTestId("clipboard-status")).toContainText("Pasted");
  await expect(page.getByTestId("history-status")).toHaveText("History 2 / Redo 0");
});

test("Visibility and Arrange route through semantic commands", async ({ page }) => {
  await ready(page);
  const host = page.getByTestId("cycle-surface");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Home", exact: true }).click();
  const ribbon = page.getByTestId("ribbon");
  const surface = host.locator("[data-role='timing-chart-surface']");
  const before = JSON.parse(await surface.getAttribute("data-render-counters") ?? "null") as Record<string, number>;
  await ribbon.getByRole("button", { name: "Hide", exact: true }).click();
  await expect(host.locator("[data-role='wave-owner'][data-signal-id='sig_cycle_request']")).toHaveCount(0);
  await ribbon.getByRole("button", { name: "Show", exact: true }).click();
  await expect(host.locator("[data-role='wave-owner'][data-signal-id='sig_cycle_request']")).toHaveCount(1);
  await ribbon.getByRole("button", { name: "Move Down", exact: true }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  const after = JSON.parse(await surface.getAttribute("data-render-counters") ?? "null") as Record<string, number>;
  expect(after.waveDromRenders).toBeGreaterThanOrEqual(before.waveDromRenders);
  await expect(page.getByTestId("history-status")).toHaveText(/History 3 \/ Redo 0/);
});
