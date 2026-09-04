import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";

function documentWithRebase() {
  const clock = {
    id: "clock_reference",
    name: "REFERENCE",
    type: "clock",
    role: "input",
    source: { instancePath: [], signalName: "reference" },
    display: { name: "REFERENCE" },
    generator: { start: 0, period: 2, duty: 0.5, phase: 0, initial: 0, polarity: "positive" },
    edgeCounter: { show: false, mode: "both", startNumber: 1, countFrom: "signal-start", labelEvery: 1, position: "above", offset: { x: 0, y: -6 } },
  };
  const data = { id: "signal_data", name: "DATA", type: "binary", role: "internal", source: { instancePath: [], signalName: "data" }, display: { name: "DATA" }, values: [{ start: 0, value: 0 }, { start: 4, value: 1 }] };
  return {
    formatVersion: 2,
    document: { id: "label-anchor-rebase", title: "Label Anchor Rebase", header: { subtitle: "", description: "", notes: "", preconditions: [], constraints: [], exceptions: [] }, footer: { figureNumber: "", revision: "", text: "" } },
    timeline: { start: 0, end: 8, cycleCount: 8, timeBase: "cycle", referenceClock: clock.id, edge: "rising", labelAnchors: [{ id: "label_rebase", source: 5, display: 1000 }] },
    signalGroups: [{ id: "group_main", name: "Main", rows: [clock.id, data.id] }],
    signals: [clock, data], bookmarks: [], timeGroups: [], annotations: [], annotationGroups: [], transactions: [], constraints: [],
    legend: { show: false, orientation: "horizontal", usedRolesOnly: true, position: { x: 0, y: 0 } },
    layout: { roleColumnWidth: 62, signalNameWidth: 178, signalNameAlign: "left", rowHeight: 30, signalSpacing: 4, overflow: "ellipsis" },
    checkSettings: {},
  };
}

async function openDocument(page: Page, document: unknown) {
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "label-anchor.tcd", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(document)) });
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true");
}

test("keeps LabelAnchor source/display semantics on no-fold and folded ruler paths", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const document = documentWithRebase();
  await openDocument(page, document);
  const ruler = page.getByTestId("cycle-ruler");

  const noFold = ruler.locator("[data-display-cycle='5']");
  await expect(noFold).toHaveAttribute("data-source-cycle", "5");
  await expect(noFold).toHaveAttribute("data-cycle", "1000");
  await expect(noFold).toHaveText("1000");
  await expect(ruler.locator("[data-display-cycle='6']")).toHaveAttribute("data-cycle", "1001");

  await page.locator(".ribbon-tabs").getByRole("button", { name: "Timeline", exact: true }).click();
  await page.getByRole("button", { name: "Axis Break", exact: true }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  const folded = ruler.locator("[data-cycle='1000']");
  await expect(folded).toHaveAttribute("data-source-cycle", "5");
  await expect(folded).toHaveText("1000");

  await page.locator(".ribbon-tabs").getByRole("button", { name: "Home", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Undo", exact: true }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(ruler.locator("[data-display-cycle='5']")).toHaveAttribute("data-cycle", "1000");

  const downloadPromise = page.waitForEvent("download");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Save", exact: true }).click();
  const savedPath = await (await downloadPromise).path();
  expect(savedPath).toBeTruthy();
  const saved = JSON.parse(await readFile(savedPath!, "utf8")) as { timeline: { labelAnchors: Array<{ source: number; display: number }> } };
  expect(saved.timeline.labelAnchors).toEqual([{ id: "label_rebase", source: 5, display: 1000 }]);
  await openDocument(page, saved);
  await expect(ruler.locator("[data-display-cycle='5']")).toHaveAttribute("data-cycle", "1000");
});
