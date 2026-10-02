import { expect, test } from "@playwright/test";
import { startInCycleSample } from "./cycle-startup.js";

startInCycleSample(test);

/**
 * A clockless document (no referenceClock and no Clock signal) has no reference signal whose geometry the Open readiness could wait for
 * (and none is rendered in Transaction/Combined). The ordered readiness used to stall at "document-ready", so data-cycle-view-ready and
 * data-editor-idle were never published after opening one.
 */
const signal = { id: "sig_shared", name: "SHARED", type: "binary", role: "internal", source: { instancePath: [], signalName: "shared" }, display: { name: "SHARED" }, values: [{ start: 0, value: 0 }, { start: 4, value: 1 }] };
const clocklessDocument = (title: string) => ({
  formatVersion: 2,
  document: { id: title, title, header: { subtitle: "", description: "", notes: "", preconditions: [], constraints: [], exceptions: [] }, footer: { figureNumber: "", revision: "V2", text: "" } },
  timeline: { start: 0, end: 8, cycleCount: 8, timeBase: "cycle", edge: "rising", labelAnchors: [] },
  signalGroups: [{ id: "grp_main", name: "Main", rows: ["sig_shared"] }], signals: [signal],
  bookmarks: [], timeGroups: [], annotations: [], transactions: [], constraints: [],
  legend: { show: false, orientation: "horizontal", usedRolesOnly: true, position: { x: 0, y: 0 } },
  layout: { roleColumnWidth: 62, signalNameWidth: 178, signalNameAlign: "left", rowHeight: 30, signalSpacing: 4, overflow: "ellipsis" },
  checkSettings: {},
});

for (const where of ["Cycle", "Transaction tab"] as const) {
  test(`opening a clockless document publishes view-ready and idle (${where})`, async ({ page }) => {
    await page.goto("/");
    const host = page.getByTestId("cycle-surface");
    await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
    if (where === "Transaction tab") await page.getByLabel("Ribbon tabs").getByRole("button", { name: "Transaction", exact: true }).click();
    await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "clockless.tcd", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(clocklessDocument("clockless_doc"))) });
    await expect(page.locator(".editor-shell")).toHaveAttribute("data-signal-count", "1");
    await expect(host).toHaveAttribute("data-cycle-view-ready", "true", { timeout: 30_000 });
    await expect(host).toHaveAttribute("data-editor-idle", "true", { timeout: 30_000 });
    await expect(page.getByTestId("dirty-status")).toHaveText("Clean");
  });
}
