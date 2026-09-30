import { expect, test } from "@playwright/test";
import type { Annotation, AnnotationId, SignalId } from "@timing-chart-v2/schema";
import { generatePerformanceDocument } from "@timing-chart-v2/testing";

test("10k-signal Annotation Anchor and Marker row pickers keep DOM bounded and apply stable IDs", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");

  const base = generatePerformanceDocument({ signalCount: 10_000, cycleCount: 100 });
  const marker: Annotation = {
    id: "ann_marker_10k" as AnnotationId,
    type: "marker",
    label: "10k marker",
    visible: true,
    anchor: { signalId: "sig_perf_0" as SignalId, cycle: 5, point: "cycle-start" },
    verticalSpan: { mode: "rows", startRowId: "sig_perf_0" as SignalId, endRowId: "sig_perf_9999" as SignalId },
  };
  const document = { ...base, annotations: [...base.annotations, marker] };
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "annotation-picker-10k.tcd", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(document)) });
  await expect(page.locator(".editor-shell")).toHaveAttribute("data-signal-count", "10000", { timeout: 150_000 });
  await expect(host).toHaveAttribute("data-editor-idle", "true", { timeout: 150_000 });
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  await expect(page.getByTestId("view-mode-status")).toHaveText("Mode: Cycle");

  await page.getByRole("tablist", { name: "Bottom context panels" }).getByRole("tab", { name: "Annotation" }).click();
  const list = page.getByTestId("annotation-list");
  const measurementRow = list.locator("[data-annotation-list-id='ann_perf_0']");
  await measurementRow.click();
  const editor = page.getByTestId("annotation-editor");
  await expect(editor).toBeVisible();
  const historyBeforeDraft = await page.getByTestId("history-status").textContent();
  const startSignal = editor.getByRole("combobox", { name: "Inspector annotation anchor signal" });
  await startSignal.fill("signal_9999");
  const searchResults = editor.locator(".signal-id-picker-results [role='option']");
  await expect(searchResults.filter({ hasText: "SIG_9999" })).toHaveCount(1);
  expect(await searchResults.count(), "filtered result list must stay bounded").toBeLessThanOrEqual(51);
  await searchResults.filter({ hasText: "SIG_9999" }).click();
  await expect(startSignal).toHaveValue("SIG_9999");
  await expect(page.getByTestId("history-status")).toHaveText(historyBeforeDraft!);
  await editor.getByTestId("apply-inspector-annotation-anchor").click();
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  expect(await editor.locator(".signal-id-picker option").count()).toBe(0);

  const markerRow = list.locator("[data-annotation-list-id='ann_marker_10k']");
  await markerRow.click();
  const verticalSpan = editor.getByRole("region", { name: "Marker vertical span" });
  await expect(verticalSpan).toBeVisible();
  await expect(verticalSpan.locator(".signal-id-picker")).toHaveCount(2);
  expect(await verticalSpan.locator(".signal-id-picker option").count()).toBe(0);

  const startRow = verticalSpan.getByRole("combobox", { name: "Marker vertical span start row" });
  await startRow.fill("signal_9998");
  await expect(verticalSpan.locator(".signal-id-picker-results [role='option']").filter({ hasText: "SIG_9998" })).toHaveCount(1);
  expect(await verticalSpan.locator(".signal-id-picker-results [role='option']").count()).toBeLessThanOrEqual(51);
  await verticalSpan.locator(".signal-id-picker-results [role='option']").filter({ hasText: "SIG_9998" }).click();

  const endRow = verticalSpan.getByRole("combobox", { name: "Marker vertical span end row" });
  await endRow.fill("signal_9999");
  await expect(verticalSpan.locator(".signal-id-picker-results [role='option']").filter({ hasText: "SIG_9999" })).toHaveCount(1);
  await verticalSpan.locator(".signal-id-picker-results [role='option']").filter({ hasText: "SIG_9999" }).click();
  expect(await verticalSpan.locator(".signal-id-picker-results [role='option']").count()).toBeLessThanOrEqual(51);
  await page.getByTestId("apply-marker-vertical-span").click();
  await expect(page.getByTestId("history-status")).toHaveText("History 2 / Redo 0");
  await expect(page.getByTestId("dirty-status")).toHaveText("Modified");

  const savePromise = page.waitForEvent("download");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Save", exact: true }).click();
  const savedFile = await savePromise;
  const savedPath = await savedFile.path();
  expect(savedPath).toBeTruthy();
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(savedPath!);
  await expect(host).toHaveAttribute("data-editor-idle", "true", { timeout: 30_000 });

  const reopenedMarker = page.getByTestId("annotation-list").locator("[data-annotation-list-id='ann_marker_10k']");
  await reopenedMarker.click();
  const reopenedSpan = page.getByTestId("inspector").getByRole("region", { name: "Marker vertical span" });
  await expect(reopenedSpan.getByRole("combobox", { name: "Marker vertical span start row" })).toHaveValue("SIG_9998");
  await expect(reopenedSpan.getByRole("combobox", { name: "Marker vertical span end row" })).toHaveValue("SIG_9999");
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
});
