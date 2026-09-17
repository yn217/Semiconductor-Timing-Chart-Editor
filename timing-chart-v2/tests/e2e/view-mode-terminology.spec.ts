import { expect, test } from "@playwright/test";

test("Production names Combined as a keyboard-accessible view mode distinct from Cycle Signal Split", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const revision = await host.getAttribute("data-canonical-revision");
  const history = await page.getByTestId("history-status").textContent();
  const dirty = await page.getByTestId("dirty-status").textContent();
  const modeSelector = page.locator(".view-mode");
  const cycle = modeSelector.getByRole("button", { name: "Cycle", exact: true });
  const transaction = modeSelector.getByRole("button", { name: "Transaction", exact: true });
  const combined = modeSelector.getByRole("button", { name: "Combined", exact: true });
  await expect(cycle).toBeVisible();
  await expect(transaction).toBeVisible();
  await expect(combined).toBeVisible();
  await expect(modeSelector.getByRole("button", { name: "Split", exact: true })).toHaveCount(0);
  await expect(combined).toHaveAttribute("title", "Combined Cycle + Transaction view");

  await combined.focus();
  await page.keyboard.press("Enter");
  await expect(combined).toHaveClass(/active/);
  await expect(page.getByTestId("view-mode-status")).toHaveText("Mode: Combined");
  await expect(page.getByTestId("titlebar-view-title")).toHaveText("Combined View");
  await expect(page.locator(".cycle-panel")).toHaveAttribute("aria-label", "Combined View");
  const transactionPane = page.getByLabel("Transaction pane", { exact: true });
  const cyclePane = page.locator(".split-signal-content");
  await expect(transactionPane).toBeVisible();
  await expect(cyclePane).toBeVisible();
  const transactionBox = await transactionPane.boundingBox();
  const cycleBox = await cyclePane.boundingBox();
  expect(transactionBox).not.toBeNull();
  expect(cycleBox).not.toBeNull();
  expect(transactionBox!.y + transactionBox!.height).toBeLessThan(cycleBox!.y);
  await expect(page.getByLabel("Signal Split", { exact: true })).toHaveCount(0);

  await cycle.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("view-mode-status")).toHaveText("Mode: Cycle");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
  const signalSplit = page.getByLabel("Signal Split", { exact: true });
  await expect(signalSplit).toBeVisible();
  await expect(signalSplit).toHaveAttribute("title", "Show two vertically independent views of the same Cycle signal list.");

  await transaction.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("view-mode-status")).toHaveText("Mode: Transaction");
  await expect(signalSplit).toHaveCount(0);
  await expect(host).toHaveAttribute("data-canonical-revision", revision!);
  await expect(page.getByTestId("history-status")).toHaveText(history!);
  await expect(page.getByTestId("dirty-status")).toHaveText(dirty!);
});
