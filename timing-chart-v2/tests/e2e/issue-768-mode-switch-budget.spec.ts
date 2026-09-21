import { expect, test } from "@playwright/test";
import { generatePerformanceDocument } from "@timing-chart-v2/testing";

// #768: mode switching has a stated cost budget, measured INSIDE the page (performance.now around a real button click until data-editor-idle) so
// Playwright's own locator/role-engine traversal of a large DOM is not part of the number. Median of N round trips on a fixed fixture.
const SWITCHES = 8;
test("median view-mode switch on a 24x256 document stays inside the budget", async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto("/");
  const document = generatePerformanceDocument({ signalCount: 24, cycleCount: 256, profile: "transaction-heavy" });
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "budget.tcd", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(document)) });
  await page.waitForFunction(() => document.querySelector("[data-testid='cycle-surface']")?.getAttribute("data-editor-idle") === "true", null, { timeout: 90_000 });
  const history = await page.getByTestId("history-status").innerText();
  const times = await page.evaluate(async (count) => {
    const out: number[] = [];
    const idle = () => new Promise<void>((resolve) => { const tick = () => { if (document.querySelector("[data-testid='cycle-surface']")?.getAttribute("data-editor-idle") === "true") resolve(); else requestAnimationFrame(tick); }; requestAnimationFrame(() => requestAnimationFrame(tick)); });
    for (let index = 0; index < count; index += 1) {
      const mode = index % 2 === 0 ? "Cycle" : "Transaction";
      const button = Array.from(document.querySelectorAll<HTMLButtonElement>(".view-mode button")).find((b) => b.textContent?.trim() === mode)!;
      const start = performance.now(); button.click(); await idle(); out.push(Math.round(performance.now() - start));
    }
    return out;
  }, SWITCHES);
  const sorted = [...times].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)]!;
  console.log(`mode-switch times (ms): ${times.join(", ")} median=${median}`);
  expect(median, `switch times ${times.join(", ")}`).toBeLessThan(BUDGET_MS);
  await expect(page.getByTestId("history-status")).toHaveText(history);
});
const BUDGET_MS = 3000;
