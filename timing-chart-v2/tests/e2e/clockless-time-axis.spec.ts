import { expect, test, type Page } from "@playwright/test";
import { startInCycleMode } from "./cycle-startup.js";

startInCycleMode(test);

const base = (id: string, title: string, signals: readonly unknown[], rows: readonly string[], referenceClock?: string) => ({
  formatVersion: 2,
  document: { id, title, header: { subtitle: "", description: "", notes: "", preconditions: [], constraints: [], exceptions: [] }, footer: { figureNumber: "", revision: "V2", text: "" } },
  timeline: { start: 0, end: 8, cycleCount: 8, timeBase: "cycle", ...(referenceClock === undefined ? {} : { referenceClock, edge: "rising" }), ...(referenceClock === undefined ? { edge: "rising" } : {}), labelAnchors: [] },
  signalGroups: [{ id: "grp_main", name: "Main", rows }],
  signals,
  bookmarks: [], timeGroups: [], annotations: [], annotationGroups: [], transactions: [], constraints: [],
  legend: { show: false, orientation: "horizontal", usedRolesOnly: true, position: { x: 0, y: 0 } },
  layout: { roleColumnWidth: 62, signalNameWidth: 178, signalNameAlign: "left", rowHeight: 30, signalSpacing: 4, overflow: "ellipsis" },
  checkSettings: {},
});

const data = { id: "sig_data", name: "DATA", type: "binary", role: "internal", source: { instancePath: [], signalName: "data" }, display: { name: "DATA" }, values: [{ start: 0, value: 0 }, { start: 4, value: 1 }] };
const clock = (id: string, name: string) => ({ id, name, type: "clock", role: "input", source: { instancePath: [], signalName: name }, display: { name }, generator: { start: 0, period: 2, duty: 0.5, phase: 0, initial: 0, polarity: "positive" }, edgeCounter: { show: false, mode: "rising", startNumber: 1, countFrom: "signal-start", labelEvery: 1, position: "above", offset: { x: 0, y: -6 } } });

async function openJson(page: Page, document: unknown): Promise<void> {
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "fixture.tcd.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(document)) });
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true");
  const title = (document as { document?: { title?: string } }).document?.title;
  if (title) await expect(page.locator(".app-titlebar h1")).toHaveText(title);
}

test("renders a clockless axis and preserves it through Save/Open and SVG export", async ({ page }) => {
  await page.goto("/");
  const document = base("clockless", "Clockless Timing", [data], [data.id]);
  await openJson(page, document);
  const host = page.getByTestId("cycle-surface");
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  await expect(page.getByTestId("time-axis-status")).toHaveText("Time Axis: Time · No Clock Reference");
  await expect(page.locator(".column-headings")).toContainText("Axis: Time");
  await expect(page.locator(".column-headings")).not.toContainText("Reference: clk");
  await expect(page.getByTestId("cycle-ruler").locator("[data-cycle]")) .toHaveCount(9);
  await page.getByTestId("home-grid-toggle").check();
  await expect(page.locator("[data-role='geometry-grid-line']").first()).toBeVisible();
  await expect(host.locator("[data-role='wave-owner'][data-signal-id='sig_data'] svg")).toHaveCount(1);
  await expect(host.locator("[data-role='wave-owner'][data-signal-id='sig_clk']")).toHaveCount(0);

  const save = page.waitForEvent("download");
  await page.getByTestId("ribbon").getByRole("button", { name: "Save", exact: true }).click();
  const savedPath = await (await save).path();
  expect(savedPath).toBeTruthy();
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(savedPath!);
  await expect(page.getByTestId("time-axis-status")).toHaveText("Time Axis: Time · No Clock Reference");
  await expect(page.getByTestId("cycle-ruler").locator("[data-cycle='8']")).toHaveCount(1);

  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Export", exact: true }).click();
  await page.getByLabel("Export format").selectOption("svg");
  const exportDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export SVG", exact: true }).click();
  expect(await (await exportDownload).path()).toBeTruthy();
});

test("hides the reference Clock without losing the axis, then deletes and restores it exactly", async ({ page }) => {
  await page.goto("/");
  const clkA = clock("sig_clk_a", "CLK_A");
  const document = base("clocked", "Clocked Timing", [clkA, data], [clkA.id, data.id], clkA.id);
  await openJson(page, document);
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  const host = page.getByTestId("cycle-surface");
  const ruler = page.getByTestId("cycle-ruler");
  const initialCount = await ruler.locator("[data-cycle]").count();
  await host.locator("[data-role='frozen-row'][data-row-id='sig_clk_a']").click();
  const editor = page.getByTestId("signal-editor");
  await editor.getByTestId("signal-visibility").click();
  await expect(host.locator("[data-role='frozen-row'][data-row-id='sig_clk_a']")).toHaveCount(0);
  await expect(page.getByTestId("time-axis-status")).toHaveText("Time Axis: Clock · CLK_A");
  await expect(ruler.locator("[data-cycle]")).toHaveCount(initialCount);
  await editor.getByTestId("signal-visibility").click();
  await expect(host.locator("[data-role='frozen-row'][data-row-id='sig_clk_a']")).toHaveCount(1);

  await host.locator("[data-role='frozen-row'][data-row-id='sig_clk_a']").click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByTestId("time-axis-status")).toHaveText("Time Axis: Time · No Clock Reference");
  await expect(host.locator("[data-role='frozen-row'][data-row-id='sig_clk_a']")).toHaveCount(0);
  await expect(ruler.locator("[data-cycle]")) .toHaveCount(initialCount);
  await expect(page.getByTestId("history-status")).toHaveText("History 3 / Redo 0");

  await page.getByTestId("ribbon").getByRole("button", { name: "Undo", exact: true }).click();
  await expect(host.locator("[data-role='frozen-row'][data-row-id='sig_clk_a']")).toHaveCount(1);
  await expect(page.getByTestId("time-axis-status")).toHaveText("Time Axis: Clock · CLK_A");
  await page.getByTestId("ribbon").getByRole("button", { name: "Redo", exact: true }).click();
  await expect(page.getByTestId("time-axis-status")).toHaveText("Time Axis: Time · No Clock Reference");
});

test("chooses an explicit reference Clock without fabricating one", async ({ page }) => {
  await page.goto("/");
  const clkA = clock("sig_clk_a", "CLK_A");
  const clkB = clock("sig_clk_b", "CLK_B");
  await openJson(page, base("select-reference", "Select Reference", [clkA, clkB, data], [clkA.id, clkB.id, data.id]));
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  const host = page.getByTestId("cycle-surface");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_clk_b']").click();
  await page.getByTestId("set-reference-clock").click();
  await expect(page.getByTestId("time-axis-status")).toHaveText("Time Axis: Clock · CLK_B");
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
});

test("snaps a clockless transaction against the actual non-first TimeAxis owner row", async ({ page }) => {
  await page.goto("/");
  const hiddenFirst = { ...data, id: "sig_hidden_first", display: { ...data.display, name: "HIDDEN_FIRST", visible: false }, values: [{ start: 0, value: 0 }, { start: 3, value: 1 }] };
  const owner = { ...data, id: "sig_axis_owner", display: { ...data.display, name: "AXIS_OWNER" }, values: [{ start: 0, value: 0 }, { start: 3, value: 1 }] };
  await openJson(page, base("clockless-owner-row", "Clockless Owner Row", [hiddenFirst, owner], [hiddenFirst.id, owner.id]));
  const host = page.getByTestId("cycle-surface");
  await expect(page.getByTestId("time-axis-status")).toHaveText("Time Axis: Time · No Clock Reference");
  await page.getByLabel("Ribbon tabs").getByRole("button", { name: "Transaction", exact: true }).click();
  const editor = page.getByTestId("transaction-editor");
  await editor.getByLabel("New Transaction name").fill("Owner snap");
  await editor.getByLabel("New Transaction start").fill("0");
  await editor.getByLabel("New Transaction end").fill("1");
  await editor.getByRole("button", { name: "Create Transaction", exact: true }).click();
  const transaction = page.getByTestId("transaction-lanes").locator("[data-transaction-id]");
  const body = transaction.locator("span");
  const target = await page.getByTestId("cycle-ruler").locator("[data-cycle='3']").boundingBox();
  const before = await body.boundingBox();
  expect(target).not.toBeNull();
  expect(before).not.toBeNull();
  await page.mouse.move(before!.x + before!.width / 2, before!.y + before!.height / 2);
  await page.mouse.down();
  await page.mouse.move(target!.x, before!.y + before!.height / 2);
  await page.mouse.up();
  await expect(host).toHaveAttribute("data-transaction-snap-axis-row-id", owner.id);
  await expect(page.getByTestId("inspector").getByLabel("Transaction start")).toHaveValue("3");
  await expect(transaction).toHaveAttribute("style", /left/);
});

test("Transaction clipboard preserves semantic fields and uses fresh IDs", async ({ page }) => {
  await page.goto("/");
  const transaction = {
    id: "txn_original",
    name: "Read burst",
    source: "CPU",
    destination: "RAM",
    start: 1,
    end: 5,
    laneId: "lane_0",
    phases: [{ name: "Address", start: 1, end: 2 }, { name: "Data", start: 2, end: 5 }],
    linkedSignals: [data.id],
    category: "memory",
    style: { fill: "#abc123" },
    metadata: { tag: "critical" },
    links: { issue: "ISSUE-1" },
  };
  await openJson(page, { ...base("transaction-clipboard", "Transaction Clipboard", [data], [data.id]), transactions: [transaction] });
  await page.getByLabel("Ribbon tabs").getByRole("button", { name: "Transaction", exact: true }).click();
  const lanes = page.getByTestId("transaction-lanes");
  const original = lanes.locator("[data-transaction-id='txn_original']");
  await original.click();
  const edit = page.getByTestId("ribbon").locator(".home-edit-group");
  const before = await page.getByTestId("history-status").textContent();
  await edit.getByRole("button", { name: "Copy", exact: true }).click();
  expect(await page.getByTestId("history-status").textContent()).toBe(before);
  await edit.getByRole("button", { name: "Duplicate", exact: true }).click();
  await expect(lanes.locator("[data-transaction-id]")).toHaveCount(2);
  const copied = lanes.locator("[data-transaction-id]").filter({ hasText: "Read burst Copy" });
  await expect(copied).toHaveCount(1);
  await copied.click();
  await expect(page.getByTestId("inspector").getByLabel("Transaction start")).toHaveValue("1");
  await expect(page.getByTestId("inspector").getByLabel("Transaction end")).toHaveValue("5");
  await expect(page.getByTestId("inspector").getByLabel("Transaction lane")).toHaveValue("lane_0");
});

test("Bottom Transaction editor deletes its displayed stable target", async ({ page }) => {
  await page.goto("/");
  const transaction = { id: "txn_delete", name: "Delete me", start: 1, end: 4, laneId: "lane_0" };
  await openJson(page, { ...base("transaction-delete", "Transaction Delete", [data], [data.id]), transactions: [transaction] });
  await page.getByLabel("Ribbon tabs").getByRole("button", { name: "Transaction", exact: true }).click();
  const editor = page.getByTestId("transaction-editor");
  await editor.locator(".transaction-list").getByRole("button", { name: /Delete me/ }).click();
  await expect(editor.getByTestId("bottom-transaction-delete")).toBeVisible();
  await editor.getByTestId("bottom-transaction-delete").click();
  await expect(page.locator("[data-transaction-id='txn_delete']")).toHaveCount(0);
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
});

test("standalone Spacer clipboard preserves height and creates a fresh ID", async ({ page }) => {
  await page.goto("/");
  const baseDocument = base("spacer-clipboard", "Spacer Clipboard", [data], ["spacer_original", data.id]);
  await openJson(page, { ...baseDocument, signalGroups: [{ ...baseDocument.signalGroups[0], spacers: [{ id: "spacer_original", height: 44 }] }] });
  const spacer = page.locator("[data-role='left-row'][data-row-id='spacer_original']");
  await expect(spacer).toHaveCount(1);
  await spacer.click();
  const edit = page.getByTestId("ribbon").locator(".home-edit-group");
  await edit.getByRole("button", { name: "Copy", exact: true }).click();
  await edit.getByRole("button", { name: "Duplicate", exact: true }).click();
  await expect(page.locator("[data-role='left-row'][data-kind='spacer']")).toHaveCount(2);
  const heights = await page.locator("[data-role='left-row'][data-kind='spacer']").evaluateAll((rows) => rows.map((row) => row.getBoundingClientRect().height));
  expect(heights.every((height) => Math.abs(height - 44) <= 1)).toBe(true);
  expect(new Set(await page.locator("[data-role='left-row'][data-kind='spacer']").evaluateAll((rows) => rows.map((row) => row.dataset.rowId))).size).toBe(2);
});
