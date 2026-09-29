import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

for (const viewport of [{ width: 1672, height: 941 }, { width: 1280, height: 720 }]) {
test(`Cycle range and cursor status remain truthful after switching to the Transaction time axis at ${viewport.width}x${viewport.height}`, async ({ page }) => {
  await page.setViewportSize(viewport);
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();

  const fixture = await readFile(new URL("../../samples/showcase/21_large_feature_showcase.tcd.json", import.meta.url));
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({
    name: "21_large_feature_showcase.tcd.json",
    mimeType: "application/json",
    buffer: fixture,
  });
  await expect(page.getByRole("heading", { name: "Large Feature Showcase — 128 cycles / 48 signals" })).toBeVisible();

  // Use the production Cycle ruler to establish a semantic source-cycle range.
  await page.getByTestId("cycle-ruler").locator("[data-cycle='4']").click();
  await page.getByTestId("cycle-ruler").locator("[data-cycle='6']").click({ modifiers: ["Shift"] });
  await expect(page.getByTestId("range-status")).toHaveText("Range: [4, 7)");
  await expect(page.getByTestId("cycle-status")).toHaveText("Cycle 6");

  const revision = await host.getAttribute("data-canonical-revision");
  const history = await page.getByTestId("history-status").textContent();
  const dirty = await page.getByTestId("dirty-status").textContent();
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  await expect(page.getByTestId("view-mode-status")).toHaveText("Mode: Transaction");

  // The Cycle selection may be cleared or explicitly projected, but the
  // Transaction-axis status must not present raw source cycles as TC values.
  await expect(page.getByTestId("range-status")).toHaveText("Source range: [4, 7)");
  await expect(page.getByTestId("cycle-status")).toHaveText("Source cycle 6");
  await expect(page.getByTestId("tool-status")).toHaveText("Source range select active");

  const bars = page.getByTestId("transaction-lanes").locator("[data-transaction-id]");
  await expect(bars).toHaveCount(6);
  for (const bar of await bars.all()) {
    const box = await bar.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThan(0);
  }
  expect(await host.getAttribute("data-canonical-revision")).toBe(revision);
  expect(await page.getByTestId("history-status").textContent()).toBe(history);
  expect(await page.getByTestId("dirty-status").textContent()).toBe(dirty);
});
}
