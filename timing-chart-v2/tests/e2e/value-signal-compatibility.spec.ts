import { expect, test } from "@playwright/test";
import { startInCycleMode } from "./cycle-startup.js";

startInCycleMode(test);

const clock = {
  id: "sig_clk", name: "CLK", type: "clock", role: "input",
  source: { instancePath: [], signalName: "CLK" }, display: { name: "CLK" },
  generator: { start: 0, period: 1, duty: 0.5, phase: 0, initial: 0, polarity: "positive" },
  edgeCounter: { show: false, mode: "rising", startNumber: 1, countFrom: "signal-start", labelEvery: 1, position: "above", offset: { x: 0, y: -6 } },
};

function value(id: string, name: string, type: "state" | "logic" | "event" | "pulse" | "bus", values: Array<{ start: number; value: string | number }>) {
  return { id, name, type, role: "internal", source: { instancePath: ["u_core"], signalName: name }, display: { name }, ...(type === "bus" ? { width: 8, displayFormat: "hex" } : {}), values };
}

const document = {
  formatVersion: 2,
  document: { id: "compat", title: "Compatibility", header: { subtitle: "", description: "", notes: "", preconditions: [], constraints: [], exceptions: [] }, footer: { figureNumber: "", revision: "", text: "" } },
  timeline: { start: 0, end: 8, timeBase: "cycle", cycleCount: 8, referenceClock: "sig_clk", edge: "rising", labelAnchors: [] },
  signalGroups: [{ id: "grp_main", name: "Main", rows: ["sig_clk", "sig_state", "sig_logic", "sig_event", "sig_pulse", "sig_bus"] }],
  signals: [
    clock,
    value("sig_state", "STATE", "state", [{ start: 0, value: "IDLE" }, { start: 4, value: "ACTIVE" }]),
    value("sig_logic", "LOGIC", "logic", [{ start: 0, value: 0 }, { start: 3, value: "D" }]),
    value("sig_event", "EVENT", "event", [{ start: 0, value: "none" }]),
    value("sig_pulse", "PULSE", "pulse", [{ start: 0, value: 0 }, { start: 2, value: 1 }, { start: 3, value: 0 }]),
    value("sig_bus", "BUS", "bus", [{ start: 0, value: "00" }, { start: 4, value: "A5" }]),
  ],
  bookmarks: [], timeGroups: [], annotations: [],
  legend: { show: true, orientation: "horizontal", usedRolesOnly: true, position: { x: 0, y: 0 } },
  layout: { roleColumnWidth: 32, signalNameWidth: 168, signalNameAlign: "left", rowHeight: 28, signalSpacing: 6, overflow: "ellipsis" },
  transactions: [], constraints: [], checkSettings: {},
};

test("shared ValueSignal policy keeps Quick Values renderable through Save/Open", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "compatibility.tcd.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(document)) });
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(page.getByTestId("wavedrom-status")).toHaveText("WaveDrom: Ready");

  const eventRow = host.locator("[data-role='frozen-row'][data-row-id='sig_event']");
  await eventRow.click();
  const bottom = page.getByTestId("bottom-editor");
  await bottom.locator(".bottom-tabs").getByRole("tab", { name: "Signal", exact: true }).click();
  // Bottom Panel Visual Reference pass (#402/#426): Value Helper is now an
  // always-visible panel (the "Presets" toggle button was removed).
  await bottom.locator(".value-helper-panel").getByRole("group", { name: "Quick values" }).getByRole("button", { name: "RISE", exact: true }).click();
  await bottom.getByTestId("add-signal-event").click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(page.getByTestId("wavedrom-status")).toHaveText("WaveDrom: Ready");

  const save = page.waitForEvent("download");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Save", exact: true }).click();
  const savedPath = await (await save).path();
  expect(savedPath).toBeTruthy();
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(savedPath!);
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(page.getByTestId("wavedrom-status")).toHaveText("WaveDrom: Ready");
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
  await expect(page.getByTestId("signal-count-status")).toHaveText("Signals: 6");
  await expect(host.locator("[data-role='wave-owner'][data-signal-id='sig_event']")).toHaveCount(1);
});

test("incompatible State to Binary conversion is rejected before canonical commit", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "compatibility.tcd.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(document)) });
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_state']").click();
  const bottom = page.getByTestId("bottom-editor");
  const inspector = page.getByTestId("inspector");
  const beforeRevision = await host.getAttribute("data-canonical-revision");
  const beforeHistory = await page.getByTestId("history-status").textContent();
  const beforeDirty = await page.getByTestId("dirty-status").textContent();
  await inspector.getByLabel("Inspector signal type").selectOption("binary");
  await inspector.getByTestId("apply-inspector-signal").click();
  await bottom.locator(".bottom-tabs").getByRole("tab", { name: "Problems", exact: true }).click();
  await expect(page.getByTestId("problems-panel")).toContainText("Cannot convert state to binary");
  expect(await host.getAttribute("data-canonical-revision")).toBe(beforeRevision);
  expect(await page.getByTestId("history-status").textContent()).toBe(beforeHistory);
  expect(await page.getByTestId("dirty-status").textContent()).toBe(beforeDirty);
});

// #400: Pulse is no longer an independently creatable Signal type -- the
// Type selector never offers it as a conversion *target* (not even from a
// value-domain-compatible source like Level/`logic`, which is exactly what
// the old "Logic to Pulse" version of this test exercised). It replaces
// that removed conversion path with a positive assertion that Pulse is
// truly absent from the list, plus a still-genuinely-compatible conversion
// (Bus -> State, both data-domain, no value-token restriction) to keep this
// file's actual "compatible conversion succeeds end to end" coverage alive.
test("Pulse is never offered as a Type conversion target, even from a value-domain-compatible Level (logic) signal", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "compatibility.tcd.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(document)) });
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_logic']").click();
  const inspector = page.getByTestId("inspector");
  const type = inspector.getByLabel("Inspector signal type");
  await expect(type.locator("option[value='pulse']")).toHaveCount(0);
  await expect(type).toHaveValue("logic");
  const bottom = page.getByTestId("bottom-editor");
  await bottom.locator(".bottom-tabs").getByRole("tab", { name: "Signal", exact: true }).click();
  await expect(bottom.locator(".signal-editor").getByLabel("Signal type").locator("option[value='pulse']")).toHaveCount(0);
});

test("compatible Bus to State conversion supports Cancel, Apply, Undo/Redo, and Save/Open", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "compatibility.tcd.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(document)) });
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_bus']").click();
  const inspector = page.getByTestId("inspector");
  const type = inspector.getByLabel("Inspector signal type");
  const beforeRevision = await host.getAttribute("data-canonical-revision");
  await type.selectOption("state");
  await inspector.getByTestId("cancel-inspector-draft").click();
  await expect(host).toHaveAttribute("data-canonical-revision", beforeRevision!);
  await host.locator("[data-role='frozen-row'][data-row-id='sig_bus']").click();
  await expect(page.getByTestId("inspector").getByLabel("Inspector signal type")).toHaveValue("bus");

  const nextInspector = page.getByTestId("inspector");
  await nextInspector.getByLabel("Inspector signal type").selectOption("state");
  await nextInspector.getByTestId("apply-inspector-signal").click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(host).toHaveAttribute("data-canonical-revision", "1");
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await expect(page.getByTestId("wavedrom-status")).toHaveText("WaveDrom: Ready");

  await page.getByTestId("ribbon").getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 1");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_bus']").click();
  await expect(page.getByTestId("inspector").getByLabel("Inspector signal type")).toHaveValue("bus");
  await page.getByTestId("ribbon").getByRole("button", { name: "Redo", exact: true }).click();
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_bus']").click();
  await expect(page.getByTestId("inspector").getByLabel("Inspector signal type")).toHaveValue("state");

  const save = page.waitForEvent("download");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Save", exact: true }).first().click();
  const savedPath = await (await save).path();
  expect(savedPath).toBeTruthy();
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(savedPath!);
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_bus']").click();
  await expect(page.getByTestId("inspector").getByLabel("Inspector signal type")).toHaveValue("state");
  await expect(page.getByTestId("wavedrom-status")).toHaveText("WaveDrom: Ready");
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
});

test("Bus to Binary conversion rejects non-logic values without mutation", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "compatibility.tcd.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(document)) });
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_bus']").click();
  const inspector = page.getByTestId("inspector");
  const beforeRevision = await host.getAttribute("data-canonical-revision");
  const beforeHistory = await page.getByTestId("history-status").textContent();
  const beforeDirty = await page.getByTestId("dirty-status").textContent();
  await inspector.getByLabel("Inspector signal type").selectOption("binary");
  await inspector.getByTestId("apply-inspector-signal").click();
  await page.locator(".bottom-tabs").getByRole("tab", { name: "Problems", exact: true }).click();
  await expect(page.getByTestId("problems-panel")).toContainText("Cannot convert bus to binary");
  expect(await host.getAttribute("data-canonical-revision")).toBe(beforeRevision);
  expect(await page.getByTestId("history-status").textContent()).toBe(beforeHistory);
  expect(await page.getByTestId("dirty-status").textContent()).toBe(beforeDirty);
});

test("Event Table exposes one action route and visibly rejects invalid imports", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "compatibility.tcd.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(document)) });
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_event']").click();
  const bottom = page.getByTestId("bottom-editor");
  await bottom.locator(".bottom-tabs").getByRole("tab", { name: "Signal", exact: true }).click();
  const toolbar = bottom.getByTestId("signal-event-toolbar");
  // Bottom Panel Visual Reference pass (#402/#426): Import/Export moved
  // from the toolbar to the table footer (alongside the new bulk Delete
  // Selected/Move Up/Move Down) -- both are still exactly one action
  // route each, just relocated.
  for (const testId of ["event-duplicate", "event-add-row", "event-delete-row"]) await expect(toolbar.getByTestId(testId)).toHaveCount(1);
  for (const testId of ["event-import-action", "event-export-action"]) await expect(bottom.getByTestId(testId)).toHaveCount(1);
  await expect(toolbar.getByRole("button", { name: "Preview", exact: true })).toHaveCount(0);
  await expect(toolbar.getByRole("button", { name: "Preview Update", exact: true })).toHaveCount(0);
  const before = { revision: await host.getAttribute("data-canonical-revision"), history: await page.getByTestId("history-status").textContent(), dirty: await page.getByTestId("dirty-status").textContent() };
  await bottom.getByLabel("Import signal events").setInputFiles({ name: "invalid.json", mimeType: "application/json", buffer: Buffer.from("not-json") });
  await expect(bottom.getByTestId("event-import-status")).toHaveText("Import rejected: invalid JSON.");
  expect(await host.getAttribute("data-canonical-revision")).toBe(before.revision);
  expect(await page.getByTestId("history-status").textContent()).toBe(before.history);
  expect(await page.getByTestId("dirty-status").textContent()).toBe(before.dirty);
});

test("Event Table valid import uses canonical validation and one history entry", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "compatibility.tcd.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(document)) });
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_event']").click();
  const bottom = page.getByTestId("bottom-editor");
  await bottom.locator(".bottom-tabs").getByRole("tab", { name: "Signal", exact: true }).click();
  await bottom.getByLabel("Import signal events").setInputFiles({ name: "events.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ values: [{ start: 0, value: "NONE" }, { start: 3, value: "RISE" }] })) });
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await expect(host).toHaveAttribute("data-canonical-revision", "1");
  await expect(page.getByTestId("wavedrom-status")).toHaveText("WaveDrom: Ready");
  await expect(bottom.getByTestId("event-row-value-3")).toHaveText("RISE");
});
