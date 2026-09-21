import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

// #625 acceptance: the Cycle-only structural split must not move Transaction, Combined or (visually) Cycle. The fixture is the
// pre-split measurement of the same elements at both locked viewports; every box must stay within 1px.
const baseline = JSON.parse(readFileSync(new URL("./fixtures/issue-625-pre-split-geometry.json", import.meta.url), "utf8")) as Record<string, Record<string, unknown>>;

test("Transaction, Combined and Cycle geometry is unchanged by the Cycle-only split (<=1px)", async ({ page }) => {
  test.setTimeout(180_000);
  for (const viewport of [{ width: 1280, height: 720 }, { width: 1672, height: 941 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await page.waitForSelector("[data-testid='cycle-surface'][data-cycle-view-ready='true']", { state: "attached" });
    for (const mode of ["Transaction", "Combined", "Cycle"]) {
      await page.locator(".view-mode").getByRole("button", { name: mode, exact: true }).click();
      await page.waitForSelector("[data-testid='cycle-surface'][data-editor-idle='true']", { state: "attached" });
      await page.waitForTimeout(400);
      const now = await page.evaluate(() => {
        const r = (el: Element | null | undefined) => { if (!el) return null; const b = el.getBoundingClientRect(); return [Math.round(b.x * 10) / 10, Math.round(b.y * 10) / 10, Math.round(b.width * 10) / 10, Math.round(b.height * 10) / 10]; };
        const many = (sel: string, n = 6) => Array.from(document.querySelectorAll(sel)).slice(0, n).map(r);
        return {
          ruler: r(document.querySelector("[data-testid='cycle-ruler']")), ticks: many("[data-testid='cycle-ruler'] .cycle-tick", 5),
          left: r(document.querySelector("[data-role='left-tree-rows']")), frozen: r(document.querySelector("[data-role='frozen-label-rows']")),
          frozenRows: many("[data-role='frozen-row']"), leftRows: many("[data-role='left-row']"), waveOwners: many("[data-role='wave-owner']"),
          lanes: many("[data-testid='transaction-lanes'] [data-transaction-id]", 6), transactionLanes: r(document.querySelector("[data-testid='transaction-lanes']")),
          grid: r(document.querySelector("[data-testid='geometry-grid']")), viewport: r(document.querySelector("[data-testid='cycle-viewport']")),
        } as Record<string, unknown>;
      });
      const before = baseline[`${viewport.width}x${viewport.height}:${mode}`]!;
      const compare = (a: unknown, b: unknown, path: string): void => {
        if (Array.isArray(a) && (a.length === 0 || typeof a[0] === "number")) {
          expect(Array.isArray(b), path).toBe(true);
          // #756: in Cycle the panel/tree/grid columns now span Main + Bottom, so only their heights changed (x/y/width are pinned).
          const heightChangedInCycle = mode === "Cycle" && /^(left|frozen|viewport|grid)$/.test(path);
          (a as number[]).forEach((value, index) => heightChangedInCycle && index === 3 ? undefined : expect(Math.abs(value - (b as number[])[index]!), `${viewport.width}x${viewport.height} ${mode} ${path}[${index}]`).toBeLessThanOrEqual(1));
        } else if (Array.isArray(a)) (a as unknown[]).forEach((item, index) => compare(item, (b as unknown[])[index], `${path}.${index}`));
        else if (a === null) expect(b, path).toBeNull();
      };
      for (const key of Object.keys(before)) compare(before[key], now[key], key);
    }
  }
});
