import { expect, test, type Page } from "@playwright/test";

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
  for (const group of ["History", "Clipboard", "Edit", "Selection", "Visibility", "Arrange", "Properties"]) {
    await expect(ribbon.locator(`[aria-label='${group}']`)).toBeVisible();
  }
  const selectAll = ribbon.getByRole("button", { name: "Select All", exact: true });
  await expect(selectAll).toBeEnabled();
  await expect(selectAll).toHaveAttribute("title", "Select all timing signals");
  const beforeRevision = await page.getByTestId("revision-status").textContent();
  const beforeHistory = await page.getByTestId("history-status").textContent();
  await selectAll.click();
  await expect(page.getByTestId("selection-status")).toHaveText("8 signals");
  await expect(page.getByTestId("revision-status")).toHaveText(beforeRevision!);
  await expect(page.getByTestId("history-status")).toHaveText(beforeHistory!);
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
  await expect(page.getByTestId("selection-status")).toHaveText("REQUEST_paste");
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

test("Rename uses the shared app-owned dialog with atomic Apply and view-only Cancel", async ({ page }) => {
  await ready(page);
  const host = page.getByTestId("cycle-surface");
  const row = host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']");
  await row.click();
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Home", exact: true }).click();
  const beforeRevision = await page.getByTestId("revision-status").textContent();
  const beforeHistory = await page.getByTestId("history-status").textContent();
  await page.getByTestId("ribbon").getByRole("button", { name: "Rename", exact: true }).click();
  await expect(page.getByTestId("rename-dialog")).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByTestId("rename-dialog")).toHaveCount(0);
  await expect(page.getByTestId("revision-status")).toHaveText(beforeRevision!);
  await expect(page.getByTestId("history-status")).toHaveText(beforeHistory!);
  await page.getByTestId("ribbon").getByRole("button", { name: "Rename", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("rename-dialog")).toHaveCount(0);
  await expect(page.getByTestId("revision-status")).toHaveText(beforeRevision!);
  await expect(page.getByTestId("history-status")).toHaveText(beforeHistory!);
  await page.getByTestId("ribbon").getByRole("button", { name: "Rename", exact: true }).click();
  await page.getByLabel("New name").fill("REQUEST_RENAMED");
  await page.getByTestId("apply-rename").click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(page.getByTestId("selection-status")).toHaveText("REQUEST_RENAMED");
  await expect(page.getByTestId("revision-status")).toHaveText("Canonical revision 1");
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
});
