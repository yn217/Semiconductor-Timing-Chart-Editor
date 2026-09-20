import { expect, test } from "@playwright/test";
import { startInCycleMode } from "./cycle-startup.js";

startInCycleMode(test);

// Hiding a Signal from the Inspector must compact rows exactly like the Ribbon's Hide: the hidden signal's wave owner is
// removed and every remaining wave owner stays aligned with its label row (previously the owners stayed one row off).
test("Inspector 'visible' off + Apply removes the wave owner and keeps every waveform aligned with its label row", async ({ page }) => {
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  const inspector = page.getByTestId("inspector");
  await inspector.getByLabel("Inspector signal visible").uncheck();
  await inspector.getByTestId("apply-inspector-signal").click();
  await expect(host.locator("[data-role='wave-owner'][data-signal-id='sig_cycle_request']")).toHaveCount(0);
  const offsets = await page.evaluate(() => {
    const y = (element: Element) => Math.round(element.getBoundingClientRect().y);
    return [...document.querySelectorAll<HTMLElement>("[data-role='frozen-row']")].map((row) => {
      const owner = document.querySelector<HTMLElement>(`[data-role='wave-owner'][data-signal-id='${row.dataset.rowId}']`);
      return { id: row.dataset.rowId, delta: owner ? y(owner) - y(row) : null };
    });
  });
  expect(offsets.length).toBeGreaterThan(5);
  for (const item of offsets) expect(item.delta, `${item.id}: wave owner vs label row`).toBe(0);
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
});
