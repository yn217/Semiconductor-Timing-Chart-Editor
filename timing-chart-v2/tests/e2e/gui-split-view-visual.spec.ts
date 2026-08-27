import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

test("captures the V1 Split View composition with both contexts and zero view mutation", async ({ page }) => {
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto("/");
  const surface = page.getByTestId("cycle-surface");
  await expect(surface).toHaveAttribute("data-cycle-view-ready", "true");
  await page.getByRole("button", { name: "Transaction", exact: true }).click();
  await page.locator(".bottom-tabs").getByRole("button", { name: "Transaction", exact: true }).click();
  await page.getByLabel("New Transaction name").fill("Split View Read");
  await page.getByLabel("New Transaction start").fill("2");
  await page.getByLabel("New Transaction end").fill("7");
  await page.getByRole("button", { name: "Create Transaction", exact: true }).click();
  await expect(surface).toHaveAttribute("data-editor-idle", "true");

  const before = {
    revision: await surface.getAttribute("data-canonical-revision"),
    history: await surface.getAttribute("data-history-depth"),
    dirty: await page.getByTestId("dirty-status").textContent(),
    counters: await surface.locator("[data-role='timing-chart-surface']").getAttribute("data-render-counters"),
  };
  await page.getByRole("button", { name: "Split", exact: true }).click();
  await expect(page.locator(".cycle-panel")).toHaveAttribute("data-view-mode", "Split");
  await expect(page.getByTestId("transaction-lanes")).toBeVisible();
  await expect(surface).toBeVisible();
  await expect(page.locator(".bottom-tabs").getByRole("button", { name: "Signal", exact: true })).toBeVisible();
  await expect(page.locator(".bottom-tabs").getByRole("button", { name: "Transaction", exact: true })).toBeVisible();
  await mkdir(resolve(process.cwd(), "..", "artifacts", "gui-split-view"), { recursive: true });
  await page.screenshot({ path: resolve(process.cwd(), "..", "artifacts", "gui-split-view", "split-1672x941.png"), animations: "disabled" });

  await expect(surface).toHaveAttribute("data-canonical-revision", before.revision!);
  await expect(surface).toHaveAttribute("data-history-depth", before.history!);
  await expect(page.getByTestId("dirty-status")).toHaveText(before.dirty!);
  await expect(surface.locator("[data-role='timing-chart-surface']")).toHaveAttribute("data-render-counters", before.counters!);
});
