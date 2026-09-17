import { expect, test, type Page } from "@playwright/test";

async function ready(page: Page) {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
}

test("pinned Signal visibility and duplicate actions target the pinned stable ID", async ({ page }) => {
  await ready(page);
  const host = page.getByTestId("cycle-surface");
  const bottom = page.getByTestId("bottom-editor");

  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  await bottom.getByTestId("bottom-pin").click();
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_ready']").click();
  await bottom.getByTestId("signal-visibility").click();
  await expect(bottom.getByTestId("signal-visibility")).toHaveText("Show signal");
  await expect(host.locator("[data-role='left-row'][data-row-id='sig_cycle_request'] [data-role='tree-visibility'] svg")).toHaveAttribute("data-icon", "eye-off");
  await expect(host.locator("[data-role='left-row'][data-row-id='sig_cycle_ready'] [data-role='tree-visibility'] svg")).toHaveAttribute("data-icon", "eye");

  await bottom.getByTestId("bottom-pin").click();
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_clock']").click();
  await bottom.getByTestId("bottom-pin").click();
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_data']").click();
  await bottom.getByTestId("clock-duplicate").click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(page.getByTestId("selection-status")).toHaveText("CLOCK_duplicate");
  await expect(bottom).toContainText("CLOCK · Clock");
});

test("pinned Annotation delete targets the pinned stable ID", async ({ page }) => {
  await ready(page);
  const host = page.getByTestId("cycle-surface");
  const bottom = page.getByTestId("bottom-editor");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Annotation", exact: true }).click();
  await bottom.locator(".bottom-tabs").getByRole("tab", { name: "Annotation", exact: true }).click();
  await page.getByTestId("annotation-toolbar").getByRole("button", { name: "Add annotation", exact: true }).click();
  const annotationList = page.getByTestId("annotation-list");
  const selectedAnnotationRow = annotationList.locator("[data-annotation-list-id][data-selected='true']");
  await expect(selectedAnnotationRow).toHaveCount(1);
  const annotationId = await selectedAnnotationRow.getAttribute("data-annotation-list-id");
  expect(annotationId).toBeTruthy();
  const annotation = host.locator(`[data-role='annotation-owner'][data-annotation-id="${annotationId}"]`);
  await expect(annotation).toBeVisible();
  await bottom.getByTestId("bottom-pin").click();
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_ready']").click();
  await page.getByRole("toolbar", { name: "Annotation collection actions" }).getByRole("button", { name: "Delete", exact: true }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(annotation).toHaveCount(0);
  await expect(page.getByTestId("selection-status")).toContainText("READY");
  await expect(host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_ready']")).toHaveCount(1);
  await expect(bottom.getByTestId("bottom-pin")).toHaveAttribute("aria-pressed", "false");
});

test("pinned Signal delete targets the pinned stable ID", async ({ page }) => {
  await ready(page);
  const host = page.getByTestId("cycle-surface");
  const bottom = page.getByTestId("bottom-editor");
  const beforeIds = await host.locator("[data-role='frozen-row'][data-row-id]").evaluateAll((items) => items.map((item) => item.getAttribute("data-row-id")).filter((id): id is string => Boolean(id)));
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_clock']").click();
  await bottom.getByTestId("clock-duplicate").click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  const duplicateId = await host.locator("[data-role='frozen-row'][data-row-id]").evaluateAll((items, before) => items.map((item) => item.getAttribute("data-row-id")).find((id) => id && !before.includes(id)), beforeIds);
  expect(duplicateId).toBeTruthy();
  await bottom.getByTestId("bottom-pin").click();
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_ready']").click();
  await bottom.getByTestId("signal-delete").click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(host.locator(`[data-role='frozen-row'][data-row-id="${duplicateId}"]`)).toHaveCount(0);
  await expect(host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_ready']")).toHaveCount(1);
  await expect(page.getByTestId("history-status")).toHaveText("History 2 / Redo 0");
  await expect(bottom.getByTestId("bottom-pin")).toHaveAttribute("aria-pressed", "false");
});

test("pinned Transaction target remains selected after Cycle Signal selection", async ({ page }) => {
  await ready(page);
  const host = page.getByTestId("cycle-surface");
  const bottom = page.getByTestId("bottom-editor");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Timeline", exact: true }).click();
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  await page.locator(".bottom-tabs").getByRole("tab", { name: "Transaction", exact: true }).click();
  await page.getByLabel("New Transaction name").fill("Pinned Transfer");
  await page.getByRole("button", { name: "Create Transaction", exact: true }).click();
  await expect(bottom).toContainText("Pinned Transfer");
  await bottom.getByTestId("bottom-pin").click();
  await page.locator(".view-mode").getByRole("button", { name: "Combined", exact: true }).click();
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  await expect(bottom.getByTestId("bottom-pin")).toHaveAttribute("aria-pressed", "true");
  await bottom.locator(".bottom-tabs").getByRole("tab", { name: "Transaction", exact: true }).click();
  const transactionRow = bottom.locator(".transaction-list-row").filter({ hasText: "Pinned Transfer" });
  await expect(transactionRow).toHaveCount(1);
  await expect(transactionRow.locator("button[data-selected='true']")).toHaveCount(1);
  await expect(bottom.getByTestId("bottom-pin")).toHaveAttribute("aria-pressed", "true");
  await expect(host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']")).toHaveCount(1);
});
