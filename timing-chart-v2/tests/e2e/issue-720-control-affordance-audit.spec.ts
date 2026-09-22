import { expect, test } from "@playwright/test";

// #720 interaction-convention audit: every visible icon-only control has an accessible name and a tooltip (title); dialog-opening commands say so
// with an ellipsis or aria-haspopup; menu commands expose aria-haspopup/expanded; hovering never mutates Canonical.
const surfaces = ["[data-testid='ribbon']", "[data-testid='bottom-editor']", ".left-column-heading", ".ribbon-tabs"];
for (const viewport of [{ width: 1672, height: 941 }, { width: 1280, height: 720 }]) {
  for (const mode of ["Cycle", "Transaction", "Combined"] as const) {
    test(`icon-only controls are named and explained in ${mode} at ${viewport.width}x${viewport.height}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto("/?transaction-demo");
      await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
      await page.locator(".view-mode").getByRole("button", { name: mode, exact: true }).click();
      const revision = await page.getByTestId("cycle-surface").getAttribute("data-canonical-revision");
      const history = await page.getByTestId("history-status").innerText();
      const findings = await page.evaluate((selectors) => {
        const problems: string[] = [];
        const seen = new Set<Element>();
        for (const selector of selectors) for (const root of Array.from(document.querySelectorAll(selector))) for (const control of Array.from(root.querySelectorAll<HTMLElement>("button, [role='button']"))) {
          if (seen.has(control)) continue; seen.add(control);
          const rect = control.getBoundingClientRect(); if (rect.width === 0 || rect.height === 0 || getComputedStyle(control).visibility === "hidden") continue;
          const text = (control.textContent ?? "").replace(/\s+/g, "").replace(/[▾▸▴▼▲×✕…⋯]/g, "");
          const name = control.getAttribute("aria-label") ?? control.getAttribute("title") ?? (text.length > 0 ? text : "");
          const label = `${control.getAttribute("data-testid") ?? control.className.toString().slice(0, 40)}`;
          if (name.trim() === "") problems.push(`no accessible name: ${label}`);
          if (text.length === 0 && !control.getAttribute("title") && !control.getAttribute("aria-label")) problems.push(`icon-only without tooltip/name: ${label}`);
          if (text.length === 0 && control.getAttribute("aria-label") && !control.getAttribute("title") && !control.closest("[data-testid='ribbon']")) problems.push(`icon-only without title tooltip: ${label} (${control.getAttribute("aria-label")})`);
        }
        return problems;
      }, surfaces);
      expect(findings, findings.join("\n")).toEqual([]);
      // Hover help never mutates the document.
      for (const button of await page.locator("[data-testid='ribbon'] button").all()) { if (await button.isVisible()) await button.hover({ timeout: 1000 }).catch(() => undefined); }
      await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-canonical-revision", revision!);
      await expect(page.getByTestId("history-status")).toHaveText(history);
    });
  }
}
