import { expect, test } from "@playwright/test";

// #755: the renderer-independent analytic Local Geometry must equal the SVG extractor's for every anchor
// (cycle boundaries, transitions incl. thresholds, edges, value-start), tolerance 0.01 local units.
test("analytic Local Geometry equals the SVG extractor for every anchor across token/brick cases", async ({ page }) => {
  await page.goto("/?probe=geometry-equivalence");
  await expect(page.getByTestId("equivalence-done")).toHaveText("done", { timeout: 60_000 });
  const results = await page.evaluate(() => (window as unknown as { __geometryEquivalence: { name: string; compared: number; mismatches: string[]; error?: string }[] }).__geometryEquivalence);
  expect(results.length).toBeGreaterThan(8);
  for (const result of results) {
    expect.soft(result.error, `${result.name} must render`).toBeUndefined();
    expect.soft(result.compared, `${result.name} compared anchors`).toBeGreaterThan(0);
    expect.soft(result.mismatches.slice(0, 12), `${result.name}: analytic vs SVG mismatches; wave=${(result as unknown as { wave?: string }).wave?.slice(0, 200)}`).toEqual([]);
  }
});
