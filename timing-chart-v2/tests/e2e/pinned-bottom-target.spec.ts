import { expect, test, type Page } from "@playwright/test";

async function ready(page: Page) {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
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
  await expect(bottom).toContainText("CLOCK · clock");
});

test("pinned Annotation delete targets the pinned stable ID", async ({ page }) => {
  await ready(page);
  const host = page.getByTestId("cycle-surface");
  const bottom = page.getByTestId("bottom-editor");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Annotation", exact: true }).click();
  await page.getByTestId("annotation-toolbar").getByRole("button", { name: "Add annotation", exact: true }).click();
  const annotation = page.getByTestId("annotation-list").locator("[data-annotation-list-id]").first();
  await expect(annotation).toBeVisible();
  await bottom.getByTestId("bottom-pin").click();
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_ready']").click();
  await bottom.getByTestId("delete-annotation").click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(page.getByTestId("annotation-list").locator("[data-annotation-list-id]")).toHaveCount(0);
  await expect(host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_ready']")).toHaveCount(1);
  await expect(bottom.getByTestId("bottom-pin")).toHaveAttribute("aria-pressed", "false");
});

test("pinned Transaction edits target the pinned stable ID", async ({ page }) => {
  await ready(page);
  const host = page.getByTestId("cycle-surface");
  const bottom = page.getByTestId("bottom-editor");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Timeline", exact: true }).click();
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  await page.locator(".bottom-tabs").getByRole("button", { name: "Transaction", exact: true }).click();
  await page.getByLabel("New Transaction name").fill("Pinned Transfer");
  await page.getByRole("button", { name: "Create Transaction", exact: true }).click();
  await expect(bottom).toContainText("Pinned Transfer");
  await bottom.getByTestId("bottom-pin").click();
  await page.locator(".view-mode").getByRole("button", { name: "Split", exact: true }).click();
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  await expect(bottom.getByTestId("bottom-pin")).toHaveAttribute("aria-pressed", "true");
  await bottom.locator(".bottom-tabs").getByRole("button", { name: "Transaction", exact: true }).click();
  await expect(bottom).toContainText("Editing: Pinned Transfer");
  await bottom.getByLabel("Transaction name").fill("Pinned Transfer Updated");
  await bottom.getByTestId("apply-transaction-properties").click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(bottom).toContainText("Pinned Transfer Updated");
  await expect(host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']")).toHaveCount(1);
});
