import { readFile } from "node:fs/promises";
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
    bookmarks: [], timeGroups: [], annotations: [], annotationGroups: [], transactions: [], constraints: [],
    legend: { show: false, orientation: "horizontal", usedRolesOnly: true, position: { x: 0, y: 0 } },
    layout: { roleColumnWidth: 62, signalNameWidth: 178, signalNameAlign: "left", rowHeight: 30, signalSpacing: 4, overflow: "ellipsis" },
    checkSettings: {},
  };
}

test("keeps the Ruler alive across edits, Undo/Redo, and repeated Opens with a non-default reference clock", async ({ page }) => {
  await page.goto("/");
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const ruler = page.getByTestId("cycle-ruler");
  const fileInput = page.locator("input[type='file'][accept='.json,.tcd']");

  const docA = fixture("doc-a", "Document A", "clk_external", 12);
  const docB = fixture("doc-b", "Document B", "clk_other", 8);

  const openDocument = async (name: string, document: unknown) => {
    await fileInput.setInputFiles({ name, mimeType: "application/json", buffer: Buffer.from(JSON.stringify(document)) });
    const unsaved = page.getByTestId("unsaved-file-dialog");
    if (await unsaved.isVisible().catch(() => false)) await unsaved.getByTestId("unsaved-discard").click();
  };

  // Open A (referenceClock = clk_external, not the built-in demo clock id)
  await openDocument("a.tcd", docA);
  await expect(page.locator(".app-titlebar h1")).toHaveText("Document A");
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  const rulerCountA = await ruler.locator("[data-cycle]").count();
  expect(rulerCountA).toBeGreaterThan(0);

  // Signal property edit -- the Name field commits on its own gesture
  // (Enter), independent of Inspector's Draft "Apply Signal Properties"
  // button (`name` is deliberately excluded from that button's Draft/
  // Apply gating, since InlineNameInput already has its own immediate-
  // commit path). Bottom Panel Visual Reference pass (#402/#426): Name
  // moved to Inspector, its sole owner now -- Bottom's own duplicate Name
  // field was removed.
  await host.locator("[data-role='frozen-row'][data-row-id='sig_data']").click();
  await page.getByTestId("inspector").getByLabel("Inspector signal name", { exact: true }).fill("DATA_RENAMED");
  await page.getByTestId("inspector").getByLabel("Inspector signal name", { exact: true }).press("Enter");
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(ruler.locator("[data-cycle]")).toHaveCount(rulerCountA);

  // Event edit
  const row = page.getByTestId("signal-editor").locator("form.event-row").nth(1);
  await row.getByRole("button", { name: /Edit transition/ }).click();
  await row.getByLabel("Value 4").selectOption("X");
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
  await openDocument("b.tcd", docB);
  await expect(page.locator(".app-titlebar h1")).toHaveText("Document B");
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  const rulerCountB = await ruler.locator("[data-cycle]").count();
  expect(rulerCountB).toBeGreaterThan(0);
  expect(rulerCountB).not.toBe(rulerCountA);

  // Open A again: no stale geometry from B should linger
  await openDocument("a2.tcd", docA);
  await expect(page.locator(".app-titlebar h1")).toHaveText("Document A");
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(ruler.locator("[data-cycle]")).toHaveCount(rulerCountA);
});

test("derives the reference Clock label and edge from canonical state across Save/Open", async ({ page }) => {
  const base = fixture("two-clocks", "Two Clocks", "clk_a", 12);
  const clockA = base.signals[0]!;
  const clockB = { ...clockA, id: "clk_b", name: "Clock B", source: { ...clockA.source, signalName: "clock_b" }, display: { name: "Clock B" } };
  const document = {
    ...base,
    timeline: { ...base.timeline, referenceClock: "clk_a", edge: "rising" },
    signalGroups: [{ ...base.signalGroups[0]!, rows: ["clk_a", "clk_b", "sig_data"] }],
    signals: [clockA, clockB, base.signals[1]!],
  };
  await page.goto("/");
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  const host = page.getByTestId("cycle-surface");
  const fileInput = page.locator("input[type='file'][accept='.json,.tcd']");
  await fileInput.setInputFiles({ name: "two-clocks.tcd", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(document)) });
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await host.locator("[data-role='frozen-row'][data-row-id='clk_b']").click();
  const inspector = page.getByTestId("inspector");
  await inspector.getByTestId("set-reference-clock").click();
  await expect(page.getByTestId("time-axis-status")).toHaveText("Time Axis: Clock · Clock B");
  await expect(page.locator(".clock-context-label")).toHaveText("Signal: Clock B    Type: Clock");
  await inspector.getByLabel("Reference Edge").selectOption("falling");
  await inspector.getByTestId("apply-reference-edge").click();
  await expect(page.getByTestId("history-status")).toHaveText("History 2 / Redo 0");
  await inspector.getByLabel("Inspector signal name").fill("Clock B Renamed");
  await inspector.getByLabel("Inspector signal name").press("Enter");
  await expect(page.getByTestId("time-axis-status")).toHaveText("Time Axis: Clock · Clock B Renamed");
  await expect(page.locator(".clock-context-label")).toHaveText("Signal: Clock B Renamed    Type: Clock");

  const download = page.waitForEvent("download");
  await page.getByLabel("Ribbon tabs").getByRole("button", { name: "File", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Save", exact: true }).click();
  const savedPath = await (await download).path();
  const saved = JSON.parse(await readFile(savedPath!, "utf8")) as { timeline: { referenceClock?: string; edge?: string } };
  expect(saved.timeline).toMatchObject({ referenceClock: "clk_b", edge: "falling" });
  await fileInput.setInputFiles(savedPath!);
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await host.locator("[data-role='frozen-row'][data-row-id='clk_b']").click();
  await expect(page.getByTestId("time-axis-status")).toHaveText("Time Axis: Clock · Clock B Renamed");
  await expect(page.locator(".clock-context-label")).toHaveText("Signal: Clock B Renamed    Type: Clock");
});
