import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { startInCycleMode } from "./cycle-startup.js";

startInCycleMode(test);

// Review fixes for the Signal inspector (Type / Width / align pin / enum draft):
// - Apply must not pin the document layout's name alignment or overflow onto a signal the user did not touch.
// - Converting a Binary Signal to Bus defaults the width to 8 bits, not 1.
// - An emptied Width is an invalid draft (inline message, Apply disabled), not a 0 commit attempt.
// - A State-to-Bus conversion that an existing value cannot satisfy is reported inline with the cycle and value.
// - The State enum select is a draft committed by Apply, like every other field in this panel.

const source = (name: string) => ({ instancePath: [], signalName: name.toLowerCase() });

const clock = {
  id: "sig_clk", name: "CLK", type: "clock", role: "input", source: source("CLK"), display: { name: "CLK" },
  generator: { start: 0, period: 2, duty: 0.5, phase: 0, initial: 0, polarity: "positive" },
  edgeCounter: { show: false, mode: "rising", startNumber: 1, countFrom: "signal-start", labelEvery: 1, position: "above", offset: { x: 0, y: -6 } },
};

const document = {
  formatVersion: 2,
  document: { id: "signal-inspector-type", title: "Signal Inspector Type", header: { subtitle: "", description: "", notes: "", preconditions: [], constraints: [], exceptions: [] }, footer: { figureNumber: "", revision: "", text: "" } },
  timeline: { start: 0, end: 8, timeBase: "cycle", cycleCount: 8, referenceClock: clock.id, edge: "rising", labelAnchors: [] },
  signalGroups: [{ id: "grp_main", name: "Main", rows: [clock.id, "sig_bin", "sig_bus", "sig_enum", "sig_ready"] }],
  signals: [
    clock,
    { id: "sig_bin", name: "BIN", type: "binary", role: "internal", source: source("BIN"), display: { name: "BIN" }, values: [{ start: 0, value: 0 }, { start: 2, value: 1 }] },
    { id: "sig_bus", name: "BUS", type: "bus", role: "internal", width: 8, displayFormat: "hex", source: source("BUS"), display: { name: "BUS" }, values: [{ start: 0, value: "00" }, { start: 4, value: "A5" }] },
    { id: "sig_enum", name: "ENUM", type: "state", role: "internal", enumId: "enum_fsm", source: source("ENUM"), display: { name: "ENUM" }, values: [{ start: 0, value: 0 }, { start: 3, value: 1 }] },
    { id: "sig_ready", name: "READY", type: "state", role: "internal", source: source("READY"), display: { name: "READY" }, values: [{ start: 0, value: "IDLE" }, { start: 3, value: "ready-1" }] },
  ],
  enumDefinitions: [{ id: "enum_fsm", name: "FSM", entries: [{ value: 0, label: "IDLE" }, { value: 1, label: "RUN" }] }],
  bookmarks: [], timeGroups: [], annotations: [], transactions: [], constraints: [],
  legend: { show: false, orientation: "horizontal", usedRolesOnly: true, position: { x: 0, y: 0 } },
  // The document layout aligns names right and wraps overflow; no signal overrides either, so the inspector must not pin "left"/"ellipsis".
  layout: { roleColumnWidth: 62, signalNameWidth: 178, signalNameAlign: "right", rowHeight: 30, signalSpacing: 4, overflow: "wrap" },
  checkSettings: {},
};

async function openDocument(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "signal-inspector-type.tcd", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(document)) });
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
}

async function selectRow(page: Page, rowId: string): Promise<void> {
  await page.getByTestId("cycle-surface").locator(`[data-role='frozen-row'][data-row-id='${rowId}']`).click();
}

async function saveAndRead(page: Page): Promise<{ signals: Array<{ id: string; role: string; display: Record<string, unknown> }> }> {
  const download = page.waitForEvent("download");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Save", exact: true }).click();
  const savedPath = await (await download).path();
  return JSON.parse(await readFile(savedPath!, "utf8")) as { signals: Array<{ id: string; role: string; display: Record<string, unknown> }> };
}

test("Apply does not pin the layout's name alignment or overflow onto an untouched Signal", async ({ page }) => {
  await openDocument(page);
  await selectRow(page, "sig_bus");
  const inspector = page.getByTestId("inspector");
  await inspector.getByLabel("Inspector signal role").selectOption("output");
  await inspector.getByTestId("apply-inspector-signal").click();
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  const saved = await saveAndRead(page);
  const bus = saved.signals.find((signal) => signal.id === "sig_bus");
  expect(bus).toMatchObject({ role: "output" });
  expect(bus!.display).not.toHaveProperty("align");
  expect(bus!.display).not.toHaveProperty("overflow");
});

test("converting a Binary Signal to Bus defaults the width to 8 bits", async ({ page }) => {
  await openDocument(page);
  await selectRow(page, "sig_bin");
  const inspector = page.getByTestId("inspector");
  await inspector.getByLabel("Inspector signal type").selectOption("bus");
  await expect(inspector.getByLabel("Inspector signal width")).toHaveValue("8");
  await inspector.getByTestId("apply-inspector-signal").click();
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await expect(inspector.getByLabel("Inspector signal width")).toHaveValue("8");
});

test("an emptied Bus width is an inline draft problem with Apply disabled, not a commit", async ({ page }) => {
  await openDocument(page);
  await selectRow(page, "sig_bus");
  const inspector = page.getByTestId("inspector");
  const width = inspector.getByLabel("Inspector signal width");
  await width.fill("");
  await expect(inspector.getByTestId("inspector-signal-width-problem")).toHaveText("Width must be a positive whole number of bits.");
  await expect(inspector.getByTestId("apply-inspector-signal")).toBeDisabled();
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
  await width.fill("16");
  await expect(inspector.getByTestId("inspector-signal-width-problem")).toHaveCount(0);
  await expect(inspector.getByTestId("apply-inspector-signal")).toBeEnabled();
});

test("a State-to-Bus conversion that an existing value cannot satisfy is explained inline", async ({ page }) => {
  await openDocument(page);
  await selectRow(page, "sig_ready");
  const inspector = page.getByTestId("inspector");
  await inspector.getByLabel("Inspector signal type").selectOption("bus");
  await inspector.getByTestId("apply-inspector-signal").click();
  await expect(inspector.getByText("Value 'ready-1' at cycle 3 is not a valid bus literal for width 8.")).toBeVisible();
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
});

test("the State enum select is a draft committed by Apply, not on select", async ({ page }) => {
  await openDocument(page);
  await selectRow(page, "sig_enum");
  const inspector = page.getByTestId("inspector");
  const enumSelect = inspector.getByLabel("Inspector State enum");
  await expect(enumSelect).toHaveValue("enum_fsm");
  await enumSelect.selectOption({ label: "No enum" });
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
  await inspector.getByTestId("apply-inspector-signal").click();
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await expect(enumSelect).toHaveValue("");
});
