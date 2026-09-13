import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

// #205 item 5: representative SVG export matrix for Measurement -- the
// exported SVG must use the same resolved endpoints/markers/arrows/labels
// as the live renderer (same data-* attribute vocabulary), for the
// representative pattern combinations the issue calls out: inward/outward
// arrows, per-side extension lines, and overlapping lane stacking together.
// Auto arrows + both extensions + cross-Signal + ratio anchors are already
// covered by measurement-lane-stacking.spec.ts's own export test; this file
// covers the remaining representative combinations without duplicating it.

test("exports overlapping same-Signal Measurements with inward and outward arrow layouts, partial extension lines, and correct lane stacking", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "New", exact: true }).click();
  await page.getByTestId("unsaved-discard").click({ timeout: 2000 }).catch(() => {});
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click({ force: true });

  await page.locator(".ribbon-tabs").getByRole("button", { name: "Annotation", exact: true }).click();
  await page.getByLabel("Annotation type").selectOption("measurement");
  // Same selected range for both -> fully overlapping x-span, forcing the
  // auto lane-stacking path exercised by measurement-lane-stacking.spec.ts.
  await page.getByRole("button", { name: "Add annotation" }).click();
  await page.getByRole("button", { name: "Add annotation" }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");

  const owners = host.locator("[data-role='annotation-owner'][data-annotation-type='measurement']");
  await expect(owners).toHaveCount(2);
  const ids = await owners.evaluateAll((items) => items.map((item) => item.getAttribute("data-annotation-id")));
  expect(ids[0]).toBeTruthy();
  expect(ids[1]).toBeTruthy();
  const first = host.locator(`[data-role='annotation-owner'][data-annotation-id='${ids[0]}']`);
  const second = host.locator(`[data-role='annotation-owner'][data-annotation-id='${ids[1]}']`);

  // The two Measurements fully overlap on screen (same selected range for
  // both), so a real mouse click always lands on whichever is topmost --
  // dispatch pointerdown directly on each element instead, which targets
  // it regardless of paint order.
  const select = async (owner: import("@playwright/test").Locator) => {
    await owner.dispatchEvent("pointerdown", { bubbles: true, button: 0 });
    await owner.dispatchEvent("pointerup", { bubbles: true, button: 0 });
    await owner.dispatchEvent("click", { bubbles: true, button: 0 });
  };

  // Configure the first as inward arrows + start-only extension.
  await select(first);
  const editor = page.getByTestId("annotation-editor");
  await editor.getByLabel("Measurement start marker").selectOption("arrow");
  await editor.getByLabel("Measurement end marker").selectOption("arrow");
  await editor.getByLabel("Measurement arrow layout").selectOption("inward");
  await editor.getByLabel("Measurement extension lines").selectOption("start");
  await editor.getByTestId("apply-measurement-semantics").click();

  // Configure the second as outward arrows + end-only extension.
  await select(second);
  await editor.getByLabel("Measurement start marker").selectOption("bar");
  await editor.getByLabel("Measurement end marker").selectOption("bar");
  await editor.getByLabel("Measurement arrow layout").selectOption("outward");
  await editor.getByLabel("Measurement extension lines").selectOption("end");
  await editor.getByTestId("apply-measurement-semantics").click();

  const lanes = await owners.evaluateAll((items) => items.map((item) => (item as HTMLElement).dataset.measurementLane));
  expect(new Set(lanes).size, JSON.stringify(lanes)).toBe(2);

  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Export", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Export Timing Chart" });
  await dialog.getByLabel("Export format").selectOption("svg");
  const pending = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Export SVG" }).click();
  const exported = await (await pending).path();
  const text = (await readFile(exported!)).toString("utf8");

  // Same resolved endpoints/markers/arrows/labels as the live renderer --
  // identical data-* attribute vocabulary for both overlapping Measurements.
  const firstGroup = text.match(new RegExp(`<g data-annotation-id="${ids[0]}"[\\s\\S]*?<\\/g>`))?.[0] ?? "";
  const secondGroup = text.match(new RegExp(`<g data-annotation-id="${ids[1]}"[\\s\\S]*?<\\/g>`))?.[0] ?? "";
  expect(firstGroup).toContain('data-arrow-layout="inward"');
  expect(secondGroup).toContain('data-arrow-layout="outward"');
  expect(firstGroup).toMatch(/data-role="measurement-marker" data-marker-side="start" data-marker-kind="arrow"/);
  expect(firstGroup).toMatch(/data-role="measurement-marker" data-marker-side="end" data-marker-kind="arrow"/);
  expect(secondGroup).toMatch(/data-role="measurement-marker" data-marker-side="start" data-marker-kind="bar"/);
  expect(secondGroup).toMatch(/data-role="measurement-marker" data-marker-side="end" data-marker-kind="bar"/);
  // Extension-line side gating carried through to the export.
  expect(firstGroup).toContain('data-extension-side="start"');
  expect(firstGroup).not.toContain('data-extension-side="end"');
  expect(secondGroup).toContain('data-extension-side="end"');
  expect(secondGroup).not.toContain('data-extension-side="start"');
  // Two distinct, non-overlapping lane values actually made it into the export.
  const laneMatches = [...text.matchAll(/data-measurement-lane="(\d+)"/g)].map((match) => match[1]);
  expect(new Set(laneMatches).size, JSON.stringify(laneMatches)).toBe(2);
});
