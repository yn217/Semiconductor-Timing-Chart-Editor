import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const samplePath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../samples/acceptance-397/sample-a-basic-transaction-lifecycle.tcd.json");

test("Save/Open restores the useful Transaction surface before editor idle and preserves stable semantics", async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto("/");
  const surface = page.getByTestId("cycle-surface");
  await expect(surface).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(samplePath);
  await expect(surface).toHaveAttribute("data-editor-idle", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();

  const lanes = page.getByTestId("transaction-lanes");
  await expect(lanes.locator("[data-transaction-id]")).toHaveCount(4);
  await expect(lanes.locator("[data-transaction-id='txn_read0'] .transaction-phases small")).toHaveCount(3);

  const download = page.waitForEvent("download");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Save", exact: true }).click();
  const savedPath = await (await download).path();
  expect(savedPath).toBeTruthy();
  const saved = JSON.parse(readFileSync(savedPath!, "utf8")) as {
    transactions: readonly { id: string; name: string; startCycle: number; endCycle: number; phases?: readonly { id: string; name: string; startCycle: number; endCycle: number }[]; linkedSignals?: readonly string[] }[];
  };
  const expected = saved.transactions.find((item) => item.id === "txn_read0");
  expect(expected).toBeTruthy();

  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(savedPath!);
  await expect(surface).toHaveAttribute("data-editor-idle", "true");
  await expect(page.locator(".cycle-panel")).toHaveAttribute("data-view-mode", "Transaction");
  await expect(lanes.locator("[data-transaction-id]")).toHaveCount(saved.transactions.length);
  const restored = lanes.locator(`[data-transaction-id='${expected!.id}']`);
  await expect(restored).toBeVisible();
  await expect(restored).toContainText(expected!.name);
  await expect(restored.locator(".transaction-phases small")).toHaveCount(expected!.phases?.length ?? 0);

  const metrics = await surface.evaluate((element) => {
    const phases = JSON.parse(element.getAttribute("data-open-phase-marks") ?? "{}") as Record<string, number>;
    const counters = JSON.parse(element.getAttribute("data-session-counters") ?? "{}") as Record<string, number>;
    const lane = element.ownerDocument.querySelector<HTMLElement>("[data-testid='transaction-lanes']");
    return {
      mode: element.ownerDocument.querySelector<HTMLElement>(".cycle-panel")?.dataset.viewMode ?? "",
      idle: element.getAttribute("data-editor-idle") === "true",
      firstCorrectPaint: phases["first-correct-paint"],
      referenceGeometryReady: phases["reference-geometry-ready"],
      transactionFirstReadyAt: Number(lane?.dataset.transactionFirstReadyAt ?? NaN),
      projectionCalls: counters.projectionCalls ?? 0,
      documentEpoch: counters.documentEpoch ?? 0,
      projectionDocumentEpoch: counters.projectionDocumentEpoch ?? 0,
    };
  });
  console.log(JSON.stringify({ startupAfterOpen: metrics, phaseMarks: await surface.getAttribute("data-open-phase-marks"), phaseDurations: await surface.getAttribute("data-open-phase-durations") }));
  expect(metrics.mode).toBe("Transaction");
  expect(metrics.idle).toBe(true);
  expect(Number.isFinite(metrics.firstCorrectPaint)).toBe(true);
  expect(Number.isFinite(metrics.referenceGeometryReady)).toBe(true);
  expect(Number.isFinite(metrics.transactionFirstReadyAt)).toBe(true);
  expect(metrics.projectionCalls).toBeGreaterThan(0);
  expect(metrics.documentEpoch).toBe(metrics.projectionDocumentEpoch);

  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  await expect(page.locator(".cycle-panel")).toHaveAttribute("data-view-mode", "Cycle");
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  await expect(page.locator(".cycle-panel")).toHaveAttribute("data-view-mode", "Transaction");
  await expect(lanes.locator(`[data-transaction-id='${expected!.id}']`)).toBeVisible();
  console.log(JSON.stringify({ transactionId: expected!.id, startCycle: expected!.startCycle, endCycle: expected!.endCycle, phaseCount: expected!.phases?.length ?? 0, linkedSignalCount: expected!.linkedSignals?.length ?? 0, ...metrics }));
});
