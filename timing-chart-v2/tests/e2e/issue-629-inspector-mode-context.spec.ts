import { expect, test } from "@playwright/test";

for (const viewport of [{ width: 1672, height: 941 }, { width: 1280, height: 720 }]) {
  test(`Inspector follows active workspace context and retains hidden stable selection at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    test.setTimeout(60_000);
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.setViewportSize(viewport);
    await page.goto("/");

    const host = page.getByTestId("cycle-surface");
    const inspector = page.getByTestId("inspector");
    await expect(host).toHaveAttribute("data-editor-idle", "true");
    await expect(page.getByTestId("view-mode-status")).toHaveText("Mode: Transaction");

    await page.getByTestId("transaction-lanes").locator("[data-transaction-id='demo_txn_spi']").click();
    await expect(inspector.getByLabel("Transaction name")).toHaveValue("SPI_0");
    const baseline = {
      revision: await host.getAttribute("data-canonical-revision"),
      history: await page.getByTestId("history-status").innerText(),
      dirty: await page.getByTestId("dirty-status").innerText(),
    };

    await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
    await expect(page.getByTestId("view-mode-status")).toHaveText("Mode: Cycle");
    await expect(inspector.getByLabel("Transaction name")).toHaveCount(0);
    await expect(inspector).not.toContainText("demo_txn_spi");

    await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
    await expect(page.getByTestId("view-mode-status")).toHaveText("Mode: Transaction");
    await expect(inspector.getByLabel("Transaction name")).toHaveValue("SPI_0");

    await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();

    await page.locator("[data-testid='cycle-surface'] [data-role='left-tree-rows'] [data-row-id='sig_cycle_request']").click();
    await expect(inspector.getByLabel("Inspector signal name", { exact: true })).toHaveValue("REQUEST");
    await page.locator(".view-mode").getByRole("button", { name: "Combined", exact: true }).click();
    await expect(page.getByTestId("view-mode-status")).toHaveText("Mode: Combined");
    await expect(inspector.getByLabel("Inspector signal name", { exact: true })).toHaveValue("REQUEST");

    await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
    await expect(page.getByTestId("view-mode-status")).toHaveText("Mode: Transaction");
    await page.getByTestId("transaction-tree-tab-transactions").click();
    await expect(page.getByTestId("transaction-tree-tab-transactions")).toHaveAttribute("aria-selected", "true");
    await expect(inspector.getByRole("heading", { name: "Layout" })).toBeVisible();

    await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
    await expect(inspector.getByLabel("Inspector signal name", { exact: true })).toHaveValue("REQUEST");
    await page.locator(".view-mode").getByRole("button", { name: "Combined", exact: true }).click();
    await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
    await expect(inspector.getByRole("heading", { name: "Layout" })).toBeVisible();

    await expect(host).toHaveAttribute("data-canonical-revision", baseline.revision ?? "0");
    await expect(page.getByTestId("history-status")).toHaveText(baseline.history);
    await expect(page.getByTestId("dirty-status")).toHaveText(baseline.dirty);
    expect(pageErrors).toEqual([]);
  });
}
