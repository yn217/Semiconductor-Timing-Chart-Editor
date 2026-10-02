import { expect, test } from "@playwright/test";
import { expectSharedSourceBoundaryX } from "./helpers/time-axis-alignment.js";

test("Combined keeps Transaction and Cycle source boundaries aligned after column resize", async ({ page }) => {
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto("/?transaction-demo");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Combined", exact: true }).click();
  const bar = page.getByTestId("transaction-lanes").locator("[data-transaction-id='demo_txn_read']");
  await expect(bar).toBeVisible();
  const ruler = page.getByTestId("cycle-ruler");
  const points = [10, 20, 60];
  const readX = async () => {
    const positions: Record<number, Readonly<Record<string, number>>> = {};
    for (const cycle of points) {
      const address = bar.locator("[data-phase-segment][title^='Address']");
      const readData = bar.locator("[data-phase-segment][title^='Read Data']");
      const response = bar.locator("[data-phase-segment][title^='Response']");
      const consumers = cycle === 10
        ? [{ name: "transaction bar", locator: bar }, { name: "Address phase start", locator: address }]
        : cycle === 20
          ? [{ name: "Address phase end", locator: address, edge: "right" as const }, { name: "Read Data phase start", locator: readData }]
          : [{ name: "transaction bar", locator: bar, edge: "right" as const }, { name: "Response phase end", locator: response, edge: "right" as const }];
      positions[cycle] = await expectSharedSourceBoundaryX(cycle, ruler.locator(`[data-cycle='${cycle}']`), [
        ...consumers,
      ]);
    }
    return positions;
  };
  const before = await readX();
  const layout = page.getByTestId("inspector-layout-editor");
  await layout.getByLabel("Inspector role column width").fill("82");
  await layout.getByLabel("Inspector signal name width").fill("196");
  await layout.getByTestId("apply-inspector-layout").click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  const after = await readX();
  for (const cycle of points) {
    expect((after[cycle]["transaction bar"] - before[cycle]["transaction bar"])).toBeCloseTo(after[cycle].ruler - before[cycle].ruler, 0);
  }
});
