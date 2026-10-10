import { expect, test } from "@playwright/test";

test("Combined: selecting a Transaction in the Tree after a Signal switches the Inspector to Transaction", async ({ page }) => {
  await page.goto("/?transaction-demo");
  await page.locator(".view-mode").getByRole("button", { name: "Combined", exact: true }).click();
  const inspector = page.getByTestId("inspector");
  await page.getByTestId("cycle-surface").locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  await expect(inspector.getByLabel("Inspector signal name", { exact: true })).toBeVisible();
  const history = await page.getByTestId("history-status").innerText();
  await page.getByTestId("transaction-left-tree").getByText("Read_0", { exact: true }).click();
  await expect(inspector.getByLabel("Transaction name")).toHaveValue("Read_0");
  await expect(page.getByTestId("history-status")).toHaveText(history);
});

test("Inspector follows active workspace context and retains hidden stable selection at 1280x720", async ({ page }) => {
  const viewport = { width: 1280, height: 720 };
  test.setTimeout(60_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.setViewportSize(viewport);
  await page.goto("/");

  const host = page.getByTestId("cycle-surface");
  const inspector = page.getByTestId("inspector");
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(page.getByTestId("view-mode-status")).toHaveText("Mode: Transaction");

  await page.getByTestId("transaction-lanes").locator("[data-transaction-id='demo_txn_spi']").click({ position: { x: 12, y: 4 } }); // the lower strip is the Phase hit target
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
  await expect(page.getByTestId("transaction-tree-title")).toHaveText("Transactions");
  await expect(page.getByTestId("transaction-tree-tab-signals")).toHaveCount(0);
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

test("Layout Inspector is reachable again after clearing the Transaction selection", async ({ page }) => {
  await page.goto("/?transaction-demo");
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  const heading = page.getByTestId("inspector").locator("h2, h3").first();
  await expect(heading).toHaveText("Layout");
  const history = await page.getByTestId("history-status").innerText();
  const row = page.getByTestId("transaction-left-tree-row-demo_txn_read");
  await row.click();
  await expect(heading).not.toHaveText("Layout");
  const tree = page.getByTestId("transaction-left-tree");
  const box = (await tree.boundingBox())!;
  await tree.click({ position: { x: 120, y: Math.min(box.height, 700) - 30 } });
  await expect(heading).toHaveText("Layout");
  await row.click();
  await expect(heading).not.toHaveText("Layout");
  await row.press("Escape");
  await expect(heading).toHaveText("Layout");
  await expect(page.getByTestId("history-status")).toHaveText(history);
});
