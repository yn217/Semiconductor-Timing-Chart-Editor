import { expect, test } from "@playwright/test";

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
  const readX = async () => Object.fromEntries(await Promise.all(points.map(async (cycle) => {
    const cycleBox = await ruler.locator(`[data-cycle='${cycle}']`).boundingBox();
    const transactionBox = await bar.boundingBox();
    const phase = cycle === 10 || cycle === 60 ? undefined : bar.locator("[data-phase-segment][title^='Read Data']");
    const phaseBox = phase === undefined ? undefined : await phase.boundingBox();
    return [cycle, { cycle: cycleBox?.x, transaction: cycle === 10 ? transactionBox?.x : cycle === 60 ? transactionBox?.x! + transactionBox.width : phaseBox?.x }];
  })));
  const before = await readX();
  for (const cycle of points) expect(Math.abs(before[cycle].cycle - before[cycle].transaction)).toBeLessThanOrEqual(0.5);
  const layout = page.getByTestId("inspector-layout-editor");
  await layout.getByLabel("Inspector role column width").fill("82");
  await layout.getByLabel("Inspector signal name width").fill("196");
  await layout.getByTestId("apply-inspector-layout").click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  const after = await readX();
  for (const cycle of points) {
    expect(Math.abs(after[cycle].cycle - after[cycle].transaction)).toBeLessThanOrEqual(0.5);
    expect((after[cycle].transaction - before[cycle].transaction)).toBeCloseTo(after[cycle].cycle - before[cycle].cycle, 0);
  }
});
