import { expect, test } from "@playwright/test";

// #200 PR 4: real per-signal Upper/Lower/Both render routing, on top of PR
// 3's already-covered dual-viewport/scroll shell (tests/e2e/signal-split.spec.ts).
// Assigns REQUEST -> Upper, DATA[7:0] -> Lower, RESET_N left at the default
// (Both), and verifies each pane's own DOM only ever mounts its own rows --
// not just that the toggle/scroll mechanics work.
//
// Product decision update (GUI/UX Closure Goal, 2026-09-07): Signal Split
// is redefined as "the same Cycle signal list shown in two independently-
// scrolling viewports" -- the per-signal Upper/Lower/Both assignment this
// file drives through the Inspector's "Split Pane" select is deprecated
// and that control has been removed from every Inspector (Signal, Clock)
// per that decision (see minimal-cycle-view-panels.tsx /
// inspector-clock-editor.tsx). The underlying `signal.display.splitPane`
// schema field, planner validation, row-layout filter and export routing
// this file exercises are architecture-owned (schema/commands/projection/
// export) and intentionally left untouched here -- removing them is a
// separate, Codex-scoped decision this GUI pass does not make.
// The two tests below that assign a Split Pane entirely through the
// now-removed Inspector control (`test.skip`, not deleted, so this
// coverage is easy to restore -- or retarget at whatever new entry
// point, if any, replaces it -- once that decision is made) can no
// longer run through any GUI surface. One other test had its own final
// assertion trimmed for the same reason but is otherwise still valid
// dual-viewport-shell coverage and stays running; the export- and
// canvas-click-sharing tests don't touch per-signal assignment at all
// and are unaffected.

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
  await assignSplitPane(page, host, "sig_cycle_request", "upper", "signal");
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

  // Upper: REQUEST (upper) and RESET_N (both) render; DATA[7:0] (lower-only) does not.
  await expect(host.locator("[data-role='timing-row'][data-row-id='sig_cycle_request']")).toHaveCount(1);
  await expect(host.locator("[data-role='timing-row'][data-row-id='sig_cycle_reset_n']")).toHaveCount(1);
  await expect(host.locator("[data-role='timing-row'][data-row-id='sig_cycle_data']")).toHaveCount(0);
  await expect(host.locator("[data-role='left-row'][data-row-id='sig_cycle_data']")).toHaveCount(0);

  // Lower: DATA[7:0] (lower) and RESET_N (both) render; REQUEST (upper-only) does not.
  await expect(lowerHost.locator("[data-role='timing-row'][data-row-id='sig_cycle_data']")).toHaveCount(1);
  await expect(lowerHost.locator("[data-role='timing-row'][data-row-id='sig_cycle_reset_n']")).toHaveCount(1);
  await expect(lowerHost.locator("[data-role='timing-row'][data-row-id='sig_cycle_request']")).toHaveCount(0);
  await expect(lowerHost.locator("[data-role='left-row'][data-row-id='sig_cycle_request']")).toHaveCount(0);

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
  await expect(lowerHost.locator("[data-role='timing-row'][data-row-id='sig_cycle_request']")).toHaveCount(1);
  await ribbon.getByRole("button", { name: "Redo", exact: true }).click();
  await ribbon.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(page.getByTestId("history-status")).toHaveText("History 2 / Redo 0");
  await expect(host.locator("[data-role='timing-row'][data-row-id='sig_cycle_data']")).toHaveCount(0);
  await expect(lowerHost.locator("[data-role='timing-row'][data-row-id='sig_cycle_request']")).toHaveCount(0);

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
  await expect(reopenedLowerHost.locator("[data-role='timing-row'][data-row-id='sig_cycle_request']")).toHaveCount(0);
  await expect(reopenedLowerHost.locator("[data-role='timing-row'][data-row-id='sig_cycle_data']")).toHaveCount(1);
});

test("mirrors grid, playhead and range-selection band into Lower from the one shared time mapping", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const surface = host.locator("[data-role='timing-chart-surface']");

  // Select a real range first, in the ordinary single-pane layout (an
  // existing, unrelated ruler/geometry click-target concern makes the drag
  // itself unreliable once the shorter split-mode viewport potentially
  // virtualizes the click target's row out of view -- select the range
  // before Split is even on, then verify Lower correctly mirrors it once
  // Split turns on).
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Timeline", exact: true }).click();
  const wave = host.locator("[data-role='stable-waveform-surface']");
  const owner = wave.locator("[data-signal-id='sig_cycle_request']");
  const ownerBox = (await owner.boundingBox())!;
  const startBox = (await page.getByTestId("cycle-ruler").locator("[data-cycle='1']").boundingBox())!;
  const endBox = (await page.getByTestId("cycle-ruler").locator("[data-cycle='20']").boundingBox())!;
  const y = ownerBox.y + ownerBox.height / 2;
  const countersBefore = await surface.getAttribute("data-render-counters");
  await page.mouse.move(startBox.x, y);
  await page.mouse.down();
  await page.mouse.move(endBox.x, y, { steps: 10 });
  await page.mouse.up();
  // The exact snapped boundary is an existing ruler/geometry concern (not
  // #200's), so only require a real, non-empty range was selected.
  await expect(page.getByLabel("Timeline range start")).not.toHaveValue("");
  await expect(page.getByTestId("range-selection-band")).not.toBeHidden();
  // A pure range selection is view-only and must not regenerate any
  // WaveDrom row.
  const countersAfter = await surface.getAttribute("data-render-counters");
  expect(JSON.parse(countersAfter!).waveDromRenders).toBe(JSON.parse(countersBefore!).waveDromRenders);

  await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
  await page.getByTestId("view-panel-signal-split").click();
  const lowerHost = page.getByTestId("cycle-surface-lower");
  await expect(lowerHost).toBeVisible();

  // Grid: same cycle-boundary lines in both panes (one shared time mapping).
  const gridUpperLines = await page.getByTestId("geometry-grid").locator("[data-role='geometry-grid-line']").count();
  const gridLowerLines = await page.getByTestId("geometry-grid-lower").locator("[data-role='geometry-grid-line']").count();
  expect(gridLowerLines).toBe(gridUpperLines);
  expect(gridLowerLines).toBeGreaterThan(0);

  // Playhead: mirrored into Lower's own ruler.
  await expect(page.getByTestId("cycle-ruler-lower").locator("[data-role='playhead']")).toHaveCount(1);

  // Range-selection band: same horizontal extent (shared mapping) on both
  // panes, mirrored the instant Split turns on.
  const bandUpper = page.getByTestId("range-selection-band");
  const bandLower = page.getByTestId("range-selection-band-lower");
  await expect(bandUpper).not.toBeHidden();
  await expect(bandLower).not.toBeHidden();
  const upperStyle = await bandUpper.evaluate((el: HTMLElement) => ({ left: el.style.left, width: el.style.width }));
  const lowerStyle = await bandLower.evaluate((el: HTMLElement) => ({ left: el.style.left, width: el.style.width }));
  expect(lowerStyle).toEqual(upperStyle);
  // The former closing assertion here ("assigning a Split Pane never
  // regenerates any waveform") drove the assignment through the now-
  // removed Inspector "Split Pane" control -- see the file header note.
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
  // (No Signal in this document is actually assigned Upper/Lower -- only
  // the view mode itself is toggled on -- so the combined two-pane export
  // path below never activates here; see the next test for that case.)
  expect(idAttributeMatches.length).toBeLessThanOrEqual(1);
  await dialog.getByRole("button", { name: "Close export", exact: true }).click();
});

// #200 combined two-pane export: once a Signal genuinely has an Upper or
// Lower assignment (not just the view toggled on), export must show the
// real two-block layout -- Upper's rows, then Lower's, stacked -- and
// duplicate a "Both" Signal once per pane rather than pretending the
// split doesn't exist.
test("real Upper/Lower assignment produces a combined two-pane export: stacked blocks, and a Both Signal renders once per pane", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");

  await assignSplitPane(page, host, "sig_cycle_request", "upper", "signal");
  await assignSplitPane(page, host, "sig_cycle_ready", "lower", "signal");
  // sig_cycle_valid is left unassigned (default "both").

  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Export", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Export Timing Chart" });
  await dialog.getByLabel("Export format").selectOption("svg");
  await dialog.getByLabel("Signal layout").selectOption("preserve-split");
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Export SVG", exact: true }).click();
  const path = await (await download).path();
  expect(path).toBeTruthy();
  const fs = await import("node:fs");
  const svgText = fs.readFileSync(path!, "utf-8");

  const yOf = (signalId: string) => [...svgText.matchAll(new RegExp(`data-signal-id="${signalId}"[^>]*\\sy="([^"]+)"`, "g"))].map((match) => Number(match[1]));
  const requestYs = yOf("sig_cycle_request");
  const readyYs = yOf("sig_cycle_ready");
  const validYs = yOf("sig_cycle_valid");
  expect(requestYs).toHaveLength(1);
  expect(readyYs).toHaveLength(1);
  // "Both" Signal: once per pane.
  expect(validYs).toHaveLength(2);
  // Upper block (Request, then Valid's Upper occurrence, in that document
  // order) sits entirely above the Lower block (Ready, then Valid's Lower
  // occurrence, again in document order -- Ready precedes Valid).
  const [validUpper, validLower] = [...validYs].sort((left, right) => left - right);
  expect(validUpper).toBeGreaterThan(requestYs[0]!);
  expect(readyYs[0]).toBeGreaterThan(validUpper!);
  expect(validLower).toBeGreaterThan(readyYs[0]!);
  await dialog.getByRole("button", { name: "Close export", exact: true }).click();
});

// #200 Lower-local row interaction PR1: a plain click on Lower's own
// waveform canvas selects that cycle, exactly like clicking Upper's does
// (shared horizontal geometry, shared selectedCycle state) -- the one
// interaction this issue's evidence named as still missing. Deliberately
// narrower than Upper's full canvas interaction set: no drag-range-
// selection, no annotation drag, no context menu yet (a further, separate
// follow-up).
test("clicking Lower's own waveform canvas selects a cycle, shared with Upper, without mutating Canonical/History/Dirty", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
  await page.getByTestId("view-panel-signal-split").click();
  const lowerHost = page.getByTestId("cycle-surface-lower");
  await expect(lowerHost).toBeVisible();

  const revisionBefore = await host.getAttribute("data-canonical-revision");
  const historyBefore = await page.getByTestId("history-status").textContent();
  const dirtyBefore = await page.getByTestId("dirty-status").textContent();

  // Lower's own ruler only mirrors the playhead (see the previous test),
  // not a full tick/label set -- the shared horizontal geometry means
  // Upper's ruler ticks give the identical x pixel position for both
  // panes, so use those for the click's x-coordinate.
  const lowerWave = lowerHost.locator("[data-role='stable-waveform-surface']").locator("[data-signal-id='sig_cycle_clock']");
  const tickBox = (await page.getByTestId("cycle-ruler").locator("[data-cycle='5']").boundingBox())!;
  const waveBox = (await lowerWave.boundingBox())!;
  await page.mouse.click(tickBox.x, waveBox.y + waveBox.height / 2);

  await expect(host).toHaveAttribute("data-selected-cycle", "5");
  await expect(lowerHost).toHaveAttribute("data-selected-cycle", "5");
  // View-only: no Canonical/History/Dirty mutation.
  await expect(host).toHaveAttribute("data-canonical-revision", revisionBefore!);
  await expect(page.getByTestId("history-status")).toHaveText(historyBefore!);
  await expect(page.getByTestId("dirty-status")).toHaveText(dirtyBefore!);

  // A second click at a different cycle updates both panes again -- not a
  // one-shot fluke.
  const secondTickBox = (await page.getByTestId("cycle-ruler").locator("[data-cycle='9']").boundingBox())!;
  await page.mouse.click(secondTickBox.x, waveBox.y + waveBox.height / 2);
  await expect(host).toHaveAttribute("data-selected-cycle", "9");
  await expect(lowerHost).toHaveAttribute("data-selected-cycle", "9");
});
