import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { canonicalFixture } from "../fixtures/canonical.js";

test("hands a validated Open document to the new session without duplicate session validation", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");

  const downloadPromise = page.waitForEvent("download");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Save", exact: true }).click();
  const download = await downloadPromise;
  const savedPath = await download.path();
  expect(savedPath).toBeTruthy();

  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({
    name: "roundtrip.tcd.json",
    mimeType: "application/json",
    buffer: await readFile(savedPath!),
  });
  await expect(host).toHaveAttribute("data-editor-idle", "true");

  const counters = JSON.parse(await host.getAttribute("data-session-counters") ?? "null") as Record<string, number>;
  expect(counters.validationRuns).toBe(0);
  expect(counters.commits).toBe(0);
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
  await expect(page.getByTestId("dirty-status")).toHaveText("Clean");
});

test("rejects an oversized Open file before reading and preserves document state", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const before = {
    revision: await host.getAttribute("data-canonical-revision"),
    history: await page.getByTestId("history-status").textContent(),
    dirty: await page.getByTestId("dirty-status").textContent(),
    title: await page.locator(".app-titlebar h1").textContent(),
  };
  const oversized = Buffer.alloc(32 * 1024 * 1024 + 1, 0x20);
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "oversized.tcd.json", mimeType: "application/json", buffer: oversized });
  await expect(host).toHaveAttribute("data-canonical-revision", before.revision!);
  await expect(page.getByTestId("history-status")).toHaveText(before.history!);
  await expect(page.getByTestId("dirty-status")).toHaveText(before.dirty!);
  await expect(page.locator(".app-titlebar h1")).toHaveText(before.title!);
  await expect(page.getByTestId("problems-status")).toHaveText("Problems: 1");
  await expect(page.getByText(/Open rejected before parsing: oversized\.tcd\.json/)).toBeVisible();
});

test("rejects an over-budget canonical resource before session replacement", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const before = {
    revision: await host.getAttribute("data-canonical-revision"),
    history: await page.getByTestId("history-status").textContent(),
    dirty: await page.getByTestId("dirty-status").textContent(),
    title: await page.locator(".app-titlebar h1").textContent(),
  };
  const overBudget = JSON.parse(JSON.stringify(canonicalFixture())) as { timeline: { cycleCount: number; end: number } };
  overBudget.timeline.cycleCount = 100_001;
  overBudget.timeline.end = 100_001;
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "over-budget.tcd.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(overBudget)) });
  await expect(host).toHaveAttribute("data-canonical-revision", before.revision!);
  await expect(page.getByTestId("history-status")).toHaveText(before.history!);
  await expect(page.getByTestId("dirty-status")).toHaveText(before.dirty!);
  await expect(page.locator(".app-titlebar h1")).toHaveText(before.title!);
  await expect(page.getByTestId("problems-status")).toHaveText("Problems: 1");
  await expect(page.getByText(/Document resource limit exceeded for cycles/)).toBeVisible();
});
