import { expect, test } from "@playwright/test";

test.describe("status context", () => {
  test("reflects workspace, view mode, zoom and selection scope without mutation", async ({ page }) => {
    await page.goto("/");
    const shell = page.locator(".editor-shell");
    const surface = page.locator("[data-role='timing-chart-surface']");
    const revision = await surface.getAttribute("data-canonical-revision");
    const history = await surface.getAttribute("data-history-depth");
    await expect(page.getByTestId("status-context")).toContainText("Workspace: edit");
    await expect(page.getByTestId("view-mode-status")).toHaveText("Mode: Cycle");
    await expect(page.getByTestId("zoom-status-bar")).toHaveText("Zoom: 100%");
    await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
    await page.getByLabel("Workspace preset").selectOption("review");
    await page.getByLabel("Zoom preset").selectOption("150");
    await expect(page.getByTestId("status-context")).toContainText("Workspace: review");
    await expect(page.getByTestId("zoom-status-bar")).toHaveText("Zoom: 150%");
    await expect(shell).toHaveAttribute("data-workspace-preset", "review");
    expect(await surface.getAttribute("data-canonical-revision")).toBe(revision);
    expect(await surface.getAttribute("data-history-depth")).toBe(history);
  });

  test("titlebar view-title always agrees with the status bar's Mode (#199)", async ({ page }) => {
    await page.goto("/");
    const surface = page.locator("[data-role='timing-chart-surface']");
    const revision = await surface.getAttribute("data-canonical-revision");
    const history = await surface.getAttribute("data-history-depth");
    const titleBarView = page.getByTestId("titlebar-view-title");
    await expect(titleBarView).toHaveText("Cycle View");
    await expect(page.getByTestId("view-mode-status")).toHaveText("Mode: Cycle");
    await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
    await expect(titleBarView).toHaveText("Transaction View");
    await expect(page.getByTestId("view-mode-status")).toHaveText("Mode: Transaction");
    await page.locator(".view-mode").getByRole("button", { name: "Combined", exact: true }).click();
    await expect(titleBarView).toHaveText("Split View");
    await expect(page.getByTestId("view-mode-status")).toHaveText("Mode: Split");
    expect(await surface.getAttribute("data-canonical-revision")).toBe(revision);
    expect(await surface.getAttribute("data-history-depth")).toBe(history);
  });

  test("exposes Bottom pin/follow state and selected hierarchy scope", async ({ page }) => {
    await page.goto("/");
    const host = page.getByTestId("cycle-surface");
    await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
    await expect(page.getByTestId("status-context")).toContainText("Scope: dut");
    await page.getByTestId("follow-selection").uncheck();
    await expect(page.getByTestId("status-context")).toContainText("Bottom: Fixed");
    await page.getByTestId("bottom-pin").click();
    await expect(page.getByTestId("status-context")).toContainText("Bottom: Pinned");
  });

  test("exposes and clears a temporary arrow-pick mode", async ({ page }) => {
    await page.goto("/");
    await page.locator(".ribbon-tabs").getByRole("button", { name: "Annotation", exact: true }).click();
    await page.getByRole("button", { name: "Pick arrow endpoints", exact: true }).click();
    await expect(page.getByTestId("tool-status")).toHaveText("Arrow pick · from");
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("tool-status")).toHaveText("Ready · Tool: Select");
  });
});
