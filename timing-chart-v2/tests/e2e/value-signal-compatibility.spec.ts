import { expect, test } from "@playwright/test";

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
  await bottom.getByTestId("event-presets").click();
  await bottom.locator(".event-add").getByRole("group", { name: "Quick values" }).getByRole("button", { name: "RISE", exact: true }).click();
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

test("compatible Logic to Pulse conversion supports Cancel, Apply, Undo/Redo, and Save/Open", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "compatibility.tcd.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(document)) });
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_logic']").click();
  const inspector = page.getByTestId("inspector");
  const type = inspector.getByLabel("Inspector signal type");
  const beforeRevision = await host.getAttribute("data-canonical-revision");
  await type.selectOption("pulse");
  await inspector.getByTestId("cancel-inspector-draft").click();
  await expect(host).toHaveAttribute("data-canonical-revision", beforeRevision!);
  await host.locator("[data-role='frozen-row'][data-row-id='sig_logic']").click();
  await expect(page.getByTestId("inspector").getByLabel("Inspector signal type")).toHaveValue("logic");

  const nextInspector = page.getByTestId("inspector");
  await nextInspector.getByLabel("Inspector signal type").selectOption("pulse");
  await nextInspector.getByTestId("apply-inspector-signal").click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(host).toHaveAttribute("data-canonical-revision", "1");
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await expect(page.getByTestId("wavedrom-status")).toHaveText("WaveDrom: Ready");

  await page.getByTestId("ribbon").getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 1");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_logic']").click();
  await expect(page.getByTestId("inspector").getByLabel("Inspector signal type")).toHaveValue("logic");
  await page.getByTestId("ribbon").getByRole("button", { name: "Redo", exact: true }).click();
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_logic']").click();
  await expect(page.getByTestId("inspector").getByLabel("Inspector signal type")).toHaveValue("pulse");

  const save = page.waitForEvent("download");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Save", exact: true }).first().click();
  const savedPath = await (await save).path();
  expect(savedPath).toBeTruthy();
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(savedPath!);
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_logic']").click();
  await expect(page.getByTestId("inspector").getByLabel("Inspector signal type")).toHaveValue("pulse");
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
  for (const testId of ["event-duplicate", "event-import-action", "event-export-action", "event-add-row", "event-delete-row"]) await expect(toolbar.getByTestId(testId)).toHaveCount(1);
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
  await expect(bottom.getByLabel("Value 3")).toHaveValue("RISE");
});
