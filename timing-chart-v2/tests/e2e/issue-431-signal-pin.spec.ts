import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { startInCycleMode } from "./cycle-startup.js";

startInCycleMode(test);

const samplePath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../samples/old/pre-reset-2026-10-02/showcase/21_large_feature_showcase.tcd.json");

test("pinned Signal stays at the viewport top with its waveform row aligned and view-only state unchanged", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(samplePath);
  const surface = page.getByTestId("cycle-surface");
  await expect(surface).toHaveAttribute("data-editor-idle", "true");
  const row = surface.locator("[data-role='frozen-row'][data-row-id='s.reqv']");
  const wave = surface.locator("[data-role='wave-owner'][data-signal-id='s.reqv']");
  await expect(row).toBeVisible();
  await row.click();
  await row.click({ button: "right" });
  await page.getByRole("menuitemcheckbox", { name: "Pin selected Signals" }).click();
  await row.click({ button: "right" });
  await expect(page.getByRole("menuitemcheckbox", { name: "Unpin selected Signals" })).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("Escape");

  const before = {
    revision: await surface.getAttribute("data-canonical-revision"),
    history: await page.getByTestId("history-status").innerText(),
    dirty: await page.getByTestId("dirty-status").innerText(),
  };
  const viewport = page.getByTestId("cycle-viewport");
  const beforeViewport = await viewport.boundingBox();
  expect(beforeViewport).not.toBeNull();
  await page.mouse.move(beforeViewport!.x + 100, beforeViewport!.y + beforeViewport!.height / 2);
  await page.mouse.wheel(0, 560);
  await expect.poll(() => viewport.evaluate((element) => element.scrollTop)).toBeGreaterThan(100);
  await expect(row).toHaveAttribute("data-pinned-row", "true");
  await expect(wave).toHaveAttribute("data-pinned-row", "true");
  await expect.poll(async () => {
    const current = await row.boundingBox();
    return current === null ? Number.POSITIVE_INFINITY : current.y - beforeViewport!.y;
  }).toBeGreaterThanOrEqual(0);
  await expect.poll(async () => {
    const current = await row.boundingBox();
    return current === null ? Number.POSITIVE_INFINITY : current.y - beforeViewport!.y;
  }).toBeLessThanOrEqual(80);
  await expect.poll(async () => Math.abs((await wave.boundingBox())!.y - (await row.boundingBox())!.y)).toBeLessThanOrEqual(3);
  await expect(row).toHaveAttribute("data-pinned-row", "true");
  await expect(wave).toHaveAttribute("data-pinned-row", "true");
  await expect(surface).toHaveAttribute("data-canonical-revision", before.revision!);
  await expect(page.getByTestId("history-status")).toHaveText(before.history);
  await expect(page.getByTestId("dirty-status")).toHaveText(before.dirty);

  await row.click({ button: "right" });
  await page.getByRole("menuitemcheckbox", { name: "Unpin selected Signals" }).click();
  await page.mouse.move(beforeViewport!.x + 100, beforeViewport!.y + beforeViewport!.height / 2);
  await page.mouse.wheel(0, -1_500);
  await expect.poll(() => viewport.evaluate((element) => element.scrollTop)).toBe(0);
  await expect(row).toHaveAttribute("data-pinned-row", "false");
  await expect(wave).toHaveAttribute("data-pinned-row", "false");
});

test("multiple pinned Signals retain stable row-to-wave alignment through vertical scroll", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");
  const surface = page.getByTestId("cycle-surface");
  await expect(surface).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(samplePath);
  await expect(surface).toHaveAttribute("data-editor-idle", "true");

  const pinnedIds = ["s.reqv", "s.reqr"];
  const rows = pinnedIds.map((id) => surface.locator(`[data-role='frozen-row'][data-row-id='${id}']`));
  const waves = pinnedIds.map((id) => surface.locator(`[data-role='wave-owner'][data-signal-id='${id}']`));
  await rows[0]!.click();
  await rows[1]!.click({ modifiers: ["Control"] });
  await rows[1]!.click({ button: "right" });
  await page.getByRole("menuitemcheckbox", { name: "Pin selected Signals" }).click();

  const before = {
    revision: await surface.getAttribute("data-canonical-revision"),
    history: await page.getByTestId("history-status").innerText(),
    dirty: await page.getByTestId("dirty-status").innerText(),
  };
  const viewport = page.getByTestId("cycle-viewport");
  const viewportBox = await viewport.boundingBox();
  expect(viewportBox).not.toBeNull();
  await page.mouse.move(viewportBox!.x + 100, viewportBox!.y + viewportBox!.height / 2);
  await page.mouse.wheel(0, 700);
  await expect.poll(() => viewport.evaluate((element) => element.scrollTop)).toBeGreaterThan(100);

  for (let index = 0; index < pinnedIds.length; index += 1) {
    await expect(rows[index]!).toHaveAttribute("data-pinned-row", "true");
    await expect(waves[index]!).toHaveAttribute("data-pinned-row", "true");
    await expect.poll(async () => Math.abs((await rows[index]!.boundingBox())!.y - (await waves[index]!.boundingBox())!.y)).toBeLessThanOrEqual(3);
    await expect.poll(async () => (await rows[index]!.boundingBox())!.y - viewportBox!.y).toBeGreaterThanOrEqual(0);
  }
  await expect(surface).toHaveAttribute("data-canonical-revision", before.revision!);
  await expect(page.getByTestId("history-status")).toHaveText(before.history);
  await expect(page.getByTestId("dirty-status")).toHaveText(before.dirty);
});
