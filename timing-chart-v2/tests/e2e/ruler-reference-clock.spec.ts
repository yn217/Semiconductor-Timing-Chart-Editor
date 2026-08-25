import { expect, test } from "@playwright/test";

function fixture(id: string, title: string, clockId: string, cycleCount: number) {
  return {
    formatVersion: 2,
    document: {
      id, title,
      header: { subtitle: "", description: "", notes: "", preconditions: [], constraints: [], exceptions: [] },
      footer: { figureNumber: "", revision: "V1", text: "" },
    },
    timeline: { start: 0, end: cycleCount, cycleCount, timeBase: "cycle", referenceClock: clockId, edge: "rising", labelAnchors: [] },
    signalGroups: [{ id: "grp_main", name: "Main", rows: [clockId, "sig_data"] }],
    signals: [
      { id: clockId, name: "CLK", type: "clock", role: "input", source: { instancePath: [], signalName: "clk" }, display: { name: "CLK" }, generator: { start: 0, period: 2, duty: 0.5, phase: 0, initial: 0, polarity: "positive" }, edgeCounter: { show: false, mode: "both", startNumber: 1, countFrom: "signal-start", labelEvery: 1, position: "above", offset: { x: 0, y: -6 } } },
      { id: "sig_data", name: "DATA", type: "binary", role: "input", source: { instancePath: [], signalName: "data" }, display: { name: "DATA" }, values: [{ start: 0, value: 0 }, { start: 4, value: 1 }] },
    ],
    bookmarks: [], timeGroups: [], annotations: [], transactions: [], constraints: [],
    legend: { show: false, orientation: "horizontal", usedRolesOnly: true, position: { x: 0, y: 0 } },
    layout: { roleColumnWidth: 62, signalNameWidth: 178, signalNameAlign: "left", rowHeight: 30, signalSpacing: 4, overflow: "ellipsis" },
    checkSettings: {},
  };
}

test("keeps the Ruler alive across edits, Undo/Redo, and repeated Opens with a non-default reference clock", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const ruler = page.getByTestId("cycle-ruler");
  const fileInput = page.locator("input[type='file']");

  const docA = fixture("doc-a", "Document A", "clk_external", 12);
  const docB = fixture("doc-b", "Document B", "clk_other", 8);

  // Open A (referenceClock = clk_external, not the built-in demo clock id)
  await fileInput.setInputFiles({ name: "a.tcd", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(docA)) });
  await expect(page.locator(".app-titlebar h1")).toHaveText("Document A");
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  const rulerCountA = await ruler.locator("[data-cycle]").count();
  expect(rulerCountA).toBeGreaterThan(0);

  // Signal property edit
  await host.locator("[data-role='frozen-row'][data-row-id='sig_data']").click();
  await page.getByTestId("signal-editor").getByLabel("Signal name").fill("DATA_RENAMED");
  await page.getByTestId("save-signal-properties").click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(ruler.locator("[data-cycle]")).toHaveCount(rulerCountA);

  // Event edit
  const row = page.getByTestId("signal-editor").locator("form.event-row").nth(1);
  await row.getByLabel("Value 4").fill("X");
  await row.getByRole("button", { name: "Save" }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(ruler.locator("[data-cycle]")).toHaveCount(rulerCountA);

  // Undo / Redo
  await page.getByTestId("editor-undo").click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(ruler.locator("[data-cycle]")).toHaveCount(rulerCountA);
  await page.getByTestId("editor-redo").click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(ruler.locator("[data-cycle]")).toHaveCount(rulerCountA);

  // Open B (different reference clock id and cycle count)
  await fileInput.setInputFiles({ name: "b.tcd", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(docB)) });
  await expect(page.locator(".app-titlebar h1")).toHaveText("Document B");
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  const rulerCountB = await ruler.locator("[data-cycle]").count();
  expect(rulerCountB).toBeGreaterThan(0);
  expect(rulerCountB).not.toBe(rulerCountA);

  // Open A again: no stale geometry from B should linger
  await fileInput.setInputFiles({ name: "a2.tcd", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(docA)) });
  await expect(page.locator(".app-titlebar h1")).toHaveText("Document A");
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(ruler.locator("[data-cycle]")).toHaveCount(rulerCountA);
});
