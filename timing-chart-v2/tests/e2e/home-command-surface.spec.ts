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

test("Home exposes grouped command surfaces and disables unsupported multi-select with a reason", async ({ page }) => {
  await ready(page);
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Home", exact: true }).click();
  const ribbon = page.getByTestId("ribbon");
  for (const group of ["History", "Clipboard", "Edit", "Selection", "Visibility", "Arrange", "Properties"]) {
    await expect(ribbon.locator(`[aria-label='${group}']`)).toBeVisible();
  }
  const selectAll = ribbon.getByRole("button", { name: "Select All", exact: true });
  await expect(selectAll).toBeDisabled();
  await expect(selectAll).toHaveAttribute("title", /Multi-selection owner/);
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
