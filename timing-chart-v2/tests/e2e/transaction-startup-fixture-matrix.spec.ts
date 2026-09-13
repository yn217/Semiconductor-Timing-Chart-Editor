import { generatePerformanceDocument } from "@timing-chart-v2/testing";
import { expect, test } from "@playwright/test";

for (const viewport of [{ width: 1280, height: 720 }, { width: 1672, height: 941 }] as const) for (const fixture of [
  { label: "small", signalCount: 10, cycleCount: 100 },
  { label: "medium", signalCount: 50, cycleCount: 200 },
] as const) {
  test(`Transaction Open reaches first useful paint for ${fixture.label} fixture at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    test.setTimeout(60_000);
    await page.setViewportSize(viewport);
    await page.goto("/");
    const surface = page.getByTestId("cycle-surface");
    await expect(surface).toHaveAttribute("data-cycle-view-ready", "true");
    const document = generatePerformanceDocument({ ...fixture, profile: "transaction-heavy" });
    await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({
      name: `${fixture.label}-transaction-startup.tcd`, mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(document)),
    });
    const discard = page.getByTestId("unsaved-discard");
    if (await discard.isVisible().catch(() => false)) await discard.click();
    await expect(page.locator(".app-titlebar h1")).toHaveText(document.document.title, { timeout: 60_000 });
    await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
    await expect(page.getByTestId("transaction-lanes")).toBeVisible();
    await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 60_000 });
    const metrics = await surface.evaluate((element) => {
      const counters = JSON.parse(element.getAttribute("data-session-counters") ?? "{}") as Record<string, number>;
      return { projectionCalls: counters.projectionCalls ?? 0, fullReplaceCalls: counters.fullReplaceCalls ?? 0, viewportOnlyCalls: counters.viewportOnlyCalls ?? 0, rows: element.ownerDocument.querySelectorAll("[data-testid='transaction-left-tree'] [data-testid^='transaction-left-tree-row-']").length };
    });
    console.log(JSON.stringify({ fixture, metrics }));
    expect(metrics.projectionCalls).toBeGreaterThan(0);
    expect(metrics.rows).toBeGreaterThan(0);
  });
}
