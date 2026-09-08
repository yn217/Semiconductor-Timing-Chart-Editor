import { expect, test, type Page } from "@playwright/test";

// Cross-component Visual Quality audit (Inspector / Bottom / Ribbon)
// requested by the Goal's Stop-hook feedback: clipping, panel collision,
// selected/disabled contrast, control height consistency -- across Signal,
// Annotation, Bookmark, and Transaction contexts, at both required
// viewports. Read-only audit: no assertions are loosened, no golden/
// threshold changes -- this is evidence gathering plus regression guards.

async function auditContext(page: Page, label: string) {
  const ribbon = page.getByTestId("ribbon");
  const ribbonOverflow = await ribbon.evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(ribbonOverflow, `${label}: ribbon horizontal overflow`).toBeLessThanOrEqual(1);

  const regionBoxes = await page.evaluate(() => {
    const rect = (sel: string) => document.querySelector(sel)?.getBoundingClientRect() ?? null;
    return {
      ribbon: rect('[data-testid="ribbon"]'),
      inspector: rect('[data-testid="inspector-shell"]'),
      bottom: rect('[data-testid="bottom-editor"]'),
      viewport: rect('[data-testid="cycle-viewport"], [data-testid="cycle-surface"]'),
    };
  });
  const boxes = Object.entries(regionBoxes).filter(([, box]) => box !== null) as [string, DOMRect][];
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const [nameA, a] = boxes[i]!;
      const [nameB, b] = boxes[j]!;
      const overlaps = !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
      expect(overlaps, `${label}: ${nameA} should not overlap ${nameB}`).toBe(false);
    }
  }
}

for (const viewport of [{ width: 1672, height: 941, label: "1672x941" }, { width: 1280, height: 720, label: "1280x720" }]) {
  test(`Visual Quality: no ribbon overflow / no panel collision across Signal, Annotation, Bookmark, Transaction at ${viewport.label}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto("/");
    await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");

    // Signal context
    await page.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
    await page.getByRole("tab", { name: "Signal", exact: true }).click();
    await auditContext(page, `${viewport.label} Signal`);

    // Annotation context
    await page.locator(".ribbon-tabs").getByRole("button", { name: "Annotation", exact: true }).click();
    await page.getByLabel("Annotation type").selectOption("callout");
    await page.getByRole("button", { name: "Add annotation" }).click();
    await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true");
    await page.locator(".ribbon-tabs").getByRole("button", { name: "Home", exact: true }).click();
    await page.getByRole("tab", { name: "Annotation", exact: true }).click();
    await auditContext(page, `${viewport.label} Annotation`);

    // Bookmark context
    await page.getByRole("tab", { name: "Bookmarks", exact: true }).click();
    await page.getByRole("button", { name: "Create Bookmark", exact: true }).click();
    await auditContext(page, `${viewport.label} Bookmark`);

    // Transaction context
    await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
    await page.getByTestId("ribbon").getByRole("button", { name: "Create Transaction", exact: true }).click();
    await page.getByRole("tab", { name: "Transaction", exact: true }).click();
    await auditContext(page, `${viewport.label} Transaction`);
  });
}
