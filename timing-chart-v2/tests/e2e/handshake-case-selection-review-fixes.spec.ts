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

test("Handshake case selections are cleared when the active Scenario changes", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");
  const model = handshakeScenarioDocument();
  const original = model.scenarios[0]!;
  const fileInput = page.locator("input[type='file'][accept='.json,.tcd']");
  await fileInput.setInputFiles({ name: "handshake-selection.tcd", mimeType: "application/json", buffer: Buffer.from(serializeScenarioDocumentModel(model)) });
  const surface = page.getByTestId("cycle-surface");
  await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 60_000 });
  await page.locator(".bottom-tabs").getByRole("tab", { name: "AI", exact: true }).click();
  const suggestions = page.getByTestId("handshake-case-suggestions");
  const activeScenario = page.getByTestId("active-scenario");

  // Create one generated Scenario so there are two Scenarios to switch between.
  await suggestions.getByRole("checkbox", { name: "Request and acknowledge together" }).check();
  await suggestions.getByTestId("create-selected-handshake-scenarios").click();
  await expect(activeScenario.locator("option")).toHaveCount(2);
  const generatedId = await activeScenario.inputValue();
  expect(generatedId).not.toBe(original.id);

  // Select a case in the generated Scenario, then switch back to the original.
  await suggestions.getByRole("checkbox", { name: "Backpressure" }).check();
  await expect(suggestions.getByRole("checkbox", { name: "Backpressure" })).toBeChecked();
  await activeScenario.selectOption(original.id);
  await expect(activeScenario).toHaveValue(original.id);

  // The stale selection from the other Scenario must not survive the switch.
  await expect(suggestions.getByRole("checkbox", { name: "Backpressure" })).not.toBeChecked();
  await expect(suggestions.getByTestId("create-selected-handshake-scenarios")).toBeDisabled();
  await expect(activeScenario.locator("option")).toHaveCount(2);
  await expect(page.getByTestId("ai-operation-panel")).not.toContainText("Unknown or unsupported Handshake case suggestion");
});
