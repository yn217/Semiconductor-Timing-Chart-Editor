import { expect, test } from "@playwright/test";

test("surfaces a rejected Clock Generator update in the Problems panel, leaves the prior waveform untouched, and clears it once fixed", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_clock']").click();
  const editor = page.getByTestId("signal-editor");
  const before = { history: await host.getAttribute("data-history-depth"), revision: await host.getAttribute("data-canonical-revision") };

  // A phase not aligned to a half cycle is rejected at the command layer
  // (INVALID_CLOCK_GENERATOR) before it ever reaches WaveDrom -- the
  // canonical document, and therefore the already-rendered clock
  // waveform, is left completely untouched by a rejected command.
  await editor.getByLabel("Clock phase").fill("0.25");
  await page.getByTestId("apply-clock-generator").click();
  await expect(page.getByTestId("clock-generator-error")).toContainText("INVALID_CLOCK_GENERATOR");
  await expect(host).toHaveAttribute("data-history-depth", before.history!);
  await expect(host).toHaveAttribute("data-canonical-revision", before.revision!);
  await expect(host.locator("[data-role='wave-owner'][data-signal-id='sig_cycle_clock'] > svg")).toHaveCount(1);
  await expect(host.locator("[data-role='wave-owner'][data-signal-id='sig_cycle_request'] > svg")).toHaveCount(1);
  await page.locator(".bottom-tabs").getByRole("tab", { name: "Problems" }).click();
  await expect(page.getByTestId("problems-panel")).toContainText("INVALID_CLOCK_GENERATOR");
  await expect(page.getByTestId("problems-panel")).toContainText("signal.updateClockGenerator");

  await page.locator(".bottom-tabs").getByRole("tab", { name: "Signal" }).click();
  await editor.getByLabel("Clock phase").fill("0.5");
  await page.getByTestId("apply-clock-generator").click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(page.getByTestId("clock-generator-error")).toHaveCount(0);
  await expect(host.locator("[data-role='wave-owner'][data-signal-id='sig_cycle_clock'] > svg")).toHaveCount(1);
  await page.locator(".bottom-tabs").getByRole("tab", { name: "Problems" }).click();
  await expect(page.getByTestId("problems-panel")).not.toContainText("INVALID_CLOCK_GENERATOR");
});

test("surfaces an Open failure in the Problems panel", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "bad.tcd", mimeType: "application/json", buffer: Buffer.from("{ not json") });
  await page.locator(".bottom-tabs").getByRole("tab", { name: "Problems" }).click();
  await expect(page.getByTestId("problems-panel")).toContainText("JSON_SYNTAX");
  await expect(page.getByTestId("problems-panel")).toContainText("$@");
});

test("surfaces a V1->V2 migration warning after opening a legacy document", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const v1Doc = {
    formatVersion: 1,
    document: { id: "v1", title: "V1 Doc" },
    timebase: { cycleCount: 10 },
    signals: [{ id: "sig_clk", name: "CLK", type: "clock", generator: { start: 0, period: 2, duty: 0.5, phase: 0, initial: 0, polarity: "positive" } }],
  };
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "v1.tcd", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(v1Doc)) });
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await page.locator(".bottom-tabs").getByRole("tab", { name: "Problems" }).click();
  await expect(page.getByTestId("problems-panel")).toContainText("MIGRATED_V1_TO_V2");

  // opening a fresh document afterward clears the stale migration warning.
  const doc2 = {
    formatVersion: 2,
    document: {
      id: "v2", title: "V2 Doc",
      header: { subtitle: "", description: "", notes: "", preconditions: [], constraints: [], exceptions: [] },
      footer: { figureNumber: "", revision: "", text: "" },
    },
    timeline: { start: 0, end: 10, cycleCount: 10, timeBase: "cycle", referenceClock: "sig_clk2", edge: "rising", labelAnchors: [] },
    signalGroups: [{ id: "g1", name: "G", rows: ["sig_clk2"] }],
    signals: [{ id: "sig_clk2", name: "CLK", type: "clock", role: "input", source: { instancePath: [], signalName: "clk" }, display: { name: "CLK" }, generator: { start: 0, period: 2, duty: 0.5, phase: 0, initial: 0, polarity: "positive" }, edgeCounter: { show: false, mode: "both", startNumber: 1, countFrom: "signal-start", labelEvery: 1, position: "above", offset: { x: 0, y: -6 } } }],
    bookmarks: [], timeGroups: [], annotations: [], transactions: [], constraints: [],
    legend: { show: false, orientation: "horizontal", usedRolesOnly: true, position: { x: 0, y: 0 } },
    layout: { roleColumnWidth: 62, signalNameWidth: 178, signalNameAlign: "left", rowHeight: 30, signalSpacing: 4, overflow: "ellipsis" },
    checkSettings: {},
  };
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "v2.tcd", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(doc2)) });
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(page.getByTestId("problems-panel")).not.toContainText("MIGRATED_V1_TO_V2");
});

test("surfaces a rejected command in the Problems panel and clears it on the next successful command", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  const editor = page.getByTestId("signal-editor");
  // REQUEST has change points at cycles 0, 3, 7. Moving cycle 3's Start onto the existing
  // cycle-0 change point is a genuine rejection (DUPLICATE_CHANGE_POINT), not a no-op.
  const row = editor.locator("form.event-row").nth(1);
  await row.getByLabel("Start 3").fill("0");
  await row.getByRole("button", { name: "Save" }).click();
  await expect(page.getByTestId("editor-problem")).toBeVisible();
  await page.locator(".bottom-tabs").getByRole("tab", { name: "Problems" }).click();
  await expect(page.getByTestId("problems-panel")).toContainText("DUPLICATE_CHANGE_POINT");
  await expect(page.getByTestId("problems-panel")).toContainText("signal.replaceValue");
  await expect(page.getByTestId("problems-panel")).toContainText("Command ID");
  await expect(page.getByTestId("problems-panel")).toContainText("Object Type");
  await expect(page.getByTestId("problems-panel")).toContainText("sig_cycle_request");
  await expect(page.getByTestId("problems-panel")).toContainText("$.start");
  await expect(page.getByTestId("problems-panel")).toContainText("cycle");

  await page.locator(".bottom-tabs").getByRole("tab", { name: "Signal" }).click();
  await row.getByLabel("Start 3").fill("4");
  await row.getByRole("button", { name: "Save" }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await page.locator(".bottom-tabs").getByRole("tab", { name: "Problems" }).click();
  await expect(page.getByTestId("problems-panel")).not.toContainText("DUPLICATE_CHANGE_POINT");
});

test("surfaces recent-document storage stage when Save cannot persist", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key: string, value: string) {
      if (key === "timing-chart-v2.recent") throw new DOMException("Quota exceeded", "QuotaExceededError");
      return original.call(this, key, value);
    };
  });
  await page.getByTestId("ribbon").getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByTestId("editor-problem")).toContainText("Save document failed");
  await page.locator(".bottom-tabs").getByRole("tab", { name: "Problems" }).click();
  const problems = page.getByTestId("problems-panel");
  await expect(problems).toContainText("SAVE_FAILED");
  await expect(problems).toContainText("storage");
  await expect(problems).toContainText("Retry the download or choose Save As");
  await expect(page.getByTestId("dirty-status")).toHaveText("Clean");
});
