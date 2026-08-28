import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });

test("Left Tree critical icons are inline SVG and identical across production fixtures", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });
  const pages = [await context.newPage(), await context.newPage()];
  await Promise.all(pages.map(async (page, index) => {
    await page.goto(index === 0 ? "/" : "/?visual-reference");
    await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  }));
  const readContract = (page: import("@playwright/test").Page) => page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>("[data-role='left-row'] [data-role='tree-visibility'] svg, [data-role='left-row'] [data-role='tree-more'] svg, [data-role='left-group-header'] [data-role='tree-collapse'] svg")).map((svg) => ({
    role: svg.parentElement?.getAttribute("data-role"),
    viewBox: svg.getAttribute("viewBox"),
    useCount: svg.querySelectorAll("use").length,
    textCount: svg.querySelectorAll("text").length,
    geometryCount: svg.querySelectorAll("path, circle, rect, line, polyline, polygon").length,
  })));
  const contracts = await Promise.all(pages.map(readContract));
  for (const contract of contracts) {
    expect(contract.length).toBeGreaterThan(0);
    expect(contract.every((icon) => icon.viewBox === "0 0 24 24" && icon.useCount === 0 && icon.textCount === 0 && icon.geometryCount > 0)).toBe(true);
  }
  const signature = (contract: typeof contracts[number]) => [...new Set(contract.map((icon) => JSON.stringify(icon)))].sort();
  expect(signature(contracts[0]!)).toEqual(signature(contracts[1]!));
  await context.close();
});
