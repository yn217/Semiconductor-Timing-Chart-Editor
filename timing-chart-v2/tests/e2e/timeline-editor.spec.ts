import { expect, test } from "@playwright/test";

test("selects a cycle and the exclusive terminal boundary from rendered canvas geometry", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Timeline", exact: true }).click();
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
  const terminalTick = page.getByTestId("cycle-ruler").locator("[data-cycle='24']");
  const terminalBox = await terminalTick.boundingBox();
  expect(terminalBox).not.toBeNull();
  const waveBox = await wave.boundingBox();
  expect(waveBox).not.toBeNull();
  await wave.click({ position: { x: terminalBox!.x - waveBox!.x, y: ownerBox!.y - waveBox!.y + ownerBox!.height / 2 } });
  await expect(host).toHaveAttribute("data-selected-cycle", "24");
  await expect(page.getByLabel("Timeline range end")).toHaveValue("24");
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

test("inserts cycles with full semantic ripple and one Undo entry", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Timeline", exact: true }).click();
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

test("deletes a half-open range and preserves the active value at the join", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Timeline", exact: true }).click();
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
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
  expect(Number.parseFloat(await ruler.locator("[data-bookmark-id]").evaluate((element) => (element as HTMLElement).style.left))).toBe(cycle2);
  // a Marker is view-geometry only — it must not touch WaveDrom or LocalGeometry.
  expect(await surface.getAttribute("data-render-counters")).toBe(countersBefore);

  await page.getByRole("button", { name: "Add gap" }).click();
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

  await page.locator("[data-time-group-id]").filter({ hasText: "×" }).click();
  await expect(ruler.locator("[data-time-group-id]")).toHaveCount(0);
  // removing the Gap restores the previously-hidden cycles to the Ruler.
  await expect(ruler.locator("[data-cycle='2']")).toHaveCount(1);
  await expect(ruler.locator("[data-cycle='3']")).toHaveCount(1);
});

test("duplicates the selected cycle state range at a destination in one commit", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Timeline", exact: true }).click();
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
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Timeline", exact: true }).click();
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
