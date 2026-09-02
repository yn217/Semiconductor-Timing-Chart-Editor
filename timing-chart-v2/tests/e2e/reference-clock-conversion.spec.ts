import { expect, test, type Page } from "@playwright/test";

const clock = {
  id: "sig_reference_clk", name: "REFERENCE_CLK", type: "clock", role: "input",
  source: { instancePath: ["dut"], signalName: "reference_clk" }, display: { name: "REFERENCE_CLK" },
  generator: { start: 0, period: 2, duty: 0.5, phase: 0, initial: 0, polarity: "positive" },
  edgeCounter: { show: true, mode: "rising", startNumber: 1, countFrom: "signal-start", labelEvery: 1, position: "above", offset: { x: 0, y: -6 } },
};

const data = {
  id: "sig_data", name: "DATA", type: "binary", role: "internal",
  source: { instancePath: ["dut"], signalName: "data" }, display: { name: "DATA" },
  values: [{ start: 0, value: 0 }, { start: 2, value: 1 }],
};

const document = {
  formatVersion: 2,
  document: { id: "reference-conversion", title: "Reference Conversion", header: { subtitle: "", description: "", notes: "", preconditions: [], constraints: [], exceptions: [] }, footer: { figureNumber: "", revision: "", text: "" } },
  timeline: { start: 0, end: 8, timeBase: "cycle", cycleCount: 8, referenceClock: clock.id, edge: "rising", labelAnchors: [] },
  signalGroups: [{ id: "grp_main", name: "Main", rows: [clock.id, data.id] }],
  signals: [clock, data], bookmarks: [], timeGroups: [], annotations: [], transactions: [], constraints: [],
  legend: { show: false, orientation: "horizontal", usedRolesOnly: true, position: { x: 0, y: 0 } },
  layout: { roleColumnWidth: 62, signalNameWidth: 178, signalNameAlign: "left", rowHeight: 30, signalSpacing: 4, overflow: "ellipsis" },
  checkSettings: {},
};

async function openDocument(page: Page): Promise<void> {
  await page.goto("/");
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "reference-conversion.tcd", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(document)) });
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true");
}

test("active Reference Clock conversion discloses and atomically enters clockless mode", async ({ page }) => {
  await openDocument(page);
  const host = page.getByTestId("cycle-surface");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_reference_clk']").click();
  const inspector = page.getByTestId("inspector");
  await expect(page.getByTestId("time-axis-status")).toHaveText("Time Axis: Clock · REFERENCE_CLK");
  await inspector.getByLabel("Clock conversion target").selectOption("binary");
  await inspector.getByTestId("open-clock-conversion").click();
  const dialog = inspector.getByRole("alertdialog", { name: "Confirm Clock conversion" });
  await expect(dialog.getByTestId("reference-clock-conversion-warning")).toContainText("removes the Reference Clock designation");
  await expect(dialog).toContainText("no replacement Clock is selected automatically");

  await dialog.getByTestId("cancel-clock-conversion").click();
  await expect(page.getByTestId("time-axis-status")).toHaveText("Time Axis: Clock · REFERENCE_CLK");
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
  await expect(page.getByTestId("dirty-status")).toHaveText("Clean");

  await inspector.getByTestId("open-clock-conversion").click();
  await inspector.getByRole("alertdialog", { name: "Confirm Clock conversion" }).getByTestId("confirm-clock-conversion").click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(page.getByTestId("time-axis-status")).toHaveText("Time Axis: Time · No Clock Reference");
  await expect(inspector.getByLabel("Inspector signal type")).toHaveValue("binary");
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await expect(page.getByTestId("dirty-status")).toHaveText("Modified");

  await page.getByTestId("ribbon").getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByTestId("time-axis-status")).toHaveText("Time Axis: Clock · REFERENCE_CLK");
  await expect(inspector.getByLabel("Inspector signal type")).toHaveValue("clock");
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 1");

  await page.getByTestId("ribbon").getByRole("button", { name: "Redo", exact: true }).click();
  await expect(page.getByTestId("time-axis-status")).toHaveText("Time Axis: Time · No Clock Reference");
  await expect(inspector.getByLabel("Inspector signal type")).toHaveValue("binary");
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
});
