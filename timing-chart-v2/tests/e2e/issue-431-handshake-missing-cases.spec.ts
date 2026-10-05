import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { scenarioModelFromV2, serializeScenarioDocumentModel } from "@timing-chart-v2/schema";
import { generatePerformanceDocument } from "@timing-chart-v2/testing";

function handshakeScenarioDocument() {
  const base = generatePerformanceDocument({ signalCount: 4, cycleCount: 24, profile: "standard" });
  const template = base.signals[1]!;
  const request = { ...template, id: "sig_req", name: "REQ", type: "binary", values: [{ start: 0, value: 0 }] };
  const acknowledge = { ...template, id: "sig_ack", name: "ACK", type: "binary", values: [{ start: 0, value: 0 }] };
  const signals = [base.signals[0]!, request, acknowledge] as unknown as typeof base.signals;
  const v2 = { ...base, signals, signalGroups: [{ ...base.signalGroups[0]!, rows: signals.map((signal) => signal.id) }], constraints: [{ id: "constraint_handshake", type: "handshake", data: { requestSignalId: "sig_req", acknowledgeSignalId: "sig_ack" } }] };
  return scenarioModelFromV2(v2);
}

test("Handshake missing cases are suggestions until selected, then save and undo as one Scenario batch", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");
  const model = handshakeScenarioDocument();
  const original = model.scenarios[0]!;
  const fileInput = page.locator("input[type='file'][accept='.json,.tcd']");
  await fileInput.setInputFiles({ name: "handshake-scenarios.tcd", mimeType: "application/json", buffer: Buffer.from(serializeScenarioDocumentModel(model)) });
  const surface = page.getByTestId("cycle-surface");
  await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 60_000 });
  await page.locator(".bottom-tabs").getByRole("tab", { name: "AI", exact: true }).click();
  const panel = page.getByTestId("ai-operation-panel");
  const suggestions = page.getByTestId("handshake-case-suggestions");
  await expect(suggestions.getByRole("checkbox")).toHaveCount(5);
  const before = {
    revision: await surface.getAttribute("data-canonical-revision"),
    history: await page.getByTestId("history-status").textContent(),
    dirty: await page.getByTestId("dirty-status").textContent(),
  };
  await suggestions.getByRole("checkbox", { name: "Request and acknowledge together" }).check();
  await suggestions.getByRole("checkbox", { name: "Backpressure" }).check();
  await expect(surface).toHaveAttribute("data-canonical-revision", before.revision!);
  await expect(page.getByTestId("history-status")).toHaveText(before.history!);
  await expect(page.getByTestId("dirty-status")).toHaveText(before.dirty!);

  await suggestions.getByTestId("create-selected-handshake-scenarios").click();
  const activeScenario = page.getByTestId("active-scenario");
  await expect(activeScenario.locator("option")).toHaveCount(3);
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await expect(page.getByTestId("dirty-status")).toHaveText("Modified");
  const selectedId = await activeScenario.inputValue();
  expect(selectedId).not.toBe(original.id);
  const download = page.waitForEvent("download");
  await page.getByTestId("ribbon").getByRole("button", { name: "Save", exact: true }).first().click();
  const savedBytes = await readFile((await (await download).path())!);
  const saved = JSON.parse(savedBytes.toString("utf8")) as { scenarios: { id: string; name: string; constraints: unknown[]; signalStates: Record<string, { kind: string; values?: { start: number; value: number | string }[] }> }[] };
  expect(saved.scenarios).toHaveLength(3);
  expect(saved.scenarios.find((scenario) => scenario.id === selectedId)?.constraints).toHaveLength(1);
  expect(saved.scenarios.find((scenario) => scenario.id === selectedId)?.signalStates.sig_req?.values).toContainEqual({ start: 0, value: 1 });
  await expect(page.getByTestId("dirty-status")).toHaveText("Clean");

  await page.getByTestId("ribbon").getByRole("button", { name: "Undo", exact: true }).click();
  await expect(activeScenario.locator("option")).toHaveCount(1);
  await expect(activeScenario).toHaveValue(original.id);
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 1");
  await expect(page.getByTestId("dirty-status")).toHaveText("Modified");
  await page.getByTestId("ribbon").getByRole("button", { name: "Redo", exact: true }).click();
  await expect(activeScenario.locator("option")).toHaveCount(3);
  await expect(activeScenario).toHaveValue(selectedId);
  await expect(page.getByTestId("dirty-status")).toHaveText("Clean");

  await page.getByTestId("ribbon").getByRole("button", { name: "New", exact: true }).first().click();
  await fileInput.setInputFiles({ name: "saved-handshake-scenarios.tcd", mimeType: "application/json", buffer: savedBytes });
  await expect(page.getByTestId("active-scenario").locator("option")).toHaveCount(3);
  await expect(page.getByTestId("active-scenario")).toHaveValue(original.id);
  await expect(panel).toContainText("Handshake coverage suggestions");
  await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 60_000 });
});
