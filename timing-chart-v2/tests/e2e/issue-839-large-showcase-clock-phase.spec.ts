import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

for (const viewport of [{ width: 1672, height: 941 }, { width: 1280, height: 720 }]) {
test(`Large Feature Showcase remains renderable at ${viewport.width}x${viewport.height}`, async ({ page }) => {
  await page.setViewportSize(viewport);
  await page.goto("/");

  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  await expect(page.getByTestId("view-mode-status")).toHaveText("Mode: Cycle");
  await expect(page.getByTestId("wavedrom-status")).toHaveText("WaveDrom: Ready");

  const fixture = await readFile(new URL("../../samples/old/pre-reset-2026-10-02/showcase/21_large_feature_showcase.tcd.json", import.meta.url));
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({
    name: "21_large_feature_showcase.tcd.json",
    mimeType: "application/json",
    buffer: fixture,
  });

  await expect(page.getByRole("heading", { name: "Large Feature Showcase — 128 cycles / 48 signals" })).toBeVisible();
  await expect(page.locator(".editor-shell")).toHaveAttribute("data-signal-count", "48");
  await page.waitForFunction(() => [...document.querySelectorAll<HTMLElement>("[data-role='wave-owner'][data-signal-id]")]
    .every((owner) => owner.querySelector("svg, canvas[data-wave-canvas]") !== null || owner.hasAttribute("data-wave-error")), undefined, { timeout: 15_000 });
  for (const signalId of ["s.clk", "s.axiclk", "s.wclk", "s.por", "s.reqv"]) {
    await expect(host.locator(`[data-role='wave-owner'][data-signal-id='${signalId}'] > svg`)).toHaveCount(1);
  }
  await expect(host.locator("[data-role='wave-owner'][data-wave-error]")).toHaveCount(0);
  await expect(page.getByTestId("wavedrom-status")).toHaveText("WaveDrom: Ready");
  await expect(page.getByTestId("problems-status")).toHaveText("Problems: 0");

  const canonicalRevision = await host.getAttribute("data-canonical-revision");
  const history = await page.getByTestId("history-status").textContent();
  const cycleViewport = page.getByTestId("cycle-viewport");
  const verticalOverflow = await cycleViewport.evaluate((el) => el.scrollHeight > el.clientHeight);
  expect(verticalOverflow).toBe(true);
  const viewportBox = await cycleViewport.boundingBox();
  expect(viewportBox).not.toBeNull();
  await page.mouse.move(viewportBox!.x + viewportBox!.width / 2, viewportBox!.y + Math.min(40, viewportBox!.height / 2));
  await page.mouse.wheel(0, 500);
  await expect.poll(() => cycleViewport.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  await expect(page.getByTestId("wavedrom-status")).toHaveText("WaveDrom: Ready");
  await expect(page.getByTestId("problems-status")).toHaveText("Problems: 0");
  expect(await host.getAttribute("data-canonical-revision")).toBe(canonicalRevision);
  expect(await page.getByTestId("history-status").textContent()).toBe(history);
  await cycleViewport.evaluate(async (el) => { el.scrollTop = 0; await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))); });

  // Mode changes must not revive the batch failure or replace rows with stale
  // projections. Cycle is the primary surface for the clock geometry.
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  await expect(page.getByTestId("view-mode-status")).toHaveText("Mode: Transaction");
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  await expect(page.getByTestId("view-mode-status")).toHaveText("Mode: Cycle");
  await expect(host.locator("[data-role='wave-owner'][data-signal-id='s.clk'] > svg")).toHaveCount(1);
  await expect(page.getByTestId("wavedrom-status")).toHaveText("WaveDrom: Ready");

  // Production Save/Open must preserve the valid canonical sample and allow
  // its waveform geometry to be projected again.
  const download = page.waitForEvent("download");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Save", exact: true }).click();
  const savedPath = await (await download).path();
  expect(savedPath).toBeTruthy();
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(savedPath!);
  await expect(page.getByRole("heading", { name: "Large Feature Showcase — 128 cycles / 48 signals" })).toBeVisible();
  await expect(page.locator(".editor-shell")).toHaveAttribute("data-signal-count", "48");
  await expect(host.locator("[data-role='wave-owner'][data-signal-id='s.clk'] > svg")).toHaveCount(1);
  await expect(host.locator("[data-role='wave-owner'][data-wave-error]")).toHaveCount(0);
  await expect(page.getByTestId("problems-status")).toHaveText("Problems: 0");
});
}
