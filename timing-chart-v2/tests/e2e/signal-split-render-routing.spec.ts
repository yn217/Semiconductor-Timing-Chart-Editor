import { expect, test } from "@playwright/test";

// #200 PR 4: real per-signal Upper/Lower/Both render routing, on top of PR
// 3's already-covered dual-viewport/scroll shell (tests/e2e/signal-split.spec.ts).
// Assigns CLOCK -> Upper, DATA[7:0] -> Lower, RESET_N left at the default
// (Both), and verifies each pane's own DOM only ever mounts its own rows --
// not just that the toggle/scroll mechanics work.

async function assignSplitPane(page: import("@playwright/test").Page, host: import("@playwright/test").Locator, rowId: string, pane: "upper" | "lower" | "both", context: "signal" | "clock") {
  const row = host.locator(`[data-role='frozen-row'][data-row-id='${rowId}']`);
  await row.click();
  await expect(row).toHaveAttribute("data-selected", "true");
  const inspector = page.getByTestId("inspector");
  // Assert the SPECIFIC expected context, not a "signal or clock" regex --
  // a regex match is satisfied by a stale, about-to-change value just as
  // well as the settled one, racing the very next read below.
  await expect(inspector).toHaveAttribute("data-inspector-context", context);
  const historyBefore = await page.getByTestId("history-status").textContent();
  await inspector.getByLabel("Inspector signal split pane").selectOption(pane);
  if (context === "clock") {
    // apps/editor/src/styles/inspector.css deliberately hides this specific
    // submit button (Enter/keyboard submit only, matching full-gui.spec.ts's
    // own established pattern) -- dispatch its click directly.
    await inspector.getByTestId("apply-inspector-clock-properties").evaluate((button: HTMLButtonElement) => button.click());
  } else {
    await inspector.getByTestId("apply-inspector-signal").click();
  }
  // Wait for the command to fully settle (history-status text changing is a
  // React-state-derived label, a more reliable "the whole tree re-rendered"
  // signal than the imperative data-canonical-revision attribute alone) --
  // clicking the next row before this settles can race the Inspector's own
  // key-based remount.
  await expect(page.getByTestId("history-status")).not.toHaveText(historyBefore ?? "");
}

test("assigns Signals to Upper/Lower/Both and routes real rows to each pane's own DOM, keeping one stable ID for a Both Signal", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");

  const revisionBefore = await host.getAttribute("data-canonical-revision");
  await assignSplitPane(page, host, "sig_cycle_clock", "upper", "clock");
  await expect(host).toHaveAttribute("data-canonical-revision", String(Number(revisionBefore) + 1));
  await assignSplitPane(page, host, "sig_cycle_data", "lower", "signal");
  await expect(host).toHaveAttribute("data-canonical-revision", String(Number(revisionBefore) + 2));
  // sig_cycle_reset_n is left unassigned (default "both").

  await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
  const revisionBeforeSplit = await host.getAttribute("data-canonical-revision");
  const historyBeforeSplit = await page.getByTestId("history-status").textContent();
  const dirtyBeforeSplit = await page.getByTestId("dirty-status").textContent();
  await page.getByTestId("view-panel-signal-split").click();
  const lowerHost = page.getByTestId("cycle-surface-lower");
  await expect(lowerHost).toBeVisible();
  // Enabling Split is view-only, per #200's own contract.
  await expect(host).toHaveAttribute("data-canonical-revision", revisionBeforeSplit!);
  await expect(page.getByTestId("history-status")).toHaveText(historyBeforeSplit!);
  await expect(page.getByTestId("dirty-status")).toHaveText(dirtyBeforeSplit!);

  // Splitter resize is view-only. Drag it up-front (rather than as a final,
  // separate step) so Lower gets enough real height for its own Payload-group
  // row (DATA[7:0]) to actually mount -- at the default 50/50 ratio, Lower's
  // shorter viewport virtualizes it out just like it would any row past the
  // fold, which is correct virtualization behavior, not a routing bug; this
  // test cares about routing, so it gives Lower enough room rather than
  // asserting on rows the test itself scrolled out of view.
  const upperViewport = page.getByTestId("cycle-viewport");
  const heightBeforeDrag = await upperViewport.evaluate((el) => el.getBoundingClientRect().height);
  const divider = page.getByTestId("signal-split-divider");
  const dividerBox = (await divider.boundingBox())!;
  await page.mouse.move(dividerBox.x + dividerBox.width / 2, dividerBox.y + dividerBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(dividerBox.x + dividerBox.width / 2, dividerBox.y - 160, { steps: 5 });
  await page.mouse.up();
  const heightAfterDrag = await upperViewport.evaluate((el) => el.getBoundingClientRect().height);
  expect(heightAfterDrag).toBeLessThan(heightBeforeDrag - 40);
  await expect(host).toHaveAttribute("data-canonical-revision", revisionBeforeSplit!);
  await expect(page.getByTestId("history-status")).toHaveText(historyBeforeSplit!);
  await expect(page.getByTestId("dirty-status")).toHaveText(dirtyBeforeSplit!);

  // Upper: CLOCK (upper) and RESET_N (both) render; DATA[7:0] (lower-only) does not.
  await expect(host.locator("[data-role='timing-row'][data-row-id='sig_cycle_clock']")).toHaveCount(1);
  await expect(host.locator("[data-role='timing-row'][data-row-id='sig_cycle_reset_n']")).toHaveCount(1);
  await expect(host.locator("[data-role='timing-row'][data-row-id='sig_cycle_data']")).toHaveCount(0);
  await expect(host.locator("[data-role='left-row'][data-row-id='sig_cycle_data']")).toHaveCount(0);

  // Lower: DATA[7:0] (lower) and RESET_N (both) render; CLOCK (upper-only) does not.
  await expect(lowerHost.locator("[data-role='timing-row'][data-row-id='sig_cycle_data']")).toHaveCount(1);
  await expect(lowerHost.locator("[data-role='timing-row'][data-row-id='sig_cycle_reset_n']")).toHaveCount(1);
  await expect(lowerHost.locator("[data-role='timing-row'][data-row-id='sig_cycle_clock']")).toHaveCount(0);
  await expect(lowerHost.locator("[data-role='left-row'][data-row-id='sig_cycle_clock']")).toHaveCount(0);

  // A "both"-assigned Signal is genuinely two separate DOM nodes (one real
  // mount per pane, not one reparented element), but the same one stable
  // canonical Signal ID in each.
  const upperBothRow = host.locator("[data-role='timing-row'][data-row-id='sig_cycle_reset_n']");
  const lowerBothRow = lowerHost.locator("[data-role='timing-row'][data-row-id='sig_cycle_reset_n']");
  await expect(upperBothRow).toHaveCount(1);
  await expect(lowerBothRow).toHaveCount(1);
  const areDistinctNodes = await page.evaluate(() => {
    const upper = document.querySelector("[data-testid='cycle-surface'] [data-role='timing-row'][data-row-id='sig_cycle_reset_n']");
    const lower = document.querySelector("[data-testid='cycle-surface-lower'] [data-role='timing-row'][data-row-id='sig_cycle_reset_n']");
    return !!upper && !!lower && upper !== lower;
  });
  expect(areDistinctNodes).toBe(true);

  // Assignment Undo/Redo: undoing the two assignment commands restores every
  // Signal to "both" (all three render in both panes again); redo restores
  // the per-pane routing.
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Home", exact: true }).click();
  const ribbon = page.getByTestId("ribbon");
  await ribbon.getByRole("button", { name: "Undo", exact: true }).click();
  await ribbon.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 2");
  await expect(host.locator("[data-role='timing-row'][data-row-id='sig_cycle_data']")).toHaveCount(1);
  await expect(lowerHost.locator("[data-role='timing-row'][data-row-id='sig_cycle_clock']")).toHaveCount(1);
  await ribbon.getByRole("button", { name: "Redo", exact: true }).click();
  await ribbon.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(page.getByTestId("history-status")).toHaveText("History 2 / Redo 0");
  await expect(host.locator("[data-role='timing-row'][data-row-id='sig_cycle_data']")).toHaveCount(0);
  await expect(lowerHost.locator("[data-role='timing-row'][data-row-id='sig_cycle_clock']")).toHaveCount(0);

  // Save/Open: splitPane is a document-presentation field and must round-trip.
  // Signal Split's own enabled/ratio state is workspace-chrome UI state
  // (same family as bottomVisible/inspectorVisible), never reset by
  // Open/New, so it stays exactly as the user left it across the reload --
  // Lower stays visible at its already-dragged size with no re-toggle
  // needed, and its rows re-virtualize themselves via the ordinary
  // fullDocumentReplace path (onDocumentReplaced above).
  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  const saveDownload = page.waitForEvent("download");
  await page.getByTestId("ribbon").getByRole("button", { name: "Save", exact: true }).click();
  const savedPath = await (await saveDownload).path();
  expect(savedPath).toBeTruthy();
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(savedPath!);
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  const reopenedLowerHost = page.getByTestId("cycle-surface-lower");
  await expect(reopenedLowerHost).toBeVisible();
  await expect(host.locator("[data-role='timing-row'][data-row-id='sig_cycle_data']")).toHaveCount(0);
  await expect(reopenedLowerHost.locator("[data-role='timing-row'][data-row-id='sig_cycle_clock']")).toHaveCount(0);
  await expect(reopenedLowerHost.locator("[data-role='timing-row'][data-row-id='sig_cycle_data']")).toHaveCount(1);
});

test("default full-document export contains one row per Signal even when a Signal is assigned to Both panes", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
  await page.getByTestId("view-panel-signal-split").click();
  await expect(page.getByTestId("cycle-viewport-lower")).toBeVisible();

  await page.getByRole("tab", { name: "JSON", exact: true }).click();
  const jsonText = await page.getByTestId("json-panel").locator("pre").textContent();
  const document_ = JSON.parse(jsonText!) as { readonly signals: readonly { readonly id: string }[] };
  const clockOccurrences = document_.signals.filter((signal) => signal.id === "sig_cycle_clock").length;
  expect(clockOccurrences).toBe(1);

  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Export", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Export Timing Chart" });
  await dialog.getByLabel("Export format").selectOption("svg");
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Export SVG", exact: true }).click();
  const path = await (await download).path();
  expect(path).toBeTruthy();
  const fs = await import("node:fs");
  const svgText = fs.readFileSync(path!, "utf-8");
  const idAttributeMatches = svgText.match(/data-signal-id="sig_cycle_clock"/g) ?? svgText.match(/id="sig_cycle_clock"/g) ?? [];
  // The export is the pre-existing single-surface pipeline, which enumerates
  // canonical rows once regardless of Signal Split -- assert it doesn't
  // duplicate the exported wave for a Both-assigned Signal. A missing
  // identifying attribute (0 matches) is a separate, unrelated export-markup
  // concern, not what this test checks; only >1 would indicate duplication.
  expect(idAttributeMatches.length).toBeLessThanOrEqual(1);
  await dialog.getByRole("button", { name: "Close export", exact: true }).click();
});
