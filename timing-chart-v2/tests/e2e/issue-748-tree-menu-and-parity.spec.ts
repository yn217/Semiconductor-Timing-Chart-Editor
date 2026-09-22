import { expect, test } from "@playwright/test";

// #748: the Transaction Tree menu carries the documented commands, Escape returns focus to its invoker, Expand/Collapse All drive the shared
// disclosure owner (view-only), Show/Hide All is one History unit each, and the header controls match Cycle's control geometry.
for (const viewport of [{ width: 1672, height: 941 }, { width: 1280, height: 720 }]) {
  test(`Transaction Tree menu behaviour and Cycle parity at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/?transaction-demo");
    await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
    // Cycle reference geometry first.
    await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
    const cycle = await page.evaluate(() => {
      const box = (selector: string) => { const el = document.querySelector<HTMLElement>(selector); const r = el?.getBoundingClientRect(); return r ? { w: Math.round(r.width), h: Math.round(r.height) } : undefined; };
      return { add: box(".tree-add-button"), more: box(".tree-more-button"), filter: box(".tree-filter-controls select"), search: box(".tree-filter-controls input") };
    });
    await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
    const header = page.getByTestId("transaction-tree-header");
    const transaction = await page.evaluate(() => {
      const box = (selector: string) => { const el = document.querySelector<HTMLElement>(selector); const r = el?.getBoundingClientRect(); return r ? { w: Math.round(r.width), h: Math.round(r.height) } : undefined; };
      return { add: box(".tree-add-button"), more: box(".tree-more-button"), search: box("[data-testid='transaction-tree-search']"), filter: box("[aria-label='Filter transactions']") };
    });
    // Same control height as Cycle's Add / More (width may differ by design; height and the More button size must match).
    expect(transaction.more).toEqual(cycle.more);
    expect(transaction.add!.h).toBe(cycle.add!.h);
    expect(transaction.search!.h).toBe(transaction.filter!.h);
    expect(transaction.search!.h).toBe(cycle.search!.h);
    expect(transaction.filter!.h).toBe(cycle.filter!.h);

    // Accessible names from the Issue.
    await expect(header.getByRole("button", { name: "Add transaction", exact: true })).toBeVisible();
    await expect(header.getByRole("button", { name: "Transaction tree actions", exact: true })).toBeVisible();
    await expect(header.getByRole("textbox", { name: "Search transactions" })).toHaveAttribute("placeholder", "Search transactions…");
    await expect(header.getByRole("combobox", { name: "Filter transactions" })).toBeVisible();

    const history = () => page.getByTestId("history-status").innerText();
    const revision = () => page.getByTestId("cycle-surface").getAttribute("data-canonical-revision");
    const h0 = await history(); const r0 = await revision();
    const more = page.getByTestId("transaction-tree-more");
    const menu = page.getByTestId("transaction-tree-more-menu");
    await more.click();
    for (const name of ["Expand All", "Collapse All", "Show All", "Hide All", "Add Group…"]) await expect(menu.getByRole("menuitem", { name, exact: true })).toBeVisible();
    // Escape closes and hands focus back to the invoker.
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
    await expect(more).toBeFocused();

    // Collapse/Expand All: view-only, shared disclosure (group rows disappear/reappear), no History/Canonical change.
    const rows = () => page.locator("[data-testid^='transaction-left-tree-row-']").count();
    const expanded = await rows();
    await more.click(); await menu.getByRole("menuitem", { name: "Collapse All", exact: true }).click();
    await expect.poll(rows).toBeLessThan(expanded);
    await more.click(); await menu.getByRole("menuitem", { name: "Expand All", exact: true }).click();
    await expect.poll(rows).toBe(expanded);
    expect(await history()).toBe(h0); expect(await revision()).toBe(r0);

    // Hide All then Show All: each is a semantic visibility change, and the Tree reflects it.
    await more.click(); await menu.getByRole("menuitem", { name: "Hide All", exact: true }).click();
    await expect.poll(history).not.toBe(h0);
    const hidden = await history();
    await more.click(); await menu.getByRole("menuitem", { name: "Show All", exact: true }).click();
    await expect.poll(history).not.toBe(hidden);
  });
}
