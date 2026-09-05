import { expect, test, type Page } from "@playwright/test";
import { cycleDocument } from "../../apps/editor/src/fixtures-cycle-reference-documents.js";

const periodOneClockDocument = {
  ...cycleDocument,
  signals: cycleDocument.signals.map((signal) => signal.type === "clock" ? { ...signal, generator: { ...signal.generator, period: 1 } } : signal),
};

async function openPeriodOneClockDocument(page: Page): Promise<void> {
  await page.goto("/");
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "timeline-period-one.tcd", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(periodOneClockDocument)) });
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true");
}

async function selectTimelineTransformRange(page: Page): Promise<void> {
  await page.getByLabel("Timeline range end").fill("4");
  await page.getByLabel("Timeline range start").fill("2");
}

test("selects a cycle from Canvas geometry and the exclusive terminal boundary from shared mapping", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Timeline", exact: true }).click();
  const surface = host.locator("[data-role='timing-chart-surface']");
  const wave = host.locator("[data-role='stable-waveform-surface']");
  const owner = wave.locator("[data-signal-id='sig_cycle_request']");
  const cycleTick = page.getByTestId("cycle-ruler").locator("[data-cycle='5']");
  const tickBox = await cycleTick.boundingBox();
  const ownerBox = await owner.boundingBox();
  expect(tickBox).not.toBeNull();
  expect(ownerBox).not.toBeNull();
  await page.mouse.click(tickBox!.x + 1, ownerBox!.y + ownerBox!.height / 2);
  await expect(host).toHaveAttribute("data-selected-cycle", "5");
  await expect(page.getByLabel("Timeline range start")).toHaveValue("5");
  await expect(page.getByTestId("revision-status")).toHaveText("Canonical revision 0");
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
  await expect(page.getByTestId("dirty-status")).toHaveText("Clean");
  const terminalTick = page.getByTestId("cycle-ruler").locator("[data-cycle='24']");
  const terminalBox = await terminalTick.boundingBox();
  expect(terminalBox).not.toBeNull();
  await terminalTick.click();
  await expect(host).toHaveAttribute("data-selected-cycle", "24");
  await expect(page.getByLabel("Timeline range end")).toHaveValue("24");
});

test("keeps ruler click suppression scoped to ruler-originated gestures", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Timeline", exact: true }).click();
  const ruler = page.getByTestId("cycle-ruler");
  const wave = host.locator("[data-role='stable-waveform-surface']");
  const owner = wave.locator("[data-signal-id='sig_cycle_request']");
  const ownerBox = await owner.boundingBox();
  expect(ownerBox).not.toBeNull();
  const cyclePoint = async (cycle: number) => {
    const box = await ruler.locator(`[data-cycle='${cycle}']`).boundingBox();
    expect(box).not.toBeNull();
    return { x: box!.x + 1, y: box!.y + box!.height / 2 };
  };
  const state = async () => ({
    revision: await host.getAttribute("data-canonical-revision"),
    history: await host.getAttribute("data-history-depth"),
    dirty: await page.getByTestId("dirty-status").textContent(),
    counters: await host.locator("[data-role='timing-chart-surface']").getAttribute("data-render-counters"),
  });
  const before = await state();
  const waveY = ownerBox!.y + ownerBox!.height / 2;

  const waveClick = await cyclePoint(4);
  await page.mouse.click(waveClick.x, waveY);
  await expect(host).toHaveAttribute("data-selected-cycle", "4");

  // A genuine ruler click immediately after a waveform click must not be swallowed.
  await ruler.locator("[data-cycle='9']").click();
  await expect(host).toHaveAttribute("data-selected-cycle", "9");
  await expect(page.getByLabel("Timeline range start")).toHaveValue("9");
  await expect(page.getByLabel("Timeline range end")).toHaveValue("10");

  const waveStart = await cyclePoint(2);
  const waveEnd = await cyclePoint(6);
  await page.mouse.move(waveStart.x, waveY);
  await page.mouse.down();
  await page.mouse.move(waveEnd.x, waveY);
  await page.mouse.up();
  await expect(page.getByLabel("Timeline range start")).toHaveValue("2");
  await expect(page.getByLabel("Timeline range end")).toHaveValue("6");

  // A waveform range drag must also leave the next ruler click available.
  await ruler.locator("[data-cycle='11']").click();
  await expect(host).toHaveAttribute("data-selected-cycle", "11");
  await expect(page.getByLabel("Timeline range start")).toHaveValue("11");
  await expect(page.getByLabel("Timeline range end")).toHaveValue("12");

  const rulerStart = await cyclePoint(3);
  const rulerEnd = await cyclePoint(7);
  await page.mouse.move(rulerStart.x, rulerStart.y);
  await page.mouse.down();
  await page.mouse.move(rulerEnd.x, rulerStart.y);
  await page.mouse.up();
  await expect(page.getByLabel("Timeline range start")).toHaveValue("3");
  await expect(page.getByLabel("Timeline range end")).toHaveValue("7");

  // The post-drag synthetic click is consumed, while the next deliberate click works.
  await ruler.locator("[data-cycle='10']").click();
  await expect(host).toHaveAttribute("data-selected-cycle", "10");
  await expect(page.getByLabel("Timeline range start")).toHaveValue("10");
  await expect(page.getByLabel("Timeline range end")).toHaveValue("11");
  expect(await state()).toEqual(before);
});

test("selects Cycle 0 and the terminal boundary from the rendered waveform", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Timeline", exact: true }).click();
  const wave = host.locator("[data-role='stable-waveform-surface']");
  const owner = wave.locator("[data-signal-id='sig_cycle_request']");
  const ownerBox = await owner.boundingBox();
  const cycle0 = await page.getByTestId("cycle-ruler").locator("[data-cycle='0']").boundingBox();
  const terminal = await page.getByTestId("cycle-ruler").locator("[data-cycle='24']").boundingBox();
  expect(ownerBox).not.toBeNull();
  expect(cycle0).not.toBeNull();
  expect(terminal).not.toBeNull();

  const before = {
    revision: await host.getAttribute("data-canonical-revision"),
    history: await host.getAttribute("data-history-depth"),
    dirty: await page.getByTestId("dirty-status").textContent(),
  };
  await page.mouse.click(cycle0!.x + 1, ownerBox!.y + ownerBox!.height / 2);
  await expect(host).toHaveAttribute("data-selected-cycle", "0");
  await expect(page.getByLabel("Timeline range start")).toHaveValue("0");
  await expect(page.getByLabel("Timeline range end")).toHaveValue("1");

  const viewport = page.getByTestId("cycle-viewport");
  await viewport.evaluate((element) => { element.scrollLeft = element.scrollWidth; element.dispatchEvent(new Event("scroll")); });
  const terminalAfterScroll = await page.getByTestId("cycle-ruler").locator("[data-cycle='24']").boundingBox();
  const ownerAfterScroll = await owner.boundingBox();
  expect(terminalAfterScroll).not.toBeNull();
  expect(ownerAfterScroll).not.toBeNull();
  await page.mouse.click(terminalAfterScroll!.x + 1, ownerAfterScroll!.y + ownerAfterScroll!.height / 2);
  await expect(host).toHaveAttribute("data-selected-cycle", "24");
  await expect(page.getByLabel("Timeline range start")).toHaveValue("23");
  await expect(page.getByLabel("Timeline range end")).toHaveValue("24");
  await expect(host).toHaveAttribute("data-canonical-revision", before.revision!);
  await expect(host).toHaveAttribute("data-history-depth", before.history!);
  await expect(page.getByTestId("dirty-status")).toHaveText(before.dirty!);
});

test("selects a half-open range directly on the geometry-derived ruler", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Timeline", exact: true }).click();
  const ruler = page.getByTestId("cycle-ruler");
  await ruler.locator("[data-cycle='5']").click();
  await expect(page.getByLabel("Timeline range start")).toHaveValue("5");
  await expect(page.getByLabel("Timeline range end")).toHaveValue("6");
  await ruler.locator("[data-cycle='8']").click({ modifiers: ["Shift"] });
  await expect(page.getByLabel("Timeline range start")).toHaveValue("5");
  await expect(page.getByLabel("Timeline range end")).toHaveValue("9");
  await expect(ruler.locator("[data-range-selected='true']")).toHaveCount(4);
  await expect(page.getByTestId("revision-status")).toHaveText("Canonical revision 0");
});

test("drag-selects a half-open Canvas range with preview-only movement and Escape cancel", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Timeline", exact: true }).click();
  const surface = host.locator("[data-role='timing-chart-surface']");
  const wave = host.locator("[data-role='stable-waveform-surface']");
  const owner = wave.locator("[data-signal-id='sig_cycle_request']");
  const waveBox = await wave.boundingBox();
  const ownerBox = await owner.boundingBox();
  const startBox = await page.getByTestId("cycle-ruler").locator("[data-cycle='3']").boundingBox();
  const endBox = await page.getByTestId("cycle-ruler").locator("[data-cycle='8']").boundingBox();
  expect(waveBox).not.toBeNull();
  expect(ownerBox).not.toBeNull();
  expect(startBox).not.toBeNull();
  expect(endBox).not.toBeNull();
  const y = ownerBox!.y + ownerBox!.height / 2;
  const before = await host.getAttribute("data-canonical-revision");
  const historyBefore = await page.getByTestId("history-status").textContent();
  const dirtyBefore = await page.getByTestId("dirty-status").textContent();
  const countersBefore = await surface.getAttribute("data-render-counters");
  await page.mouse.move(startBox!.x, y);
  await page.mouse.down();
  await page.mouse.move(endBox!.x, y);
  await expect(host).toHaveAttribute("data-range-drag", "active");
  await expect(host).toHaveAttribute("data-canonical-revision", before!);
  await expect(page.getByTestId("history-status")).toHaveText(historyBefore!);
  await expect(page.getByTestId("dirty-status")).toHaveText(dirtyBefore!);
  await expect(surface).toHaveAttribute("data-render-counters", countersBefore!);
  await page.mouse.up();
  await expect(page.getByLabel("Timeline range start")).toHaveValue("3");
  await expect(page.getByLabel("Timeline range end")).toHaveValue("8");
  await expect(host).not.toHaveAttribute("data-range-drag", "active");
  await expect(host).toHaveAttribute("data-canonical-revision", before!);
  await expect(page.getByTestId("history-status")).toHaveText(historyBefore!);
  await expect(page.getByTestId("dirty-status")).toHaveText(dirtyBefore!);
  const extensionBox = await page.getByTestId("cycle-ruler").locator("[data-cycle='10']").boundingBox();
  expect(extensionBox).not.toBeNull();
  await page.mouse.move(endBox!.x, y);
  await page.keyboard.down("Shift");
  await page.mouse.down();
  await page.mouse.move(extensionBox!.x, y);
  await page.mouse.up();
  await page.keyboard.up("Shift");
  await expect(page.getByLabel("Timeline range start")).toHaveValue("3");
  await expect(page.getByLabel("Timeline range end")).toHaveValue("10");
  await page.mouse.move(startBox!.x, y);
  await page.mouse.down();
  await page.mouse.move(endBox!.x, y);
  await page.keyboard.press("Escape");
  await expect(host).not.toHaveAttribute("data-range-drag", "active");
  await page.mouse.up();
  await expect(page.getByLabel("Timeline range start")).toHaveValue("3");
  await expect(page.getByLabel("Timeline range end")).toHaveValue("10");
});

test("positions a transaction ending at cycleCount on the actual terminal ruler geometry", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await page.getByRole("button", { name: "Transaction", exact: true }).click();
  await page.getByLabel("New Transaction name").fill("Terminal transfer");
  await page.getByLabel("New Transaction start").fill("20");
  await page.getByLabel("New Transaction end").fill("24");
  await page.getByTestId("transaction-editor").getByRole("button", { name: "Create Transaction", exact: true }).click();
  const transaction = page.getByTestId("transaction-lanes").locator("[data-transaction-id]");
  const terminal = await page.getByTestId("cycle-ruler").locator("[data-cycle='24']").boundingBox();
  const transactionBox = await transaction.boundingBox();
  expect(terminal).not.toBeNull();
  expect(transactionBox).not.toBeNull();
  expect(Math.abs((transactionBox!.x + transactionBox!.width) - terminal!.x)).toBeLessThanOrEqual(1);
});

test("keeps transaction source-cycle edges aligned after a collapsed TimeGroup", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Timeline", exact: true }).click();
  await page.getByRole("button", { name: "Axis Break", exact: true }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  const tick = page.getByTestId("cycle-ruler").locator("[data-cycle='8']");
  const before = await tick.boundingBox();
  expect(before).not.toBeNull();
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  await expect(page.getByTestId("view-mode-status")).toHaveText("Mode: Transaction");
  await page.getByLabel("New Transaction name").fill("Folded transfer");
  await page.getByLabel("New Transaction start").fill("4");
  await page.getByLabel("New Transaction end").fill("8");
  await page.getByTestId("transaction-editor").getByRole("button", { name: "Create Transaction", exact: true }).click();
  const transaction = page.getByTestId("transaction-lanes").locator("[data-transaction-id]");
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(transaction).toHaveCount(1);
  const after = await transaction.boundingBox();
  expect(after).not.toBeNull();
  expect(Math.abs((after!.x + after!.width) - before!.x)).toBeLessThanOrEqual(1);
});

test("drag-selects a geometry-backed half-open range directly on the cycle ruler", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Timeline", exact: true }).click();
  const ruler = page.getByTestId("cycle-ruler");
  const start = await ruler.locator("[data-cycle='2']").boundingBox();
  const end = await ruler.locator("[data-cycle='6']").boundingBox();
  const reverseStart = await ruler.locator("[data-cycle='6']").boundingBox();
  const reverseEnd = await ruler.locator("[data-cycle='2']").boundingBox();
  const terminal = await ruler.locator("[data-cycle='24']").boundingBox();
  expect(start).not.toBeNull();
  expect(end).not.toBeNull();
  expect(reverseStart).not.toBeNull();
  expect(reverseEnd).not.toBeNull();
  expect(terminal).not.toBeNull();
  const y = start!.y + start!.height / 2;
  const before = {
    revision: await host.getAttribute("data-canonical-revision"),
    history: await page.getByTestId("history-status").textContent(),
    dirty: await page.getByTestId("dirty-status").textContent(),
    counters: await host.locator("[data-role='timing-chart-surface']").getAttribute("data-render-counters"),
  };
  await page.mouse.move(start!.x, y);
  await page.mouse.down();
  await page.mouse.move(end!.x, y);
  await expect(host).toHaveAttribute("data-range-drag", "active");
  await expect(ruler.getByTestId("range-preview")).toBeVisible();
  expect(await host.getAttribute("data-canonical-revision")).toBe(before.revision);
  expect(await page.getByTestId("history-status").textContent()).toBe(before.history);
  expect(await page.getByTestId("dirty-status").textContent()).toBe(before.dirty);
  expect(await host.locator("[data-role='timing-chart-surface']").getAttribute("data-render-counters")).toBe(before.counters);
  await page.mouse.up();
  await expect(page.getByLabel("Timeline range start")).toHaveValue("2");
  await expect(page.getByLabel("Timeline range end")).toHaveValue("6");
  // The ruler band now shows the persisted, committed selection -- not a
  // transient drag preview -- so it correctly stays visible.
  await expect(ruler.getByTestId("range-preview")).toBeVisible();
  await expect(ruler.getByTestId("range-preview")).toHaveAttribute("data-range-start", "2");
  await expect(ruler.getByTestId("range-preview")).toHaveAttribute("data-range-end", "6");

  await page.mouse.move(reverseStart!.x, y);
  await page.mouse.down();
  await page.mouse.move(reverseEnd!.x, y);
  await page.mouse.up();
  await expect(page.getByLabel("Timeline range start")).toHaveValue("2");
  await expect(page.getByLabel("Timeline range end")).toHaveValue("6");

  await page.mouse.move(start!.x, y);
  await page.mouse.down();
  await page.mouse.move(terminal!.x, y);
  await page.mouse.up();
  await expect(page.getByLabel("Timeline range start")).toHaveValue("2");
  await expect(page.getByLabel("Timeline range end")).toHaveValue("24");

  await page.mouse.move(start!.x, y);
  await page.mouse.down();
  await page.mouse.move(end!.x, y);
  await page.keyboard.press("Escape");
  await expect(host).not.toHaveAttribute("data-range-drag", "active");
  // The cancelled drag's own preview is gone, but the previously committed
  // [2, 24) selection is still active, so the band correctly still shows it.
  await expect(ruler.getByTestId("range-preview")).toBeVisible();
  await expect(ruler.getByTestId("range-preview")).toHaveAttribute("data-range-start", "2");
  await expect(ruler.getByTestId("range-preview")).toHaveAttribute("data-range-end", "24");
  await page.mouse.up();
  await expect(page.getByLabel("Timeline range start")).toHaveValue("2");
  await expect(page.getByLabel("Timeline range end")).toHaveValue("24");

  await page.mouse.move(start!.x, y);
  await page.mouse.down();
  await page.mouse.move(end!.x, y);
  await page.mouse.up();
  await expect(page.getByLabel("Timeline range start")).toHaveValue("2");
  await expect(page.getByLabel("Timeline range end")).toHaveValue("6");
});

test("ruler range drag cancels without mutation and remains semantic after scroll and zoom", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  const ruler = page.getByTestId("cycle-ruler");
  const viewport = page.getByTestId("cycle-viewport");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Timeline", exact: true }).click();
  const tick2 = await ruler.locator("[data-cycle='2']").boundingBox();
  const tick6 = await ruler.locator("[data-cycle='6']").boundingBox();
  expect(tick2).not.toBeNull();
  expect(tick6).not.toBeNull();
  const y = tick2!.y + tick2!.height / 2;
  await page.mouse.move(tick2!.x, y);
  await page.mouse.down();
  await page.mouse.move(tick6!.x, y);
  await expect(ruler.getByTestId("range-preview")).toBeVisible();
  await ruler.dispatchEvent("pointercancel", { pointerId: 1, button: 0, clientX: tick6!.x, clientY: y });
  await expect(ruler.getByTestId("range-preview")).not.toBeVisible();
  await page.mouse.up();
  await expect(page.getByLabel("Timeline range start")).toHaveValue("2");
  await expect(page.getByLabel("Timeline range end")).toHaveValue("4");

  await viewport.evaluate((element) => { element.scrollLeft = Math.min(180, element.scrollWidth); element.dispatchEvent(new Event("scroll")); });
  const scrolledStart = await ruler.locator("[data-cycle='5']").boundingBox();
  const scrolledEnd = await ruler.locator("[data-cycle='9']").boundingBox();
  expect(scrolledStart).not.toBeNull();
  expect(scrolledEnd).not.toBeNull();
  await page.mouse.move(scrolledStart!.x, y);
  await page.mouse.down();
  await page.mouse.move(scrolledEnd!.x, y);
  await page.mouse.up();
  await expect(page.getByLabel("Timeline range start")).toHaveValue("5");
  await expect(page.getByLabel("Timeline range end")).toHaveValue("9");

  await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Zoom in" }).click();
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Timeline", exact: true }).click();
  const zoomStart = await ruler.locator("[data-cycle='8']").boundingBox();
  const zoomEnd = await ruler.locator("[data-cycle='12']").boundingBox();
  expect(zoomStart).not.toBeNull();
  expect(zoomEnd).not.toBeNull();
  await page.mouse.move(zoomStart!.x, y);
  await page.mouse.down();
  await page.mouse.move(zoomEnd!.x, y);
  await page.mouse.up();
  await expect(page.getByLabel("Timeline range start")).toHaveValue("8");
  await expect(page.getByLabel("Timeline range end")).toHaveValue("12");
});

test("inserts cycles with full semantic ripple and one Undo entry", async ({ page }) => {
  await openPeriodOneClockDocument(page);
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Timeline", exact: true }).click();
  await selectTimelineTransformRange(page);
  const surface = host.locator("[data-role='timing-chart-surface']");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  const countersBefore = JSON.parse(await surface.getAttribute("data-render-counters") ?? "null") as Record<string, number>;
  await page.getByLabel("Timeline insert count").fill("2");
  await page.getByRole("button", { name: "Insert before" }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(page.getByTestId("revision-status")).toHaveText("Canonical revision 1");
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await expect(page.getByTestId("cycle-ruler").locator("[data-cycle='25']")).toHaveCount(1);
  const editor = page.getByTestId("signal-editor");
  await expect(editor.getByLabel("Start 5")).toHaveValue("5");
  await expect(editor.getByLabel("Start 9")).toHaveValue("9");
  const countersAfter = JSON.parse(await surface.getAttribute("data-render-counters") ?? "null") as Record<string, number>;
  expect(countersAfter.waveDromRenders).toBe(countersBefore.waveDromRenders + 8);
  expect(countersAfter.localGeometryBuilds).toBe(countersBefore.localGeometryBuilds + 8);

  await page.getByTestId("editor-undo").click();
  await expect(page.getByTestId("revision-status")).toHaveText("Canonical revision 2");
  await expect(editor.getByLabel("Start 3")).toHaveValue("3");
  await expect(editor.getByLabel("Start 7")).toHaveValue("7");
});

test("allows ordinary timeline insertion with the default uncontrolled periodic Clock", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Timeline", exact: true }).click();
  await page.getByLabel("Timeline range end").fill("3");
  await page.getByLabel("Timeline range start").fill("2");
  await page.getByLabel("Timeline insert count").fill("2");
  await page.getByRole("button", { name: "Insert before" }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(host).toHaveAttribute("data-canonical-revision", "1");
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await expect(page.getByTestId("cycle-ruler").locator("[data-cycle='26']")).toHaveCount(1);
});

test("deletes a half-open range and preserves the active value at the join", async ({ page }) => {
  await openPeriodOneClockDocument(page);
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Timeline", exact: true }).click();
  await selectTimelineTransformRange(page);
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  const beforeRevision = await host.getAttribute("data-canonical-revision");
  const beforeCounters = await host.locator("[data-role='timing-chart-surface']").getAttribute("data-render-counters");
  await page.getByRole("button", { name: "Delete range" }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  const editor = page.getByTestId("signal-editor");
  await expect(editor.getByLabel("Start 2")).toHaveValue("2");
  await expect(editor.getByLabel("Value 2")).toHaveValue("1");
  await expect(editor.getByLabel("Start 5")).toHaveValue("5");
  // Deleting a range shrinks cycleCount from 24 to 22; the new terminal boundary at cycle 22 must
  // resolve and render, not be silently omitted the way an unresolvable terminal geometry point once
  // caused (see ruler-terminal-boundary.spec.ts).
  await expect(page.getByTestId("cycle-ruler").locator("[data-cycle='22']")).toHaveCount(1);
  await expect(page.getByTestId("cycle-ruler").locator("[data-cycle='23']")).toHaveCount(0);
  await expect(host).toHaveAttribute("data-canonical-revision", String(Number(beforeRevision) + 1));
  const afterCounters = JSON.parse(await host.locator("[data-role='timing-chart-surface']").getAttribute("data-render-counters") ?? "null") as Record<string, number>;
  const initialCounters = JSON.parse(beforeCounters ?? "null") as Record<string, number>;
  expect(afterCounters.waveDromRenders).toBeGreaterThan(initialCounters.waveDromRenders);
  expect(afterCounters.localGeometryBuilds).toBeGreaterThan(initialCounters.localGeometryBuilds);
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");

  await page.getByTestId("editor-undo").click();
  await expect(host).toHaveAttribute("data-canonical-revision", String(Number(beforeRevision) + 2));
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 1");
  await page.getByTestId("editor-redo").click();
  await expect(host).toHaveAttribute("data-canonical-revision", String(Number(beforeRevision) + 3));
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
});

test("creates geometry-positioned Marker without waveform regeneration and a Gap that genuinely compresses the axis", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Timeline", exact: true }).click();
  const surface = host.locator("[data-role='timing-chart-surface']");
  const countersBefore = await surface.getAttribute("data-render-counters");
  const ruler = page.getByTestId("cycle-ruler");
  const cycle2 = Number.parseFloat(await ruler.locator("[data-cycle='2']").evaluate((element) => (element as HTMLElement).style.left));

  await page.getByRole("button", { name: "Add marker" }).click();
  await expect(ruler.locator("[data-bookmark-id]")).toHaveCount(1);
  const markerLeft = Number.parseFloat(await ruler.locator("[data-bookmark-id]").evaluate((element) => (element as HTMLElement).style.left));
  expect(Math.abs(markerLeft - cycle2)).toBeLessThan(1);
  // a Marker is view-geometry only — it must not touch WaveDrom or LocalGeometry.
  expect(await surface.getAttribute("data-render-counters")).toBe(countersBefore);

  await page.getByRole("button", { name: "Axis Break", exact: true }).click();
  const gap = ruler.locator("[data-time-group-id]");
  await expect(gap).toHaveCount(1);

  // the default Timeline range [2, 4) is now genuinely removed from the axis, not just overlaid:
  // its 2 hidden cycles are gone from the Ruler entirely, and the marker that sat inside the
  // hidden range (bookmark start=2) is no longer shown either.
  await expect(ruler.locator("[data-cycle='2']")).toHaveCount(0);
  await expect(ruler.locator("[data-cycle='3']")).toHaveCount(0);
  await expect(ruler.locator("[data-bookmark-id]")).toHaveCount(0);
  // cycle 4's label is preserved (labelAnchors/label mapping keeps the true source number)
  // but it now renders at the position immediately after the fold, where the gap marker sits.
  await expect(ruler.locator("[data-cycle='4']")).toHaveCount(1);
  const resumedLeft = Number.parseFloat(await ruler.locator("[data-cycle='4']").evaluate((element) => (element as HTMLElement).style.left));
  const gapLeft = Number.parseFloat(await gap.evaluate((element) => (element as HTMLElement).style.left));
  expect(Math.abs(gapLeft - resumedLeft)).toBeLessThan(1);

  // collapsing a range is a genuine structural change to the effective timeline (unlike Zoom,
  // a pure view transform), so it is expected — not a bug — that WaveDrom re-renders every
  // signal with the compressed cycle count.
  const countersAfterGap = JSON.parse(await surface.getAttribute("data-render-counters") ?? "null") as { waveDromRenders: number };
  const countersBeforeParsed = JSON.parse(countersBefore ?? "null") as { waveDromRenders: number };
  expect(countersAfterGap.waveDromRenders).toBeGreaterThan(countersBeforeParsed.waveDromRenders);
  await expect(page.getByTestId("history-status")).toHaveText("History 2 / Redo 0");

  await page.getByRole("button", { name: "Delete Gap 2-4" }).click();
  await expect(ruler.locator("[data-time-group-id]")).toHaveCount(0);
  // removing the Gap restores the previously-hidden cycles to the Ruler.
  await expect(ruler.locator("[data-cycle='2']")).toHaveCount(1);
  await expect(ruler.locator("[data-cycle='3']")).toHaveCount(1);
});

test("edits a Time Group through one semantic editor operation and supports Undo", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Timeline", exact: true }).click();
  await page.getByRole("button", { name: "Axis Break", exact: true }).click();
  await page.getByTestId(/time-group-edit-/).click();
  const editor = page.getByTestId("time-group-editor");
  await expect(editor).toBeVisible();
  await editor.getByLabel("Time Group name").fill("Idle Window");
  await editor.getByLabel("Time Group comment").fill("reviewed");
  await editor.getByLabel("Time Group fold label").fill("IDLE");
  await editor.getByLabel("Time Group collapsed").uncheck();
  await editor.getByTestId("apply-time-group").click();
  await expect(page.getByTestId("history-status")).toHaveText("History 2 / Redo 0");
  await expect(page.getByRole("button", { name: "// Idle Window" })).toBeVisible();
  await expect(page.getByTestId("cycle-ruler").locator("[data-time-group-id]")).toHaveCount(0);
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Home", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 1");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Timeline", exact: true }).click();
  await expect(page.getByRole("button", { name: "// Gap 2-4" })).toBeVisible();
  await expect(page.getByTestId("cycle-ruler").locator("[data-time-group-id]")).toHaveCount(1);
});

test("bookmark list jumps to its geometry-backed cycle without changing the document", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Timeline", exact: true }).click();
  await page.getByLabel("Timeline range end").fill("7");
  await page.getByLabel("Timeline range start").fill("6");
  await page.getByRole("button", { name: "Add marker" }).click();
  const bookmark = page.locator("[data-bookmark-id]").first();
  await expect(bookmark).toBeVisible();
  const beforeRevision = await host.getAttribute("data-canonical-revision");
  const beforeHistory = await page.getByTestId("history-status").textContent();
  await page.getByTestId(/bookmark-jump-/).click();
  await expect(host).toHaveAttribute("data-selected-cycle", "6");
  await expect(page.getByLabel("Timeline range start")).toHaveValue("6");
  await expect(page.getByLabel("Timeline range end")).toHaveValue("7");
  await expect(host).toHaveAttribute("data-canonical-revision", beforeRevision!);
  await expect(page.getByTestId("history-status")).toHaveText(beforeHistory!);
});

test("edits a named Bookmark through one semantic operation and preserves it through Save/Open", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Timeline", exact: true }).click();
  await page.getByRole("button", { name: "Add marker" }).click();
  await page.getByTestId(/bookmark-edit-/).click();
  const editor = page.getByTestId("bookmark-editor");
  await editor.getByLabel("Bookmark name").fill("Review Point");
  await editor.getByLabel("Bookmark cycle").fill("9");
  await editor.getByLabel("Bookmark comment").fill("approved");
  await editor.getByTestId("apply-bookmark").click();
  await expect(page.getByTestId("history-status")).toHaveText("History 2 / Redo 0");
  await expect(page.getByTestId(/bookmark-jump-/)).toHaveText("◆ Review Point");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-canonical-revision", "2");

  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Save", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "New", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Recent", exact: true }).click();
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Timeline", exact: true }).click();
  await expect(page.getByTestId(/bookmark-jump-/)).toHaveText("◆ Review Point");
  await page.getByRole("button", { name: "Delete Review Point", exact: true }).click();
  await expect(page.getByTestId(/bookmark-jump-/)).toHaveCount(0);
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Home", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Undo", exact: true }).click();
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Timeline", exact: true }).click();
  await expect(page.getByTestId(/bookmark-jump-/)).toHaveText("◆ Review Point");
});

test("saves and reopens an edited Time Group presentation exactly", async ({ page }) => {
  await page.goto("/");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Timeline", exact: true }).click();
  await page.getByRole("button", { name: "Axis Break", exact: true }).click();
  await page.getByTestId(/time-group-edit-/).click();
  const editor = page.getByTestId("time-group-editor");
  await editor.getByLabel("Time Group name").fill("Saved Fold");
  await editor.getByLabel("Time Group comment").fill("persisted");
  await editor.getByLabel("Time Group fold label").fill("SAVED");
  await editor.getByTestId("apply-time-group").click();
  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Save", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "New", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Recent", exact: true }).click();
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Timeline", exact: true }).click();
  await expect(page.getByRole("button", { name: "// Saved Fold", exact: true })).toBeVisible();
  await expect(page.getByTestId("cycle-ruler").locator("[data-time-group-id]")).toHaveCount(1);
});

test("renders multiple independent Axis Breaks through the shared mapping", async ({ page }) => {
  await page.goto("/");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Timeline", exact: true }).click();
  const ruler = page.getByTestId("cycle-ruler");
  const start = page.getByLabel("Timeline range start");
  const end = page.getByLabel("Timeline range end");
  const axisBreak = page.getByRole("button", { name: "Axis Break", exact: true });

  await start.fill("2");
  await end.fill("4");
  await axisBreak.click();
  await expect(ruler.locator("[data-time-group-id]")).toHaveCount(1);

  await end.fill("10");
  await start.fill("8");
  await axisBreak.click();
  await expect(ruler.locator("[data-time-group-id]")).toHaveCount(2);
  const breakIds = await ruler.locator("[data-time-group-id]").evaluateAll((items) => items.map((item) => (item as HTMLElement).dataset.timeGroupId));
  expect(breakIds.every(Boolean)).toBe(true);
  expect(new Set(breakIds).size).toBe(2);
  for (const cycle of [2, 3, 8, 9]) await expect(ruler.locator(`[data-cycle='${cycle}']`)).toHaveCount(0);
  for (const cycle of [4, 10]) await expect(ruler.locator(`[data-cycle='${cycle}']`)).toHaveCount(1);
  await expect(page.getByTestId("history-status")).toHaveText("History 2 / Redo 0");
});

test("duplicates the selected cycle state range at a destination in one commit", async ({ page }) => {
  await openPeriodOneClockDocument(page);
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Timeline", exact: true }).click();
  await selectTimelineTransformRange(page);
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  await page.getByLabel("Timeline destination").fill("8");
  await page.getByRole("button", { name: "Duplicate to" }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  const editor = page.getByTestId("signal-editor");
  await expect(editor.getByLabel("Start 9")).toHaveValue("9");
  await expect(editor.getByLabel("Value 9")).toHaveValue("1");
  await expect(editor.getByLabel("Start 10")).toHaveValue("10");
  await expect(editor.getByLabel("Value 10")).toHaveValue("0");
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await expect(page.getByTestId("cycle-ruler").locator("[data-cycle='25']")).toHaveCount(1);
});

test("moves the selected range by cycle permutation without changing timeline length", async ({ page }) => {
  await openPeriodOneClockDocument(page);
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Timeline", exact: true }).click();
  await selectTimelineTransformRange(page);
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  await page.getByLabel("Timeline destination").fill("8");
  await page.getByRole("button", { name: "Move to" }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  const editor = page.getByTestId("signal-editor");
  await expect(editor.getByLabel("Start 2")).toHaveValue("2");
  await expect(editor.getByLabel("Start 5")).toHaveValue("5");
  await expect(editor.getByLabel("Start 9")).toHaveValue("9");
  await expect(editor.getByLabel("Start 10")).toHaveValue("10");
  await expect(page.getByTestId("cycle-ruler").locator("[data-cycle='23']")).toHaveCount(1);
  // Moving a range within the timeline does not change cycleCount (still 24); the terminal boundary
  // tick at cycle 24 must resolve and render like every other tick.
  await expect(page.getByTestId("cycle-ruler").locator("[data-cycle='24']")).toHaveCount(1);
  await expect(page.getByTestId("cycle-ruler").locator("[data-cycle='25']")).toHaveCount(0);
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
});
