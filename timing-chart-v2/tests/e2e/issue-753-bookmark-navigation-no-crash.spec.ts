import { expect, test } from "@playwright/test";

/**
 * #753 regression: in the 2026-09-20 recording (12-01-22, 121.7s -> 122.3s) interacting with the Bottom Bookmarks row "Reset Release" in
 * Transaction mode (1 TC = 50 cycles, a Transaction selected, document modified) left a white page at the same URL. Every Bookmark
 * navigation path must keep the editor mounted, stay on the same URL and raise no page/console error.
 */
for (const size of [{ width: 1280, height: 720 }, { width: 1672, height: 941 }, { width: 1392, height: 900 } /* recording viewport */]) {
  test(`Bookmark row/marker/Previous/Next keep the editor mounted with no navigation at ${size.width}x${size.height}`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text().slice(0, 300)}`); });
    const navigations: string[] = [];
    page.on("framenavigated", (f) => { if (f === page.mainFrame()) navigations.push(f.url()); });
    await page.setViewportSize(size);
    await page.goto("/");
    await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
    await expect(page.getByTestId("transaction-left-tree")).toContainText("Read_0");
    const tc = page.locator("select").filter({ has: page.locator("option[value='50']") }).first();
    if (await tc.count()) await tc.selectOption("50");
    // Modify the document like the recording (create + select a Transaction).
    await page.locator("[data-transaction-row-id]").last().click();
    await page.getByRole("tab", { name: "Bookmarks", exact: true }).click();
    const rows = page.locator("[data-testid^='bookmark-row-']");
    await expect(rows.first()).toBeVisible();
    const startUrl = page.url();
    const alive = async (label: string) => {
      await page.waitForTimeout(700);
      const state = await page.evaluate(() => ({ editor: !!document.querySelector(".editor-shell"), bodyText: document.body.innerText.length }));
      expect(state.editor, `${label}: editor still mounted`).toBe(true);
      expect(page.url(), `${label}: no navigation`).toBe(startUrl);
    };
    await rows.first().click(); await alive("click row 0");
    await rows.first().dblclick(); await alive("dblclick row 0");
    for (let i = 0; i < 5; i += 1) { await rows.nth(i).click(); await rows.nth(i).dblclick(); }
    await alive("click+dblclick all rows");
    for (const name of ["Previous", "Next"]) { const b = page.getByRole("button", { name, exact: true }).first(); if (await b.count()) { await b.click(); await alive(name); } }
    const marker = page.locator(".transaction-bookmark-markers button").first();
    if (await marker.count()) { await marker.click(); await alive("ruler marker click"); await marker.dblclick(); await alive("ruler marker dblclick"); }
    expect(errors).toEqual([]);
  });
}
