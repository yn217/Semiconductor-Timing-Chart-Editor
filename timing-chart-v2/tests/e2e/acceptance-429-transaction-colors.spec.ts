import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

// #429/#397 Transaction Mode Product Closure P0-4: Transaction/Group color
// was resolved correctly for the Left Tree row swatch and the Bottom Table
// swatch, but the actual canvas bar in transaction-lanes.tsx never applied
// it at all -- every Transaction rendered in the same static pale-blue CSS
// default regardless of its real `color` (or its Group's `color`). Fixed
// by setting a `--transaction-color` custom property per-bar (not
// `background` directly, so the CSS selected-state rule keeps winning by
// specificity instead of being permanently shadowed by an inline style --
// the same interaction-priority class of bug already fixed for Signal rows
// under #472) and deriving the bar/phase backgrounds from it via
// `color-mix`.
//
// Loads samples/acceptance-429/sample-transaction-mode-closure.tcd.json
// through the real production File > Open input: 6 Transactions across 3
// Groups (Memory/CPU/Peripheral) + Ungrouped, 3 Lanes, phases, distinct
// colors, linked Signals, and a non-1:1 Transaction Time Scale.

const dirname = path.dirname(fileURLToPath(import.meta.url));
const samplePath = path.resolve(dirname, "../../samples/acceptance-429/sample-transaction-mode-closure.tcd.json");

async function openSample(page: import("@playwright/test").Page) {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(samplePath);
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  await page.getByRole("tab", { name: "Transaction", exact: true }).click();
}

for (const viewport of [{ width: 1672, height: 941 }, { width: 1280, height: 720 }]) {
  test(`Transaction bars render distinct authored colors, no console errors, at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    await openSample(page);

    const bars = await page.evaluate(() => {
      const results: Record<string, string> = {};
      document.querySelectorAll<HTMLElement>("[data-transaction-id]").forEach((el) => {
        const id = el.getAttribute("data-transaction-id");
        if (id) results[id] = getComputedStyle(el).backgroundColor;
      });
      return results;
    });
    // Six distinct Transactions authored with six distinct colors must
    // produce six distinct rendered backgrounds -- not one shared default.
    expect(new Set(Object.values(bars)).size).toBe(6);
    expect(errors).toEqual([]);
  });
}

test("selection highlight still visibly overrides a Transaction's own color", async ({ page }) => {
  await openSample(page);
  const bar = page.locator('[data-transaction-id="txn_execute0"]');
  const before = await bar.evaluate((el) => getComputedStyle(el).backgroundColor);
  await bar.click();
  const after = await bar.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(after).not.toBe(before);
});

test("Transaction Time Scale label reflects the document's authored 1 TC = 10 cycles", async ({ page }) => {
  await openSample(page);
  await expect(page.locator("span", { hasText: /^Time Scale:/ })).toHaveText("Time Scale: Transaction Cycle (TC)    Reference: System Clock (1 TC = 10 Cycles)");
});
