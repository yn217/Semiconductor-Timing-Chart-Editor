import { expect, test } from "@playwright/test";

// #766: the cycles-per-TC relationship reads "1 TC = 1 cycle" / "1 TC = 10 cycles" everywhere it appears (grammatical number, no stale "CYCLES").
test("Time Scale readout uses singular/plural correctly", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/?transaction-demo");
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  const readout = page.locator(".transaction-time-scale-readout");
  const scale = page.getByTestId("transaction-tc-scale");
  for (const [value, word] of [["1", "cycle"], ["10", "cycles"], ["50", "cycles"]] as const) {
    await scale.selectOption(value);
    await expect(scale).toHaveValue(value);
    const text = await readout.evaluate((el) => Array.from(el.childNodes).map((node) => (node instanceof HTMLSelectElement ? node.value : node.textContent ?? "")).join("").split(" ").filter(Boolean).join(" ").trim());
    expect(text, text).toContain(`1 TC = ${value} ${word})`);
    expect(text).not.toContain("1 cycles");
  }
});
