import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { scenarioModelFromV2, serializeScenarioDocumentModel } from "@timing-chart-v2/schema";
import { generatePerformanceDocument } from "@timing-chart-v2/testing";

function handshakeScenarioDocument() {
  const base = generatePerformanceDocument({ signalCount: 4, cycleCount: 24, profile: "standard" });
  const template = base.signals[1]!;
  const request = { ...template, id: "sig_req", name: "REQ", type: "binary", values: [{ start: 0, value: 0 }] };
  const acknowledge = { ...template, id: "sig_ack", name: "ACK", type: "binary", values: [{ start: 0, value: 0 }] };
  const signals = [base.signals[0]!, request, acknowledge].map((signal, signalIndex) => {
    if (signal.type === "clock") return { ...signal, enable: signal.enable?.map((change, changeIndex) => ({ ...change, id: `source_enable_${signalIndex}_${changeIndex}` })) };
    if (signal.type === "commentRow") return signal;
    return { ...signal, values: signal.values.map((change, changeIndex) => ({ ...change, id: `source_value_${signalIndex}_${changeIndex}` })) };
  }) as unknown as typeof base.signals;
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

  // The Signal Event Table belongs to Cycle mode; the application may restore
  // Transaction as its initial view from persisted workspace preferences.
  await page.getByRole("button", { name: "Cycle", exact: true }).click();
  await page.getByTestId("bottom-tabs").getByRole("tab", { name: "Signal", exact: true }).click();
  await surface.locator("[data-role='frozen-row'][data-row-id='sig_req']").click();
  const eventEditor = page.getByTestId("signal-editor");
  const eventRows = eventEditor.locator("form.event-row");
  await expect.poll(() => eventRows.count()).toBeGreaterThan(1);
  const generatedIds = await eventRows.evaluateAll((rows) => rows.map((row) => row.getAttribute("data-event-id")));
  expect(generatedIds.every((id) => typeof id === "string" && id.length > 0)).toBe(true);
  expect(new Set(generatedIds).size).toBe(generatedIds.length);

  // Prove identity is independent of Start through the production editor:
  // create at a free cycle, move that same row to another free cycle, then
  // reuse its original Start.
  const firstFreeStart = 20;
  const secondFreeStart = 21;
  await expect(eventEditor.locator(`form.event-row[data-event-start='${firstFreeStart}']`)).toHaveCount(0);
  await expect(eventEditor.locator(`form.event-row[data-event-start='${secondFreeStart}']`)).toHaveCount(0);
  const newStart = eventEditor.getByLabel("New event start", { exact: true });
  await newStart.fill(String(firstFreeStart));
  await eventEditor.getByTestId("add-signal-event").click();
  const temporaryRow = eventEditor.locator(`form.event-row[data-event-start='${firstFreeStart}']`);
  await expect(temporaryRow).toHaveCount(1);
  const movedStableId = await temporaryRow.getAttribute("data-event-id");
  await temporaryRow.getByTestId(`event-row-start-${firstFreeStart}`).fill(String(secondFreeStart));
  await temporaryRow.getByRole("button", { name: "Apply", exact: true }).click();
  const movedTemporaryRow = eventEditor.locator(`form.event-row[data-event-id='${movedStableId}']`);
  await expect(movedTemporaryRow).toHaveAttribute("data-event-start", String(secondFreeStart));
  await newStart.fill(String(firstFreeStart));
  await eventEditor.getByTestId("add-signal-event").click();
  const reusedStartRow = eventEditor.locator(`form.event-row[data-event-start='${firstFreeStart}']`);
  await expect(reusedStartRow).toHaveCount(1);
  const reusedStartId = await reusedStartRow.getAttribute("data-event-id");
  expect(reusedStartId).not.toBe(movedStableId);
  const afterStartReuse = await eventRows.evaluateAll((rows) => rows.map((row) => row.getAttribute("data-event-id")));
  expect(new Set(afterStartReuse).size).toBe(afterStartReuse.length);
  await eventEditor.getByTestId("editor-undo").click();
  await expect(eventEditor.locator(`form.event-row[data-event-id='${reusedStartId}']`)).toHaveCount(0);
  await eventEditor.getByTestId("editor-redo").click();
  await expect(eventEditor.locator(`form.event-row[data-event-id='${reusedStartId}']`)).toHaveAttribute("data-event-start", String(firstFreeStart));
  await eventEditor.getByTestId("editor-undo").click();
  await eventEditor.getByTestId("editor-undo").click();
  await eventEditor.getByTestId("editor-undo").click();
  await expect.poll(() => eventRows.evaluateAll((rows) => rows.map((row) => row.getAttribute("data-event-id")))).toEqual(generatedIds);

  // Copying a row allocates a fresh stable ID; Undo/Redo restores that exact ID.
  const duplicateSource = eventEditor.locator(`form.event-row[data-event-id='${generatedIds[0]}']`);
  await duplicateSource.getByRole("button", { name: /Duplicate transition at cycle/ }).click();
  await expect(eventRows).toHaveCount(generatedIds.length + 1);
  const afterDuplicateIds = await eventRows.evaluateAll((rows) => rows.map((row) => row.getAttribute("data-event-id")));
  const [duplicatedId] = afterDuplicateIds.filter((id) => !generatedIds.includes(id));
  expect(duplicatedId).toBeTruthy();
  expect(new Set(afterDuplicateIds).size).toBe(afterDuplicateIds.length);
  await eventEditor.getByTestId("editor-undo").click();
  await expect.poll(() => eventRows.evaluateAll((rows) => rows.map((row) => row.getAttribute("data-event-id")))).toEqual(generatedIds);
  await eventEditor.getByTestId("editor-redo").click();
  await expect(eventEditor.locator(`form.event-row[data-event-id='${duplicatedId}']`)).toHaveCount(1);
  await eventEditor.getByTestId("editor-undo").click();
  await expect.poll(() => eventRows.evaluateAll((rows) => rows.map((row) => row.getAttribute("data-event-id")))).toEqual(generatedIds);

  const movedId = generatedIds[1]!;
  await eventEditor.getByLabel("Select transition 2", { exact: true }).check();
  await eventEditor.getByTestId("event-move-up").click();
  const movedIds = await eventRows.evaluateAll((rows) => rows.map((row) => row.getAttribute("data-event-id")));
  expect(movedIds).toEqual([movedId, ...generatedIds.filter((id) => id !== movedId)]);
  await eventEditor.getByTestId("editor-undo").click();
  await expect.poll(() => eventRows.evaluateAll((rows) => rows.map((row) => row.getAttribute("data-event-id")))).toEqual(generatedIds);
  await eventEditor.getByTestId("editor-redo").click();
  await expect.poll(() => eventRows.evaluateAll((rows) => rows.map((row) => row.getAttribute("data-event-id")))).toEqual(movedIds);
  await eventEditor.getByTestId("editor-undo").click();
  await expect.poll(() => eventRows.evaluateAll((rows) => rows.map((row) => row.getAttribute("data-event-id")))).toEqual(generatedIds);

  const editedRow = eventEditor.locator(`form.event-row[data-event-id='${movedId}']`);
  const movedStart = await editedRow.getAttribute("data-event-start");
  const originalComment = await editedRow.getByLabel(`Comment ${movedStart}`).inputValue();
  await editedRow.getByLabel(`Comment ${movedStart}`).fill("edited generated transition by stable ID");
  await editedRow.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(editedRow.getByLabel(`Comment ${movedStart}`)).toHaveValue("edited generated transition by stable ID");
  await eventEditor.getByTestId("editor-undo").click();
  await expect(editedRow.getByLabel(`Comment ${movedStart}`)).toHaveValue(originalComment);
  await eventEditor.getByTestId("editor-redo").click();
  await expect(editedRow.getByLabel(`Comment ${movedStart}`)).toHaveValue("edited generated transition by stable ID");
  await eventEditor.getByTestId("editor-undo").click();
  await expect(editedRow.getByLabel(`Comment ${movedStart}`)).toHaveValue(originalComment);

  const deletedId = generatedIds[0]!;
  const deletedRow = eventEditor.locator(`form.event-row[data-event-id='${deletedId}']`);
  const deletedStart = await deletedRow.getAttribute("data-event-start");
  await deletedRow.getByRole("button", { name: `Delete transition at cycle ${deletedStart}`, exact: true }).click();
  await expect(eventEditor.locator(`form.event-row[data-event-id='${deletedId}']`)).toHaveCount(0);
  await eventEditor.getByTestId("editor-undo").click();
  await expect(eventEditor.locator(`form.event-row[data-event-id='${deletedId}']`)).toHaveAttribute("data-event-start", deletedStart!);
  await eventEditor.getByTestId("editor-redo").click();
  await expect(eventEditor.locator(`form.event-row[data-event-id='${deletedId}']`)).toHaveCount(0);
  await eventEditor.getByTestId("editor-undo").click();
  await expect.poll(() => eventRows.evaluateAll((rows) => rows.map((row) => row.getAttribute("data-event-id")))).toEqual(generatedIds);
  // Each edit/undo leaves its own single redo slot while returning canonical
  // data to the one scenario-creation history unit.
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 1");

  const download = page.waitForEvent("download");
  await page.getByTestId("ribbon").getByRole("button", { name: "Save", exact: true }).first().click();
  const savedBytes = await readFile((await (await download).path())!);
  const saved = JSON.parse(savedBytes.toString("utf8")) as { scenarios: { id: string; name: string; constraints: unknown[]; signalStates: Record<string, { kind: string; values?: { id?: string; start: number; value: number | string }[]; enable?: { id?: string; start: number; value: number | string }[] }> }[] };
  expect(saved.scenarios).toHaveLength(3);
  expect(saved.scenarios.find((scenario) => scenario.id === selectedId)?.constraints).toHaveLength(1);
  expect(saved.scenarios.find((scenario) => scenario.id === selectedId)?.signalStates.sig_req?.values).toContainEqual(expect.objectContaining({ start: 0, value: 1 }));
  const allChangeIds = saved.scenarios.flatMap((scenario) => Object.values(scenario.signalStates).flatMap((state) => state.kind === "clock" ? state.enable ?? [] : state.values ?? []).map((change) => change.id));
  expect(allChangeIds.every((id) => typeof id === "string" && id.length > 0)).toBe(true);
  expect(new Set(allChangeIds).size).toBe(allChangeIds.length);
  expect(saved.scenarios.find((scenario) => scenario.id === selectedId)?.signalStates.sig_req?.values?.map((change) => change.id)).toEqual(generatedIds);
  await expect(page.getByTestId("dirty-status")).toHaveText("Clean");

  await page.getByTestId("ribbon").getByRole("button", { name: "Undo", exact: true }).click();
  await expect(activeScenario.locator("option")).toHaveCount(1);
  await expect(activeScenario).toHaveValue(original.id);
  await expect(page.getByTestId("history-status")).toHaveText(/^History 0 \/ Redo \d+$/);
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
  await page.getByTestId("active-scenario").selectOption(selectedId);
  await page.getByRole("button", { name: "Cycle", exact: true }).click();
  await page.getByTestId("bottom-tabs").getByRole("tab", { name: "Signal", exact: true }).click();
  await surface.locator("[data-role='frozen-row'][data-row-id='sig_req']").click();
  const reopenedEventEditor = page.getByTestId("signal-editor");
  await expect.poll(() => reopenedEventEditor.locator("form.event-row").evaluateAll((rows) => rows.map((row) => row.getAttribute("data-event-id")))).toEqual(generatedIds);
});
