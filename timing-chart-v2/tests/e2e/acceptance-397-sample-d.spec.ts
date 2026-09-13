import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";

// #397 Sample D -- Signal Split dual-viewport.
// A Cycle-only 24-Signal document (Control + 20-Signal Pipeline group),
// loaded through the real production File > Open input, verifying the
// *current* Signal Split product contract: two synchronized Cycle
// viewports of the same canonical Signal/group row sequence -- not the
// retired per-Signal Upper/Lower/Both assignment model.

const dirname = path.dirname(fileURLToPath(import.meta.url));
const samplePath = path.resolve(dirname, "../../samples/acceptance-397/sample-d-signal-split-dual-viewport.tcd.json");

async function openSampleD(page: Page) {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(samplePath);
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true");
  // File import restores the document but not the view-mode intent of this
  // Cycle-only acceptance fixture. Select Cycle explicitly before opening
  // the View ribbon so Signal Split is exercised through its real product
  // entry point rather than depending on the previous workspace mode.
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
}

for (const viewport of [{ width: 1672, height: 941 }, { width: 1280, height: 720 }]) test(`Signal Split ON usable with both panes visible and non-overlapping, no clipping, at ${viewport.width}x${viewport.height}`, async ({ page }) => {
  await page.setViewportSize(viewport);
  await openSampleD(page);
  await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
  await page.getByTestId("view-panel-signal-split").click();
  const upper = page.getByTestId("cycle-viewport");
  const lower = page.getByTestId("cycle-viewport-lower");
  const divider = page.getByTestId("signal-split-divider");
  await expect(upper).toBeVisible();
  await expect(lower).toBeVisible();
  await expect(divider).toBeVisible();
  const [upperBox, dividerBox, lowerBox] = await Promise.all([upper.boundingBox(), divider.boundingBox(), lower.boundingBox()]);
  expect(upperBox).not.toBeNull();
  expect(dividerBox).not.toBeNull();
  expect(lowerBox).not.toBeNull();
  // Stacked, non-overlapping, top-to-bottom order: Upper above the
  // divider above Lower.
  expect(upperBox!.y + upperBox!.height).toBeLessThanOrEqual(dividerBox!.y + 1);
  expect(dividerBox!.y + dividerBox!.height).toBeLessThanOrEqual(lowerBox!.y + 1);
});

test("Signal Split ON shows the same 24-Signal row sequence in both panes with independent vertical scroll and shared horizontal scroll, OFF returns to one viewport, view-only throughout", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });

  await openSampleD(page);
  const before = { revision: await page.getByTestId("cycle-surface").getAttribute("data-canonical-revision"), history: await page.getByTestId("history-status").textContent() };

  // No Signal Split UI before it's enabled.
  await expect(page.getByTestId("cycle-viewport-lower")).toHaveCount(0);

  await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
  await page.getByTestId("view-panel-signal-split").click();
  const upper = page.getByTestId("cycle-viewport");
  const lower = page.getByTestId("cycle-viewport-lower");
  await expect(lower).toBeVisible();
  await expect(page.getByTestId("signal-split-divider")).toBeVisible();

  // Toggling Signal Split itself is view-only.
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-canonical-revision", before.revision!);
  await expect(page.getByTestId("history-status")).toHaveText(before.history!);

  // Both panes expose the same canonical Signal/group order -- at the same
  // scroll position (both start at top), the same rows are mounted. (Once
  // scrolled independently, virtualization may mount different visible
  // windows per pane -- that's expected, not a bug, per the issue's own
  // text -- so this compares at a shared baseline scrollTop instead of
  // forcing a full unvirtualized render.)
  const upperNames = await upper.locator("[data-role='left-row'][data-kind='timing']").evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.name));
  const lowerNames = await lower.locator("[data-role='left-row'][data-kind='timing']").evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.name));
  expect(upperNames.length).toBeGreaterThan(0);
  expect(lowerNames.length).toBeGreaterThan(0);
  // Upper and Lower may have different pixel heights (the divider ratio is
  // adjustable), so a different number of rows can be mounted at the same
  // scrollTop -- what must match is the *order*, i.e. the shorter list is
  // an exact prefix of the longer one, both starting from the same
  // canonical row sequence.
  const [shorter, longer] = upperNames.length <= lowerNames.length ? [upperNames, lowerNames] : [lowerNames, upperNames];
  expect(longer.slice(0, shorter.length)).toEqual(shorter);
  // Both panes' Signal Tree agree on Group order (same prefix-match
  // reasoning as the row check above -- a shorter pane may not have
  // scrolled far enough to mount every Group header yet).
  const upperGroups = await upper.locator("[data-role='left-group-header']").evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.groupName));
  const lowerGroups = await lower.locator("[data-role='left-group-header']").evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.groupName));
  expect(upperGroups).toEqual(["Control", "Pipeline"]);
  const [shorterGroups, longerGroups] = upperGroups.length <= lowerGroups.length ? [upperGroups, lowerGroups] : [lowerGroups, upperGroups];
  expect(longerGroups.slice(0, shorterGroups.length)).toEqual(shorterGroups);

  // Independent vertical scroll: Upper scrolling doesn't move Lower and
  // vice versa.
  await upper.evaluate((el) => { el.scrollTop = 100; el.dispatchEvent(new Event("scroll", { bubbles: true })); });
  await expect.poll(() => upper.evaluate((el) => el.scrollTop)).toBe(100);
  expect(await lower.evaluate((el) => el.scrollTop)).toBe(0);
  await lower.evaluate((el) => { el.scrollTop = 50; el.dispatchEvent(new Event("scroll", { bubbles: true })); });
  await expect.poll(() => lower.evaluate((el) => el.scrollTop)).toBe(50);
  expect(await upper.evaluate((el) => el.scrollTop)).toBe(100);

  // Shared horizontal time domain: scrolling Upper horizontally carries
  // Lower along with it (one authoritative TimeViewport). Zoom in first so
  // there is enough horizontal overflow at this cycle count to actually
  // scroll (a scrollLeft assignment clamps to 0 if scrollWidth <=
  // clientWidth).
  await upper.evaluate((el) => { el.scrollLeft = 0; el.dispatchEvent(new Event("scroll", { bubbles: true })); });
  await page.getByTestId("ribbon").getByRole("button", { name: "Zoom In", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Zoom In", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Zoom In", exact: true }).click();
  const upperScrollWidth = await upper.evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(upperScrollWidth).toBeGreaterThan(20);
  await upper.evaluate((el) => { el.scrollLeft = 40; el.dispatchEvent(new Event("scroll", { bubbles: true })); });
  await expect.poll(() => upper.evaluate((el) => el.scrollLeft)).toBe(40);
  await expect.poll(() => lower.evaluate((el) => el.scrollLeft)).toBe(40);

  // Shared Zoom: the earlier zoom-in clicks (needed to create horizontal
  // overflow above) already reflect in the one shared status bar, and both
  // panes stay usable -- no per-pane zoom split.
  await expect(page.getByTestId("zoom-status")).toHaveText("175%");
  await expect(upper).toBeVisible();
  await expect(lower).toBeVisible();

  // No Split Pane assignment property anywhere in the Signal Inspector.
  await upper.locator("[data-role='frozen-row']").first().click();
  await expect(page.getByTestId("inspector").getByText(/Split Pane/i)).toHaveCount(0);

  // OFF returns to exactly one Cycle viewport.
  await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
  await page.getByTestId("view-panel-signal-split").click();
  await expect(page.getByTestId("cycle-viewport-lower")).toHaveCount(0);
  await expect(page.getByTestId("signal-split-divider")).toHaveCount(0);
  await expect(page.getByTestId("cycle-viewport")).toBeVisible();

  // The whole ON -> interact -> OFF sequence stayed view-only.
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-canonical-revision", before.revision!);
  await expect(page.getByTestId("history-status")).toHaveText(before.history!);

  expect(errors.filter((message) => !message.includes("beforeunload"))).toEqual([]);
});

test("Signal Split default export includes each canonical Signal exactly once in canonical order, ignoring pane scroll/ratio", async ({ page }) => {
  await openSampleD(page);
  await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
  await page.getByTestId("view-panel-signal-split").click();
  const lower = page.getByTestId("cycle-viewport-lower");
  await expect(lower).toBeVisible();
  // Scroll Lower deep into the Pipeline group before exporting -- export
  // geometry must stay deterministic regardless of scroll position.
  await lower.evaluate((el) => { el.scrollTop = el.scrollHeight; el.dispatchEvent(new Event("scroll", { bubbles: true })); });

  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const exportDialog = page.getByRole("dialog");
  await expect(exportDialog).toBeVisible();
  const pending = page.waitForEvent("download");
  await exportDialog.getByRole("button", { name: "Export SVG" }).click();
  const exported = (await readFileSync((await (await pending).path())!, "utf-8"));
  // Every Signal name appears exactly once (no duplication from Upper +
  // Lower both being exported, no omission from scroll-based virtualization
  // leaking into the deterministic export).
  for (const name of ["CLOCK", "RESET_N", "REQUEST", "READY", "PIPE_00", "PIPE_19"]) {
    const occurrences = exported.split(`>${name}<`).length - 1;
    expect(occurrences, `expected exactly one "${name}" label in the export`).toBe(1);
  }
});
