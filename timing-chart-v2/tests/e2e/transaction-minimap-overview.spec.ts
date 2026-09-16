import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

// #429/#397 Transaction Mode Product Closure P1: the MiniMap had no
// Transaction-aware overview at all -- an earlier stop-gap (#397) hid it
// outright in Transaction Mode rather than show stale Signal content. This
// wires a real Transaction overview (buildMiniMapTransactionOverview,
// packages/projection/src/minimap.ts) into the same MiniMap widget: one
// row per (Group, Lane) pair actually in use, each Transaction rendered as
// a colored segment (Transaction color, falling back to its Group color).
// Verified the same way the existing Signal MiniMap test verifies itself
// (full-gui.spec.ts's "MiniMap renders a derived waveform overview..."):
// DOM structure/color counts, not pixel screenshots -- this MiniMap is a
// ~115px-tall CAD-density widget whose segments (4-6px tall) are visually
// subtle even for the pre-existing, already-shipped Signal overview.

const dirname = path.dirname(fileURLToPath(import.meta.url));
const samplePath = path.resolve(dirname, "../../samples/acceptance-429/sample-transaction-mode-closure.tcd.json");

async function openSample(page: import("@playwright/test").Page) {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(samplePath);
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true");
}

test("MiniMap shows a Transaction-aware overview in Transaction Mode: one segment per Transaction, real colors, one row per (Group,Lane)", async ({ page }) => {
  await openSample(page);
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  await page.getByRole("tab", { name: "Transaction", exact: true }).click();
  await page.getByTestId("transaction-left-tree-row-txn_read0").click();

  const minimap = page.getByTestId("minimap");
  await expect(minimap).toHaveAttribute("data-minimap-mode", "transaction");
  // 6 Transactions -> 6 segments; (Memory,lane_0)=2, (CPU,lane_1)=2,
  // (Peripheral,lane_2)=1, (undefined,lane_0)=1 -> 4 rows.
  await expect(minimap.locator(".minimap-segment-transaction")).toHaveCount(6);
  await expect(minimap.locator("[data-lane-key]")).toHaveCount(4);

  const colors = await minimap.locator(".minimap-segment-transaction").evaluateAll((els) => els.map((el) => getComputedStyle(el).backgroundColor));
  // Every Transaction here has its own authored color -- 6 segments, 6
  // distinct colors, none of them the flat Signal-segment fallback.
  expect(new Set(colors).size).toBe(6);
  expect(colors).not.toContain("rgb(220, 234, 254)");

  // Transaction Mode GUI realignment: the assertions above only ever
  // checked each segment's OWN computed color -- they stayed green even
  // while a real bug painted the viewport-indicator rectangle
  // (`[data-testid="minimap-viewport"]`) with a near-opaque `#f7faff`
  // background directly on top of every segment (DOM paint order puts it
  // last), visually hiding the whole overview whenever the visible range
  // wasn't exactly 100% zoomed out -- the overwhelmingly common case. A
  // screenshot-based check would have caught this; a DOM-only one didn't.
  // Guard the actual paint-order/opacity contract instead: the overlay's
  // background alpha must stay low enough that it can never mask the
  // segments underneath it, regardless of how much of the range it covers.
  const viewportBg = await minimap.getByTestId("minimap-viewport").evaluate((el) => getComputedStyle(el).backgroundColor);
  // rgba(r, g, b, a) has a 4th component; a plain rgb(r, g, b) is fully
  // opaque (alpha 1) regardless of its channel values.
  const alphaMatch = /^rgba\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*,\s*([\d.]+)\s*\)$/.exec(viewportBg);
  const alpha = alphaMatch ? Number(alphaMatch[1]) : 1;
  expect(alpha).toBeLessThan(0.3);
});

test("MiniMap falls back to the Signal overview in Cycle Mode, view-only throughout", async ({ page }) => {
  await openSample(page);
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  const minimap = page.getByTestId("minimap");
  await expect(minimap).toHaveAttribute("data-minimap-mode", "signal");
  await expect(minimap.locator("[data-row-id]")).toHaveCount(8);
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");

  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  await expect(minimap).toHaveAttribute("data-minimap-mode", "transaction");
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");

  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  await expect(minimap).toHaveAttribute("data-minimap-mode", "signal");
  await expect(minimap.locator("[data-row-id]")).toHaveCount(8);
});
