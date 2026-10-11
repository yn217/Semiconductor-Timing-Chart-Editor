import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { generatePerformanceDocument } from "@timing-chart-v2/testing";

function setupHoldDocument() {
  const base = generatePerformanceDocument({ signalCount: 4, cycleCount: 16, profile: "standard" });
  const data = { id: "sig_setup_data", name: "DATA", type: "binary", role: "internal", source: { instancePath: ["top"], signalName: "DATA" }, display: { name: "DATA" }, values: [{ start: 0, value: 0 }, { start: 1, value: 1 }] };
  const capture = { id: "sig_setup_capture", name: "CAPTURE", type: "binary", role: "input", source: { instancePath: ["top"], signalName: "CAPTURE" }, display: { name: "CAPTURE" }, values: [{ start: 0, value: 0 }, { start: 2, value: 1 }] };
  const signals = [base.signals[0]!, data, capture];
  return { ...base, signals, signalGroups: [{ ...base.signalGroups[0]!, rows: signals.map((signal) => signal.id) }], constraints: [] };
}

test("Setup constraint is created through Review, produces navigable Problem, and saves canonical semantics", async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");
  const surface = page.getByTestId("cycle-surface");
  await expect(surface).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "setup-hold-1119.tcd.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(setupHoldDocument())) });
  await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 60_000 });
  await page.getByRole("button", { name: "Check", exact: true }).click();
  const editor = page.getByTestId("review-constraint-editor");
  await editor.locator("summary").click();
  await editor.getByLabel("Constraint kind").selectOption("setup");
  await editor.getByLabel("Setup/Hold Data Signal").selectOption("sig_setup_data");
  await editor.getByLabel("Setup/Hold capture Clock/Signal").selectOption("sig_setup_capture");
  await editor.getByLabel("Setup/Hold minimum cycles").fill("2");
  await editor.getByRole("button", { name: "Add setup constraint" }).click();
  await expect(editor.getByTestId("constraint-status")).toHaveText("Setup constraint added.");
  await expect(page.getByTestId("history-status")).toHaveText(/History 1 \/ Redo 0/);
  const constraintRow = editor.locator("li[data-constraint-id]");
  await expect.poll(() => constraintRow.count()).toBe(1);
  const constraintId = await constraintRow.getAttribute("data-constraint-id");
  await page.getByRole("button", { name: "Problems", exact: true }).click();
  await expect(page.getByTestId("problems-panel")).toContainText("SETUP_TIME_VIOLATION");
  const problem = page.getByTestId("problems-panel").getByRole("button", { name: "SETUP_TIME_VIOLATION" });
  await expect(problem).toBeVisible();
  await problem.click();
  await expect(page.getByTestId("cycle-status")).toHaveText("Source cycle 2");
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Home", exact: true }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  const download = await downloadEvent;
  const path = await download.path();
  expect(path).toBeTruthy();
  const saved = JSON.parse(await readFile(path!, "utf8")) as { constraints?: readonly { id: string; type: string; data?: Record<string, unknown> }[] };
  expect(saved.constraints).toEqual([expect.objectContaining({ id: constraintId, type: "setup", data: { dataSignalId: "sig_setup_data", captureSignalId: "sig_setup_capture", captureEdge: "rising", minCycles: 2 } })]);
});
