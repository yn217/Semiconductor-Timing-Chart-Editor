import { expect, test, type Page } from "@playwright/test";
import { generatePerformanceDocument } from "@timing-chart-v2/testing";
import { startInCycleMode } from "./cycle-startup.js";

startInCycleMode(test);

/** The fixture document is plain JSON; these specs edit it by hand and reopen it through the File input, like the #864 spec does. */
type LooseSignal = Record<string, unknown> & { id: string; display: Record<string, unknown> };
type LooseDocument = { signals: LooseSignal[]; signalGroups: { id: string; name: string; rows: string[] }[] };

function fixture(signalCount = 50): LooseDocument {
  return generatePerformanceDocument({ signalCount: signalCount as 50, cycleCount: 100, profile: "standard" }) as unknown as LooseDocument;
}

/** Re-slices the fixture signals into small Groups so both sources of a multi-Group check stay inside the virtualized tree viewport. */
function regroup(document: LooseDocument, sizes: readonly number[]): void {
  let cursor = 0;
  document.signalGroups = sizes.map((size, index) => {
    const rows = document.signals.slice(cursor, cursor + size).map((signal) => signal.id);
    cursor += size;
    return { id: `grp_review_${index}`, name: `Group ${index}`, rows };
  });
}

async function openDocument(page: Page, document: LooseDocument) {
  await page.goto("/");
  const surface = page.getByTestId("cycle-surface");
  await expect(surface).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "signal-duplicate-review.tcd", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(document)) });
  await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 60_000 });
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Home", exact: true }).click();
}

/** Left-tree signal rows in on-screen order, as `[data-row-id, display text]` pairs. */
async function leftRows(page: Page): Promise<{ id: string; text: string }[]> {
  return page.locator("[data-role='left-row'][data-row-id]").evaluateAll((elements) => elements.map((element) => ({ id: element.getAttribute("data-row-id") ?? "", text: (element.textContent ?? "").trim() })));
}

test("Bulk Registration does not reuse a suffixed ID already in a reopened document", async ({ page }) => {
  const document = fixture();
  // An earlier session registered Bulk signals, so these IDs already carry the `_bulk_<index>` suffix on an allocator base.
  const template = document.signals[1]!;
  for (let sequence = 1; sequence <= 200; sequence += 1) {
    const name = `RESERVED_${sequence}`;
    document.signals.push({ ...template, id: `signal_phase9_${sequence}_bulk_0`, name, display: { name }, source: { instancePath: ["reserved"], signalName: name }, values: [{ start: 0, value: 0 }] });
    document.signalGroups[0]!.rows.push(`signal_phase9_${sequence}_bulk_0`);
  }
  await openDocument(page, document);
  const shell = page.locator(".editor-shell");
  const before = Number(await shell.getAttribute("data-signal-count"));

  await page.getByRole("button", { name: "Add signal or group" }).click();
  await page.getByTestId("bulk-register-open").click();
  const dialog = page.getByRole("dialog", { name: "Bulk Signal Registration" });
  await dialog.getByLabel("Bulk signal definitions").fill("dut.collide.status binary");
  await dialog.getByTestId("bulk-register-preview-button").click();
  await expect(dialog.getByTestId("bulk-register-apply")).toBeEnabled();
  await dialog.getByTestId("bulk-register-apply").click();

  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true");
  await expect(shell).toHaveAttribute("data-signal-count", String(before + 1));
  await expect(dialog).toBeHidden();
});

test("Select All Signals skips hidden signals so Duplicate copies only visible ones", async ({ page }) => {
  const document = fixture();
  for (const index of [5, 6, 7]) document.signals[index]!.display.visible = false;
  await openDocument(page, document);
  const shell = page.locator(".editor-shell");
  const total = Number(await shell.getAttribute("data-signal-count"));
  const ribbon = page.getByTestId("ribbon");

  await ribbon.getByRole("button", { name: "Select All Signals", exact: true }).click();

  await ribbon.getByRole("button", { name: "Duplicate", exact: true }).first().click();
  await expect(shell).toHaveAttribute("data-signal-count", String(total + total - 3));
});

test("Duplicate inserts each copy right after its source inside the source's own Group", async ({ page }) => {
  const document = fixture();
  regroup(document, [10, 10, 30]);
  await openDocument(page, document);
  const source = document.signals[3]!;
  const otherSource = document.signals[13]!;
  const sourceName = String(source.display.name);
  const otherName = String(otherSource.display.name);

  const surface = page.getByTestId("cycle-surface");
  await surface.locator(`[data-role='left-row'][data-row-id='${source.id}']`).click();
  await surface.locator(`[data-role='left-row'][data-row-id='${otherSource.id}']`).click({ modifiers: ["Control"] });
  await page.getByTestId("ribbon").getByRole("button", { name: "Duplicate", exact: true }).first().click();

  const rows = await leftRows(page);
  const copyOf = (name: string) => rows.findIndex((row) => row.text.includes(`${name}_duplicate`));
  const copyIndex = copyOf(sourceName);
  expect(copyIndex, "copy of the first source is shown").toBeGreaterThanOrEqual(0);
  expect(rows[copyIndex - 1]?.id, "copy sits directly after its source").toBe(source.id);
  const otherCopy = copyOf(otherName);
  expect(otherCopy, "copy of the second source is shown").toBeGreaterThanOrEqual(0);
  expect(rows[otherCopy - 1]?.id, "second copy sits directly after its source in its own Group").toBe(otherSource.id);
});

test("Duplicate gives each copy a unique name", async ({ page }) => {
  const document = fixture();
  await openDocument(page, document);
  const source = document.signals[3]!;
  const name = String(source.display.name);
  const ribbon = page.getByTestId("ribbon");

  await page.getByTestId("cycle-surface").locator(`[data-role='left-row'][data-row-id='${source.id}']`).click();
  await ribbon.getByRole("button", { name: "Duplicate", exact: true }).first().click();
  await page.getByTestId("cycle-surface").locator(`[data-role='left-row'][data-row-id='${source.id}']`).click();
  await ribbon.getByRole("button", { name: "Duplicate", exact: true }).first().click();

  const texts = (await leftRows(page)).map((row) => row.text);
  expect(texts.some((text) => text.includes(`${name}_duplicate_2`)), "second duplicate gets a suffixed name").toBe(true);
  expect(texts.filter((text) => text.includes(`${name}_duplicate`)).length).toBe(2);
});

test("Create Group reuses the lowest free Group number after a deletion", async ({ page }) => {
  const document = fixture();
  // Group 2 was deleted: names are Group 1 and Group 3, so a naive "length + 1" would collide with Group 3.
  document.signalGroups = [{ ...document.signalGroups[0]!, name: "Group 1" }, { ...document.signalGroups[1]!, name: "Group 3" }];
  await openDocument(page, document);

  await page.getByRole("button", { name: "Add signal or group" }).click();
  await page.getByTestId("create-group").click();
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true");

  // Creating a Group selects it, so the Inspector names the new Group; the pre-existing Group 3 must stay the only one.
  await expect(page.getByRole("textbox", { name: "Inspector group name" })).toHaveValue("Group 2");
  await expect(page.getByLabel("Select Group 3 group", { exact: true })).toHaveCount(1);
});
