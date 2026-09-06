import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { canonicalFixture } from "../fixtures/canonical.js";

// #205: overlapping Measurements without an explicit lane must auto-stack
// onto genuinely different lanes rather than collapsing back onto lane 0
// once every existing lane is already occupied.

test("two overlapping Measurements with no explicit lane auto-stack onto different lanes", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();

  await page.locator(".ribbon-tabs").getByRole("button", { name: "Annotation", exact: true }).click();
  await page.getByLabel("Annotation type").selectOption("measurement");
  // Same selected range for both -> identical (fully overlapping) x-span,
  // the worst case for auto lane assignment.
  await page.getByRole("button", { name: "Add annotation" }).click();
  await page.getByRole("button", { name: "Add annotation" }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");

  const owners = host.locator("[data-role='annotation-owner'][data-annotation-type='measurement']");
  await expect(owners).toHaveCount(2);
  const lanes = await owners.evaluateAll((items) => items.map((item) => (item as HTMLElement).dataset.measurementLane));
  expect(new Set(lanes).size, JSON.stringify(lanes)).toBe(2);
  expect(lanes.map(Number).sort()).toEqual([0, 1]);
});

test("a third Measurement overlapping both stacks onto lane 2, not back onto lane 0 or 1", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();

  await page.locator(".ribbon-tabs").getByRole("button", { name: "Annotation", exact: true }).click();
  await page.getByLabel("Annotation type").selectOption("measurement");
  await page.getByRole("button", { name: "Add annotation" }).click();
  await page.getByRole("button", { name: "Add annotation" }).click();
  await page.getByRole("button", { name: "Add annotation" }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");

  const owners = host.locator("[data-role='annotation-owner'][data-annotation-type='measurement']");
  await expect(owners).toHaveCount(3);
  const lanes = await owners.evaluateAll((items) => items.map((item) => Number((item as HTMLElement).dataset.measurementLane)));
  expect(new Set(lanes).size, JSON.stringify(lanes)).toBe(3);
  expect(lanes.sort()).toEqual([0, 1, 2]);
});

test("renders and exports a cross-Signal ratio Measurement through the production browser path", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const source = canonicalFixture();
  const data = source.signals.find((signal) => signal.type === "bus")!;
  const dataB = { ...data, id: "sig_data_b", name: "DATA_B", display: { ...data.display, name: "DATA_B" }, values: [...data.values, { start: 6, value: "5A" }] };
  const crossSignalMeasurement = {
    id: "ann_cross_signal_browser",
    type: "measurement" as const,
    label: "cross-signal",
    visible: true,
    measurement: { profile: "custom" as const, anchorKind: "ratio" as const },
    measurementLayout: { startMarker: "arrow" as const, endMarker: "arrow" as const, arrowLayout: "auto" as const, extensionLines: "both" as const },
    start: { signalId: data.id, cycle: 4, point: "transition-center" as const, transition: { kind: "ratio" as const, value: 0.25 } },
    end: { signalId: dataB.id, cycle: 6, point: "transition-center" as const, transition: { kind: "ratio" as const, value: 0.75 } },
  };
  const document = { ...source, signals: [...source.signals, dataB], signalGroups: source.signalGroups.map((group) => ({ ...group, rows: [...group.rows, dataB.id] })), annotations: [crossSignalMeasurement] };
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "cross-signal-measurement.tcd", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(document)) });
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  const owner = host.locator("[data-role='annotation-owner'][data-annotation-type='measurement']");
  await expect(owner).toHaveCount(1);
  await expect(owner).toHaveAttribute("aria-label", /25%→75%.*ratio/);
  await expect(owner.locator("[data-role='annotation-handle'][data-anchor-transition-kind='ratio']")).toHaveCount(2);

  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Export", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Export Timing Chart" });
  await dialog.getByLabel("Export format").selectOption("svg");
  const pending = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Export SVG" }).click();
  const exported = await (await pending).path();
  const text = (await readFile(exported!)).toString("utf8");
  expect(text).toContain('data-annotation-type="measurement"');
  expect(text).toContain('data-start-transition-kind="ratio"');
  expect(text).toContain('data-end-transition-kind="ratio"');
});
