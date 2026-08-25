import { expect, test } from "@playwright/test";

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
  await expect(page.getByTestId("cycle-ruler").locator("[data-cycle='22']")).toHaveCount(0);
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
});

test("creates geometry-positioned Marker and Gap objects without waveform regeneration", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Timeline", exact: true }).click();
  const surface = host.locator("[data-role='timing-chart-surface']");
  const countersBefore = await surface.getAttribute("data-render-counters");
  const ruler = page.getByTestId("cycle-ruler");
  const cycle2 = Number.parseFloat(await ruler.locator("[data-cycle='2']").evaluate((element) => (element as HTMLElement).style.left));
  const cycle4 = Number.parseFloat(await ruler.locator("[data-cycle='4']").evaluate((element) => (element as HTMLElement).style.left));

  await page.getByRole("button", { name: "Add marker" }).click();
  await expect(ruler.locator("[data-bookmark-id]")).toHaveCount(1);
  expect(Number.parseFloat(await ruler.locator("[data-bookmark-id]").evaluate((element) => (element as HTMLElement).style.left))).toBe(cycle2);
  await page.getByRole("button", { name: "Add gap" }).click();
  const gap = ruler.locator("[data-time-group-id]");
  await expect(gap).toHaveCount(1);
  expect(Number.parseFloat(await gap.evaluate((element) => (element as HTMLElement).style.left))).toBe(cycle2);
  expect(Number.parseFloat(await gap.evaluate((element) => (element as HTMLElement).style.width))).toBe(cycle4 - cycle2);
  expect(await surface.getAttribute("data-render-counters")).toBe(countersBefore);
  await expect(page.getByTestId("history-status")).toHaveText("History 2 / Redo 0");

  await page.locator("[data-bookmark-id]").filter({ hasText: "×" }).click();
  await page.locator("[data-time-group-id]").filter({ hasText: "×" }).click();
  await expect(ruler.locator("[data-bookmark-id]")).toHaveCount(0);
  await expect(ruler.locator("[data-time-group-id]")).toHaveCount(0);
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
  await expect(page.getByTestId("cycle-ruler").locator("[data-cycle='24']")).toHaveCount(0);
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
});
