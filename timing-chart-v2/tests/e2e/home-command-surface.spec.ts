import { expect, test, type Page } from "@playwright/test";
import { startInCycleMode } from "./cycle-startup.js";

startInCycleMode(test);

async function ready(page: Page) {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
}

function revisionNumber(value: string | null) {
  const match = value?.match(/Canonical revision (\d+)/);
  expect(match).not.toBeNull();
  return Number(match?.[1]);
}

const clipboardCollisionSignal = {
  id: "sig_shared",
  name: "SHARED",
  type: "binary",
  role: "internal",
  source: { instancePath: [], signalName: "shared" },
  display: { name: "SHARED" },
  values: [{ start: 0, value: 0 }, { start: 4, value: 1 }],
};

function clipboardCollisionDocument(id: string, entities: Record<string, unknown> = {}) {
  return {
    formatVersion: 2,
    document: { id, title: id, header: { subtitle: "", description: "", notes: "", preconditions: [], constraints: [], exceptions: [] }, footer: { figureNumber: "", revision: "V2", text: "" } },
    timeline: { start: 0, end: 8, cycleCount: 8, timeBase: "cycle", edge: "rising", labelAnchors: [] },
    signalGroups: [{ id: "grp_main", name: "Main", rows: [clipboardCollisionSignal.id] }],
    signals: [clipboardCollisionSignal],
    bookmarks: [], timeGroups: [], annotations: [], transactions: [], constraints: [],
    legend: { show: false, orientation: "horizontal", usedRolesOnly: true, position: { x: 0, y: 0 } },
    layout: { roleColumnWidth: 62, signalNameWidth: 178, signalNameAlign: "left", rowHeight: 30, signalSpacing: 4, overflow: "ellipsis" },
    checkSettings: {},
    ...entities,
  };
}

async function openJson(page: Page, value: unknown) {
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "clipboard-collision.tcd.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(value)) });
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true");
}

test("Home exposes grouped command surfaces and provides stable-ID Select All", async ({ page }) => {
  await ready(page);
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Home", exact: true }).click();
  const ribbon = page.getByTestId("ribbon");
  // The former separate History/Clipboard/Selection/Visibility/Arrange
  // groups were consolidated into one "Edit" major-group by the Ribbon
  // redesign; "Properties" is exposed today as the "Options" major-group.
  // Verify the consolidated group and its individual commands are still
  // all genuinely present, rather than the pre-redesign group layout.
  await expect(ribbon.locator("[data-major-group='Edit']")).toBeVisible();
  await expect(ribbon.locator("[data-major-group='Options']")).toBeVisible();
  const editGroup = ribbon.locator("[data-major-group='Edit']");
  for (const command of ["Undo", "Redo", "Cut", "Copy", "Paste", "Delete", "Duplicate", "Select All Signals"]) {
    await expect(editGroup.locator(`[aria-label='${command}']`)).toBeVisible();
  }
  const selectAll = ribbon.getByRole("button", { name: "Select All Signals", exact: true });
  await expect(selectAll).toBeEnabled();
  const beforeRevision = await page.getByTestId("revision-status").textContent();
  const beforeHistory = await page.getByTestId("history-status").textContent();
  await selectAll.click();
  await expect(page.getByTestId("selection-status")).toHaveText("8 signals");
  await expect(page.getByTestId("revision-status")).toHaveText(beforeRevision!);
  await expect(page.getByTestId("history-status")).toHaveText(beforeHistory!);
});

// #416 Home Ribbon cleanup: "Edit Interval" (a pure `setRibbonTab("Timeline")`
// duplicate of the already-present Timeline tab) and "Time Group" (a
// duplicate of the Timeline Ribbon's own "Create" button, since TimeGroup
// is Timeline-domain, not Home's) were removed from this group entirely --
// not kept as disabled/hidden. "Normalize Spacing" is a different feature
// (layout clamp) and stays.
test("Home command labels describe their observable action", async ({ page }) => {
  await ready(page);
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Home", exact: true }).click();
  const layout = page.getByTestId("ribbon").locator(".home-layout-group");
  await expect(layout.getByRole("button", { name: "Normalize row spacing", exact: true })).toHaveAttribute("title", "Normalize row height and signal spacing to the supported minimums.");
  await expect(layout.getByRole("button", { name: "Open Timeline interval editor", exact: true })).toHaveCount(0);
  await expect(layout.getByRole("button", { name: "Create Time Group", exact: true })).toHaveCount(0);
  await expect(layout.getByRole("button", { name: "Align interval", exact: true })).toHaveCount(0);
  await expect(layout.getByRole("button", { name: "Group", exact: true })).toHaveCount(0);
  await expect(layout.getByRole("button", { name: "Auto Layout", exact: true })).toHaveCount(0);
  // The real, non-duplicate route to Timeline is the tab itself.
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Timeline", exact: true }).click();
  await expect(page.locator(".ribbon-tabs").getByRole("button", { name: "Timeline", exact: true })).toHaveClass(/active/);
});

test("Copy is view-only and Duplicate/Paste use one canonical command with fresh stable IDs", async ({ page }) => {
  await ready(page);
  const host = page.getByTestId("cycle-surface");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Home", exact: true }).click();
  const ribbon = page.getByTestId("ribbon");
  const beforeRevision = await page.getByTestId("revision-status").textContent();
  const beforeHistory = await page.getByTestId("history-status").textContent();
  const initialRevision = revisionNumber(beforeRevision);
  await ribbon.getByRole("button", { name: "Copy", exact: true }).click();
  await expect(ribbon.getByTestId("clipboard-status")).toHaveText("Copied REQUEST");
  await expect(page.getByTestId("revision-status")).toHaveText(beforeRevision!);
  await expect(page.getByTestId("history-status")).toHaveText(beforeHistory!);
  await ribbon.locator(".home-edit-group").getByRole("button", { name: "Duplicate", exact: true }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(page.getByTestId("selection-status")).toHaveText("REQUEST_duplicate");
  expect(revisionNumber(await page.getByTestId("revision-status").textContent())).toBe(initialRevision + 1);
  await expect(page.getByTestId("history-status")).toHaveText(/History 1 \/ Redo 0/);
  const ids = await host.locator("[data-role='frozen-row']").evaluateAll((rows) => rows.map((row) => row.getAttribute("data-row-id")));
  expect(new Set(ids).size).toBe(ids.length);
  await page.getByTestId("ribbon").getByRole("button", { name: "Undo", exact: true }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(page.getByTestId("history-status")).toHaveText(/History 0 \/ Redo 1/);
  await ribbon.getByRole("button", { name: "Paste", exact: true }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(page.getByTestId("selection-status")).toHaveText("REQUEST_copy");
  expect(revisionNumber(await page.getByTestId("revision-status").textContent())).toBe(initialRevision + 3);
  await expect(page.getByTestId("history-status")).toHaveText(/History 1 \/ Redo 0/);
});

test("cross-document clipboard provenance rejects a paste atomically", async ({ page }) => {
  await ready(page);
  const host = page.getByTestId("cycle-surface");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  const ribbon = page.getByTestId("ribbon");
  await ribbon.getByRole("button", { name: "Copy", exact: true }).click();
  await expect(page.getByTestId("clipboard-status")).toHaveText("Copied REQUEST");

  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  await ribbon.getByRole("button", { name: "New", exact: true }).click();
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
  await page.getByRole("button", { name: "Home", exact: true }).click();
  const paste = ribbon.getByRole("button", { name: "Paste", exact: true });
  await expect(paste).toBeEnabled();
  await paste.click();

  await expect(page.getByTestId("clipboard-status")).toHaveText("Paste rejected: clipboard belongs to another document");
  await expect(page.getByTestId("revision-status")).toHaveText("Canonical revision 0");
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
  await expect(page.getByTestId("dirty-status")).toHaveText("Clean");
});

test("annotation clipboard rejects a colliding foreign Signal ID without retargeting", async ({ page }) => {
  await page.goto("/");
  const annotation = {
    id: "ann_source",
    type: "ghostTrace",
    label: "Foreign trace",
    visible: true,
    sourceSignalId: clipboardCollisionSignal.id,
    start: { signalId: clipboardCollisionSignal.id, cycle: 1, point: "cycle-start" },
    end: { signalId: clipboardCollisionSignal.id, cycle: 3, point: "cycle-end" },
    traceOffsetCycles: 0,
    opacity: 0.5,
  };
  await openJson(page, clipboardCollisionDocument("doc_a", { annotations: [annotation] }));
  await page.getByLabel("Ribbon tabs").getByRole("button", { name: "Annotation", exact: true }).click();
  await page.locator(".bottom-tabs").getByRole("tab", { name: "Annotation", exact: true }).click();
  await page.getByTestId("annotation-list").locator("[data-annotation-list-id='ann_source']").click();
  await page.getByLabel("Ribbon tabs").getByRole("button", { name: "Home", exact: true }).click();
  const ribbon = page.getByTestId("ribbon");
  const edit = ribbon.locator(".home-edit-group");
  await edit.getByRole("button", { name: "Copy", exact: true }).click();
  await expect(ribbon.getByTestId("clipboard-status")).toHaveText(/Copied .* annotation/);

  await openJson(page, clipboardCollisionDocument("doc_b"));
  await page.getByLabel("Ribbon tabs").getByRole("button", { name: "Home", exact: true }).click();
  await edit.getByRole("button", { name: "Paste", exact: true }).click();
  await expect(ribbon.getByTestId("clipboard-status")).toHaveText("Paste rejected: clipboard belongs to another document");
  await expect(page.getByTestId("annotation-count-status")).toHaveText("Annotations: 0");
  await expect(page.getByTestId("revision-status")).toHaveText("Canonical revision 0");
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
  await expect(page.getByTestId("dirty-status")).toHaveText("Clean");
  await expect(page.getByTestId("problems-status")).toHaveText("Problems: 1");
  await page.getByLabel("Bottom context panels").getByRole("tab", { name: "Problems", exact: true }).click();
  await expect(page.getByTestId("problems-panel")).toContainText("CLIPBOARD_FOREIGN_DOCUMENT");
});

test("transaction clipboard rejects a colliding foreign linked Signal ID without retargeting", async ({ page }) => {
  await page.goto("/");
  const transaction = { id: "txn_source", name: "Foreign transaction", start: 1, end: 3, laneId: "lane_0", linkedSignals: [clipboardCollisionSignal.id] };
  await openJson(page, clipboardCollisionDocument("doc_a", { transactions: [transaction] }));
  await page.getByLabel("Ribbon tabs").getByRole("button", { name: "Transaction", exact: true }).click();
  await page.getByTestId("transaction-lanes").locator("[data-transaction-id='txn_source']").click();
  await page.getByLabel("Ribbon tabs").getByRole("button", { name: "Home", exact: true }).click();
  const ribbon = page.getByTestId("ribbon");
  const edit = ribbon.locator(".home-edit-group");
  await edit.getByRole("button", { name: "Copy", exact: true }).click();
  await expect(ribbon.getByTestId("clipboard-status")).toHaveText(/Copied .* transaction/);

  await openJson(page, clipboardCollisionDocument("doc_b"));
  await page.getByLabel("Ribbon tabs").getByRole("button", { name: "Home", exact: true }).click();
  await edit.getByRole("button", { name: "Paste", exact: true }).click();
  await expect(ribbon.getByTestId("clipboard-status")).toHaveText("Paste rejected: clipboard belongs to another document");
  await expect(page.locator(".editor-shell")).toHaveAttribute("data-transaction-count", "0");
  await expect(page.getByTestId("revision-status")).toHaveText("Canonical revision 0");
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
  await expect(page.getByTestId("dirty-status")).toHaveText("Clean");
  await expect(page.getByTestId("problems-status")).toHaveText("Problems: 1");
});

test("multi-selection clipboard preserves stable IDs and commits Duplicate/Cut as one operation", async ({ page }) => {
  await ready(page);
  const host = page.getByTestId("cycle-surface");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_ready']").click({ modifiers: ["Control"] });
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Home", exact: true }).click();
  const ribbon = page.getByTestId("ribbon");
  const revisionBeforeCopy = await page.getByTestId("revision-status").textContent();
  const historyBeforeCopy = await page.getByTestId("history-status").textContent();
  await ribbon.getByRole("button", { name: "Copy", exact: true }).click();
  await expect(ribbon.getByTestId("clipboard-status")).toHaveText("Copied 2 signals");
  await expect(page.getByTestId("revision-status")).toHaveText(revisionBeforeCopy!);
  await expect(page.getByTestId("history-status")).toHaveText(historyBeforeCopy!);
  await ribbon.getByRole("button", { name: "Duplicate", exact: true }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(ribbon.getByTestId("clipboard-status")).toHaveText("Duplicated 2 signals");
  await expect(page.getByTestId("selection-status")).toHaveText("2 signals");
  await expect(page.getByTestId("revision-status")).toHaveText("Canonical revision 1");
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  const ids = await host.locator("[data-role='frozen-row']").evaluateAll((rows) => rows.map((row) => row.getAttribute("data-row-id")));
  expect(new Set(ids).size).toBe(ids.length);
  await ribbon.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 1");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_ready']").click({ modifiers: ["Control"] });
  await ribbon.getByRole("button", { name: "Cut", exact: true }).click();
  await expect(ribbon.getByTestId("clipboard-status")).toHaveText("Cut 2 signals");
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await expect(host.locator("[data-row-id='sig_cycle_request'], [data-row-id='sig_cycle_ready']")).toHaveCount(0);
});

test("multi-selection Delete commits selected stable IDs as one atomic operation", async ({ page }) => {
  await ready(page);
  const host = page.getByTestId("cycle-surface");
  const request = host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']");
  const readyRow = host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_ready']");
  await request.click();
  await readyRow.click({ modifiers: ["Control"] });
  await expect(page.getByTestId("selection-status")).toHaveText("2 signals");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Home", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Delete", exact: true }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(host.locator("[data-row-id='sig_cycle_request']")).toHaveCount(0);
  await expect(host.locator("[data-row-id='sig_cycle_ready']")).toHaveCount(0);
  await expect(page.getByTestId("revision-status")).toHaveText("Canonical revision 1");
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
});

test("Transaction mode multi-selection uses the shared clipboard target set", async ({ page }) => {
  await ready(page);
  await page.getByLabel("Ribbon tabs").getByRole("button", { name: "Transaction", exact: true }).click();
  const first = page.getByTestId("transaction-left-tree-row-demo_txn_read");
  const second = page.getByTestId("transaction-left-tree-row-demo_txn_write");
  await first.click();
  await second.click({ modifiers: ["Control"] });
  await expect(page.getByTestId("selection-status")).toHaveText("2 transactions");
  const ribbon = page.getByTestId("ribbon");
  await ribbon.getByRole("button", { name: "Copy", exact: true }).click();
  await expect(ribbon.getByTestId("clipboard-status")).toHaveText("Copied 2 transactions");
  await ribbon.getByRole("button", { name: "Duplicate", exact: true }).click();
  await expect(ribbon.getByTestId("clipboard-status")).toHaveText("Duplicated 2 transactions");
  await expect(page.getByTestId("selection-status")).toHaveText("2 transactions");
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
});

test("multi-signal capability batches visibility and disables primary-only commands", async ({ page }) => {
  await ready(page);
  const host = page.getByTestId("cycle-surface");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_ready']").click({ modifiers: ["Control"] });
  await expect(page.getByTestId("selection-status")).toHaveText("2 signals");
  const ribbon = page.getByTestId("ribbon");
  await expect(ribbon.getByRole("button", { name: "Move selected row up", exact: true })).toBeDisabled();
  await expect(ribbon.getByRole("button", { name: "Move selected row down", exact: true })).toBeDisabled();
  await ribbon.getByRole("button", { name: "More", exact: true }).click();
  const overflow = page.getByRole("menu", { name: "More Home Commands" });
  await expect(overflow.getByRole("button", { name: "Rename", exact: true })).toBeDisabled();
  await expect(overflow.getByRole("button", { name: "Move Up", exact: true })).toBeDisabled();
  await expect(overflow.getByRole("button", { name: "Move Down", exact: true })).toBeDisabled();
  await expect(overflow.getByRole("button", { name: "Hide", exact: true })).toBeEnabled();
  await overflow.getByRole("button", { name: "Hide", exact: true }).click();
  await expect(host.locator("[data-role='wave-owner'][data-signal-id='sig_cycle_request'], [data-role='wave-owner'][data-signal-id='sig_cycle_ready']")).toHaveCount(0);
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await ribbon.getByRole("button", { name: "More", exact: true }).click();
  const showOverflow = page.getByRole("menu", { name: "More Home Commands" });
  await expect(showOverflow.getByRole("button", { name: "Show", exact: true })).toBeEnabled();
  await expect(showOverflow.getByRole("button", { name: "Hide", exact: true })).toBeDisabled();
  await showOverflow.getByRole("button", { name: "Show", exact: true }).click();
  await expect(host.locator("[data-role='wave-owner'][data-signal-id='sig_cycle_request'], [data-role='wave-owner'][data-signal-id='sig_cycle_ready']")).toHaveCount(2);
  await expect(page.getByTestId("history-status")).toHaveText("History 2 / Redo 0");
});

test("Cut uses the clipboard surface and one canonical delete operation", async ({ page }) => {
  await ready(page);
  const host = page.getByTestId("cycle-surface");
  const row = host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']");
  await row.click();
  const surface = host.locator("[data-role='timing-chart-surface']");
  const before = JSON.parse(await surface.getAttribute("data-render-counters") ?? "null") as Record<string, number>;
  const ribbon = page.getByTestId("ribbon");
  await ribbon.getByRole("button", { name: "Cut", exact: true }).click();
  await expect(page.getByTestId("clipboard-status")).toHaveText("Cut REQUEST");
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await expect(host).toHaveAttribute("data-canonical-revision", "1");
  await expect(host.locator("[data-row-id='sig_cycle_request']")).toHaveCount(0);
  const after = JSON.parse(await surface.getAttribute("data-render-counters") ?? "null") as Record<string, number>;
  expect(after.waveDromRenders).toBe(before.waveDromRenders);
  expect(after.localGeometryBuilds).toBe(before.localGeometryBuilds);
  await page.keyboard.press("Control+V");
  await expect(page.getByTestId("clipboard-status")).toContainText("Pasted");
  await expect(page.getByTestId("history-status")).toHaveText("History 2 / Redo 0");
});

test("Visibility and Arrange route through semantic commands", async ({ page }) => {
  await ready(page);
  const host = page.getByTestId("cycle-surface");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Home", exact: true }).click();
  const ribbon = page.getByTestId("ribbon");
  const surface = host.locator("[data-role='timing-chart-surface']");
  const before = JSON.parse(await surface.getAttribute("data-render-counters") ?? "null") as Record<string, number>;
  await ribbon.getByRole("button", { name: "More", exact: true }).click();
  const overflow = page.getByRole("menu", { name: "More Home Commands" });
  await overflow.getByRole("button", { name: "Hide", exact: true }).click();
  await expect(host.locator("[data-role='wave-owner'][data-signal-id='sig_cycle_request']")).toHaveCount(0);
  await ribbon.getByRole("button", { name: "More", exact: true }).click();
  await page.getByRole("menu", { name: "More Home Commands" }).getByRole("button", { name: "Show", exact: true }).click();
  await expect(host.locator("[data-role='wave-owner'][data-signal-id='sig_cycle_request']")).toHaveCount(1);
  await ribbon.getByRole("button", { name: "More", exact: true }).click();
  await page.getByRole("menu", { name: "More Home Commands" }).getByRole("button", { name: "Move Down", exact: true }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  const after = JSON.parse(await surface.getAttribute("data-render-counters") ?? "null") as Record<string, number>;
  expect(after.waveDromRenders).toBeGreaterThanOrEqual(before.waveDromRenders);
  await expect(page.getByTestId("history-status")).toHaveText(/History 3 \/ Redo 0/);
});

test("Context Menu exposes shared commands", async ({ page }) => {
  await ready(page);
  const host = page.getByTestId("cycle-surface");
  const row = host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']");
  await row.locator("[data-role='frozen-signal-name']").click({ button: "right" });
  const menu = page.getByTestId("signal-context-menu");
  await expect(menu).toBeVisible();
  for (const label of ["Copy", "Cut", "Paste", "Duplicate", "Move Up", "Move Down", "Show", "Hide", "Rename", "Delete"]) await expect(menu.getByRole("menuitem", { name: label, exact: true })).toBeVisible();
  const revision = await page.getByTestId("revision-status").textContent();
  const history = await page.getByTestId("history-status").textContent();
  await menu.getByRole("menuitem", { name: "Copy", exact: true }).click();
  await expect(row).toBeFocused();
  await expect(page.getByTestId("revision-status")).toHaveText(revision!);
  await expect(page.getByTestId("history-status")).toHaveText(history!);
  await row.locator("[data-role='frozen-signal-name']").click({ button: "right" });
  await page.getByTestId("signal-context-menu").getByRole("menuitem", { name: "Duplicate", exact: true }).click();
  await expect(page.getByTestId("selection-status")).toHaveText("REQUEST_duplicate");
  await expect(page.getByTestId("revision-status")).toHaveText("Canonical revision 1");
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
});

test("right-click on an already-selected member of a multi-selection preserves it (#195)", async ({ page }) => {
  await ready(page);
  const host = page.getByTestId("cycle-surface");
  const request = host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']");
  const readyRow = host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_ready']");
  const validRow = host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_valid']");
  await request.click();
  await readyRow.click({ modifiers: ["Control"] });
  await validRow.click({ modifiers: ["Control"] });
  await expect(page.getByTestId("selection-status")).toHaveText("3 signals");
  // Right-clicking a member already inside the 3-signal selection must not
  // collapse it down to that one member.
  await readyRow.locator("[data-role='frozen-signal-name']").click({ button: "right" });
  const menu = page.getByTestId("signal-context-menu");
  await expect(menu).toBeVisible();
  await expect(page.getByTestId("selection-status")).toHaveText("3 signals");
  await menu.getByRole("menuitem", { name: "Copy", exact: true }).click();
  await expect(page.getByTestId("ribbon").getByTestId("clipboard-status")).toHaveText("Copied 3 signals");
  await page.keyboard.press("Escape");
  // Right-clicking an unselected row switches the context target to it, as
  // a fresh single selection (the other documented deterministic policy).
  const requestOnly = host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']");
  const validOnly = host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_valid']");
  await requestOnly.click();
  await validOnly.click({ modifiers: ["Control"] });
  await expect(page.getByTestId("selection-status")).toHaveText("2 signals");
  const unselected = host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_ready']");
  await unselected.locator("[data-role='frozen-signal-name']").click({ button: "right" });
  await expect(page.getByTestId("signal-context-menu")).toBeVisible();
  await expect(page.getByTestId("selection-status")).toHaveText("READY");
});

for (const viewport of [{ width: 1672, height: 941 }, { width: 1366, height: 768 }, { width: 1280, height: 720 }]) {
  test(`clamps the non-Home context menu at every viewport corner (${viewport.width}x${viewport.height})`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await ready(page);
    const row = page.getByTestId("cycle-surface").locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']");
    const corners = [[1, 1], [viewport.width - 1, 1], [1, viewport.height - 1], [viewport.width - 1, viewport.height - 1]] as const;
    const before = await Promise.all([
      page.getByTestId("revision-status").textContent(),
      page.getByTestId("history-status").textContent(),
      page.getByTestId("dirty-status").textContent(),
    ]);
    for (const [x, y] of corners) {
      await row.evaluate((element, point) => element.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: point.x, clientY: point.y })), { x, y });
      const menu = page.getByTestId("signal-context-menu");
      await expect(menu).toBeVisible();
      const bounds = await menu.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, viewportWidth: window.innerWidth, viewportHeight: window.innerHeight, positioned: element.dataset.positioned };
      });
      expect(bounds.positioned).toBe("true");
      expect(bounds.left, JSON.stringify(bounds)).toBeGreaterThanOrEqual(8);
      expect(bounds.top).toBeGreaterThanOrEqual(8);
      expect(bounds.right).toBeLessThanOrEqual(bounds.viewportWidth - 8);
      expect(bounds.bottom).toBeLessThanOrEqual(bounds.viewportHeight - 8);
      await page.keyboard.press("Escape");
      await expect(menu).toBeHidden();
    }
    const after = await Promise.all([
      page.getByTestId("revision-status").textContent(),
      page.getByTestId("history-status").textContent(),
      page.getByTestId("dirty-status").textContent(),
    ]);
    expect(after).toEqual(before);
  });
}

test("Command enablement stays aligned for annotation selection", async ({ page }) => {
  await ready(page);
  const host = page.getByTestId("cycle-surface");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Annotation", exact: true }).click();
  const tools = page.getByTestId("annotation-toolbar");
  await tools.getByRole("button", { name: "Add annotation" }).click();
  const annotation = host.locator("[data-role='annotation-owner'][data-annotation-id]").first();
  await expect(annotation).toBeVisible();
  await annotation.dispatchEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 320, clientY: 240 });
  const menu = page.getByRole("menu", { name: "Annotation context menu" });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Copy", exact: true })).toBeEnabled();
  await expect(menu.getByRole("menuitem", { name: "Cut", exact: true })).toBeEnabled();
  await expect(menu.getByRole("menuitem", { name: "Duplicate", exact: true })).toBeEnabled();
  await expect(menu.getByRole("menuitem", { name: "Delete", exact: true })).toBeEnabled();
  for (const label of ["Move Up", "Move Down", "Show", "Hide", "Rename"]) {
    await expect(menu.getByRole("menuitem", { name: label, exact: true })).toBeDisabled();
  }
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Home", exact: true }).click();
  const ribbon = page.getByTestId("ribbon");
  const edit = ribbon.locator(".home-edit-group");
  await expect(edit.getByRole("button", { name: "Copy", exact: true })).toBeEnabled();
  await expect(edit.getByRole("button", { name: "Duplicate", exact: true })).toBeEnabled();
  await expect(edit.getByRole("button", { name: "Delete", exact: true })).toBeEnabled();
  await ribbon.getByRole("button", { name: "More", exact: true }).click();
  const overflow = page.getByRole("menu", { name: "More Home Commands" });
  await expect(overflow.getByRole("button", { name: "Copy", exact: true })).toBeEnabled();
  await expect(overflow.getByRole("button", { name: "Duplicate", exact: true })).toBeEnabled();
  await expect(overflow.getByRole("button", { name: "Show", exact: true })).toBeDisabled();
  await expect(overflow.getByRole("button", { name: "Hide", exact: true })).toBeDisabled();
  await expect(overflow.getByRole("button", { name: "Rename", exact: true })).toBeDisabled();
});

for (const viewport of [{ width: 1672, height: 941 }, { width: 1366, height: 768 }, { width: 1280, height: 720 }]) {
  test(`Annotation ribbon's Arrange dropdown stays inside the viewport at ${viewport.width}x${viewport.height} (#197)`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await ready(page);
    const host = page.getByTestId("cycle-surface");
    await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
    await page.locator(".ribbon-tabs").getByRole("button", { name: "Annotation", exact: true }).click();
    await page.getByTestId("annotation-toolbar").getByRole("button", { name: "Add annotation" }).click();
    await expect(host.locator("[data-role='annotation-owner'][data-annotation-id]")).toHaveCount(1);
    const before = await Promise.all([
      page.getByTestId("revision-status").textContent(),
      page.getByTestId("history-status").textContent(),
      page.getByTestId("dirty-status").textContent(),
    ]);
    const trigger = page.getByTestId("ribbon").locator(".arrange-dropdown-trigger");
    await trigger.click();
    const menu = page.locator(".arrange-menu");
    await expect(menu).toBeVisible();
    const bounds = await menu.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, viewportWidth: window.innerWidth, viewportHeight: window.innerHeight };
    });
    expect(bounds.left, JSON.stringify(bounds)).toBeGreaterThanOrEqual(0);
    expect(bounds.top).toBeGreaterThanOrEqual(0);
    expect(bounds.right).toBeLessThanOrEqual(bounds.viewportWidth);
    expect(bounds.bottom).toBeLessThanOrEqual(bounds.viewportHeight);
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    const after = await Promise.all([
      page.getByTestId("revision-status").textContent(),
      page.getByTestId("history-status").textContent(),
      page.getByTestId("dirty-status").textContent(),
    ]);
    expect(after).toEqual(before);
  });
}

test("Rename uses the shared app-owned dialog with atomic Apply and view-only Cancel", async ({ page }) => {
  await ready(page);
  const host = page.getByTestId("cycle-surface");
  const row = host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']");
  await row.click();
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Home", exact: true }).click();
  const beforeRevision = await page.getByTestId("revision-status").textContent();
  const beforeHistory = await page.getByTestId("history-status").textContent();
  const ribbon = page.getByTestId("ribbon");
  const openRename = async () => {
    await ribbon.getByRole("button", { name: "More", exact: true }).click();
    await page.getByRole("menu", { name: "More Home Commands" }).getByRole("button", { name: "Rename", exact: true }).click();
  };
  await openRename();
  await expect(page.getByTestId("rename-dialog")).toBeVisible();
  await expect(page.getByLabel("New name")).toBeFocused();
  await page.getByTestId("rename-dialog").getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByTestId("rename-dialog")).toHaveCount(0);
  await expect(ribbon.getByRole("button", { name: "More", exact: true })).toBeFocused();
  await expect(page.getByTestId("revision-status")).toHaveText(beforeRevision!);
  await expect(page.getByTestId("history-status")).toHaveText(beforeHistory!);
  await openRename();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("rename-dialog")).toHaveCount(0);
  await expect(ribbon.getByRole("button", { name: "More", exact: true })).toBeFocused();
  await expect(page.getByTestId("revision-status")).toHaveText(beforeRevision!);
  await expect(page.getByTestId("history-status")).toHaveText(beforeHistory!);
  await openRename();
  await page.getByLabel("New name").fill("REQUEST_RENAMED");
  await page.getByTestId("apply-rename").click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(page.getByTestId("selection-status")).toHaveText("REQUEST_RENAMED");
  await expect(page.getByTestId("revision-status")).toHaveText("Canonical revision 1");
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
});

// #439: label wrapping / button width standardization.
async function homeButtonLineTexts(page: Page, label: string) {
  const ribbon = page.getByTestId("ribbon");
  const button = ribbon.locator("[data-major-group] button, [data-testid='find-replace-trigger']").filter({ hasText: label }).first();
  return button.evaluate((el) => {
    const labelSpan = el.querySelector(".ds-ribbon-label");
    const textNode = [...labelSpan!.childNodes].find((node) => node.nodeType === 3) ?? labelSpan!.firstChild!;
    const lines: string[] = [];
    let current = "";
    let lastTop: number | null = null;
    for (let i = 0; i < textNode.textContent!.length; i++) {
      const range = document.createRange();
      range.setStart(textNode, i);
      range.setEnd(textNode, i + 1);
      const top = range.getBoundingClientRect().top;
      const ch = textNode.textContent![i];
      if (lastTop === null || Math.abs(top - lastTop) < 2) current += ch;
      else { lines.push(current); current = ch; }
      lastTop = top;
    }
    lines.push(current);
    return lines;
  });
}

for (const viewport of [{ width: 1672, height: 941 }, { width: 1280, height: 720 }]) {
  test(`Home Ribbon labels wrap at word boundaries only, within 2 lines, no overflow at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await ready(page);
    const ribbon = page.getByTestId("ribbon");
    // Every one of these previously either broke mid-word (e.g.
    // "Duplicate" -> "Duplica"/"te", "Normalize" -> "Normal"/"ize") or
    // wrapped to 3-4 lines ("Create Time Group", removed from Home
    // entirely by #416 -- see the Home Ribbon cleanup note above).
    const labels = ["Duplicate", "Select All", "Zoom In", "Find & Replace", "Fit Selection", "Auto Space"];
    for (const label of labels) {
      const lines = await homeButtonLineTexts(page, label);
      expect(lines.length, `"${label}" line count`).toBeLessThanOrEqual(2);
      // A wrapped label's lines, rejoined with a single space and trimmed,
      // must reconstruct the full label exactly -- the only way that holds
      // is if every break fell on a real word boundary (a mid-word break
      // instead splits a word into two fragments neither of which matches
      // the original tokens, e.g. "Duplica" + "te").
      const rejoined = lines.map((line) => line.trim()).filter(Boolean).join(" ");
      expect(rejoined, `"${label}" wrapped lines must rejoin to the exact label`).toBe(label);
    }
    await expect(ribbon).toHaveJSProperty("scrollWidth", await ribbon.evaluate((el) => el.clientWidth));
  });
}
