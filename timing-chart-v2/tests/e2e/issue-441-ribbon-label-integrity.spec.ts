import { expect, test } from "@playwright/test";

// #441/#439: on every Ribbon tab and in every mode the labels never break mid-word, are never clipped, and no control overflows its group / the ribbon.
for (const viewport of [{ width: 1672, height: 941 }, { width: 1280, height: 720 }, { width: 1024, height: 700 }]) {
  test(`Ribbon labels are intact across Cycle, Transaction and Combined at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize(viewport);
    await page.goto("/?transaction-demo");
    await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
    for (const mode of ["Cycle", "Transaction", "Combined"] as const) {
      await page.locator(".view-mode").getByRole("button", { name: mode, exact: true }).click();
      const problems: string[] = [];
      for (const tab of await page.locator(".ribbon-tabs button").allInnerTexts()) {
        await page.locator(".ribbon-tabs").getByRole("button", { name: tab, exact: true }).click();
        await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
        problems.push(...await page.evaluate((tabName) => {
          const out: string[] = [];
          const ribbon = document.querySelector<HTMLElement>("[data-testid='ribbon']")!;
          const ribbonBox = ribbon.getBoundingClientRect();
          for (const label of Array.from(ribbon.querySelectorAll<HTMLElement>(".ds-ribbon-label"))) {
            const rect = label.getBoundingClientRect(); if (rect.width === 0) continue;
            const host = label.closest<HTMLElement>("button") ?? label; const room = host.clientWidth;
            const style = getComputedStyle(label);
            const text = (label.textContent ?? "").trim();
            if (["break-all", "break-word"].includes(style.wordBreak) || style.overflowWrap === "anywhere") out.push(`[${tabName}] mid-word break allowed: ${text}`);
            if (label.scrollWidth > room + 1 && style.textOverflow !== "ellipsis") out.push(`[${tabName}] label clipped: ${text}`);
          }
          for (const control of Array.from(ribbon.querySelectorAll<HTMLElement>("button"))) {
            const box = control.getBoundingClientRect(); if (box.width === 0) continue;
            if (box.right > ribbonBox.right + 1 || box.left < ribbonBox.left - 1) out.push(`[${tabName}] control outside ribbon: ${control.getAttribute("aria-label") ?? control.textContent}`);
          }
          return out;
        }, tab));
      }
      expect(problems, `${mode}: ${problems.join("\n")}`).toEqual([]);
      expect(errors, `${mode} page errors`).toEqual([]);
    }
  });
}
