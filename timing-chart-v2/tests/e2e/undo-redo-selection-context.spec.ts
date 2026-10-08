import { expect, test } from "@playwright/test";
import { startInCycleSample } from "./cycle-startup.js";

startInCycleSample(test);

test("timeline Undo/Redo preserves compatible range, pinned target, zoom and panel geometry", async ({ page }) => {
  await page.setViewportSize({ width: 1672, height: 941 });
  await ready(page);
  const host = page.getByTestId("cycle-surface");
  const row = host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']");
  await row.click();
  await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
  await page.getByLabel("Zoom preset").selectOption("150");
  await expect(page.getByTestId("zoom-status")).toHaveText("150%");
  const splitter = page.getByTestId("bottom-resizer");
  const originalHeight = await splitter.getAttribute("aria-valuenow");
  await splitter.focus();
  await page.keyboard.press("ArrowUp");
  await expect(splitter).not.toHaveAttribute("aria-valuenow", originalHeight!);
  await page.getByTestId("bottom-settings").click();
  await page.getByTestId("bottom-pin").click();
  await expect(page.getByTestId("bottom-pin")).toHaveAttribute("aria-pressed", "true");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Timeline", exact: true }).click();
  const timeline = page.getByTestId("timeline-editor");
  await timeline.getByLabel("Timeline insert count").fill("1");
  await timeline.getByRole("button", { name: "Insert before" }).click();
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await timeline.getByLabel("Timeline range end").fill("4");
  await timeline.getByLabel("Timeline range start").fill("2");
  const snapshot = () => page.evaluate(() => {
    const bottom = document.querySelector("[data-testid='bottom-editor']")!;
    const inspector = document.querySelector("[data-testid='inspector']");
    return {
      cycle: document.querySelector("[data-testid='cycle-status']")?.textContent,
      start: (document.querySelector("[aria-label='Timeline range start']") as HTMLInputElement)?.value,
      end: (document.querySelector("[aria-label='Timeline range end']") as HTMLInputElement)?.value,
      zoom: document.querySelector("[data-testid='zoom-status-bar']")?.textContent,
      height: document.querySelector("[data-testid='bottom-resizer']")?.getAttribute("aria-valuenow"),
      bottomHeight: bottom.getBoundingClientRect().height,
      inspectorWidth: inspector?.getBoundingClientRect().width,
      pin: document.querySelector("[data-testid='bottom-pin']")?.getAttribute("aria-pressed"),
      selection: document.querySelector("[data-testid='selection-status']")?.textContent,
    };
  });
  const before = await snapshot();
  expect(before.start).toBe("2");
  expect(before.end).toBe("4");
  expect(before.cycle).toMatch(/^Cycle \d+$/);
  expect(before.zoom).toBe("Zoom: 150%");
  expect(before.pin).toBe("true");
  expect(before.selection).toBe("REQUEST");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Home", exact: true }).click();
  const ribbon = page.getByTestId("ribbon");
  await ribbon.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 1");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Timeline", exact: true }).click();
  await expect.poll(snapshot).toEqual(before);
  await expect(row).toHaveAttribute("aria-selected", "true");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Home", exact: true }).click();
  await ribbon.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Timeline", exact: true }).click();
  await expect.poll(snapshot).toEqual(before);
});


async function ready(page: import("@playwright/test").Page) {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
}

// #211: Undo/Redo must preserve compatible transient editing context --
// specifically, selected stable object ID(s) across a Delete/Undo/Redo
// cycle. Canonical restoration alone (the row comes back) is not
// sufficient UX parity if the selection doesn't follow it.
test("Delete Undo restores selection to the recreated Signal; Redo clears it again without a stale reference", async ({ page }) => {
  await ready(page);
  const host = page.getByTestId("cycle-surface");
  const row = host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']");
  await row.click();
  await expect(page.getByTestId("selection-status")).toHaveText("REQUEST");
  const ribbon = page.getByTestId("ribbon");
  await ribbon.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByTestId("selection-status")).toHaveText("None");
  await expect(row).toHaveCount(0);
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");

  await ribbon.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 1");
  await expect(row).toBeVisible();
  await expect(page.getByTestId("selection-status")).toHaveText("REQUEST");

  await ribbon.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await expect(row).toHaveCount(0);
  // No stale reference to the just-redeleted signal.
  await expect(page.getByTestId("selection-status")).toHaveText("None");
});

for (const viewport of [{ width: 1280, height: 720 }, { width: 1672, height: 941 }]) test(`Rename Undo keeps the same Signal selected (name reverts, selection does not move) at ${viewport.width}x${viewport.height}`, async ({ page }) => {
  await page.setViewportSize(viewport);
  await ready(page);
  const host = page.getByTestId("cycle-surface");
  const row = host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']");
  await row.click();
  await expect(page.getByTestId("selection-status")).toHaveText("REQUEST");
  const ribbon = page.getByTestId("ribbon");
  await ribbon.getByRole("button", { name: "More", exact: true }).click();
  await page.getByRole("menu", { name: "More Home Commands" }).getByRole("menuitem", { name: "Rename", exact: true }).click();
  const dialog = page.getByTestId("rename-dialog");
  await dialog.getByRole("textbox").fill("RENAMED_REQUEST");
  await dialog.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.getByTestId("selection-status")).toHaveText("RENAMED_REQUEST");
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");

  await ribbon.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 1");
  await expect(page.getByTestId("selection-status")).toHaveText("REQUEST");
  await expect(row).toBeVisible();
  await ribbon.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await expect(page.getByTestId("selection-status")).toHaveText("RENAMED_REQUEST");
  await expect(row).toBeVisible();
});

test("an unrelated Undo/Redo does not touch a selection it has nothing to do with", async ({ page }) => {
  await ready(page);
  const host = page.getByTestId("cycle-surface");
  const ribbon = page.getByTestId("ribbon");
  // Perform an edit unrelated to selection (insert a cycle), then select a
  // signal, then Undo the timeline edit -- the signal selection must survive
  // since the undone command never touched that signal.
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Timeline", exact: true }).click();
  const timeline = page.getByTestId("timeline-editor");
  await timeline.getByLabel("Timeline insert count").fill("1");
  await timeline.getByRole("button", { name: "Insert before" }).click();
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Home", exact: true }).click();
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_ready']").click();
  await expect(page.getByTestId("selection-status")).toHaveText("READY");
  await ribbon.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 1");
  await expect(page.getByTestId("selection-status")).toHaveText("READY");
});
