import { expect, test, type Page } from "@playwright/test";

// #750: the Transaction ruler is labelled in TC and follows the cycles-per-TC scale; canonical cycles never move.
const labels = (page: Page) => page.evaluate(() => [...document.querySelectorAll<HTMLElement>("[data-testid='cycle-ruler'] .cycle-tick")]
  .filter((tick) => (tick.textContent ?? "").trim() !== "").slice(0, 5).map((tick) => `${tick.dataset.sourceCycle}:${(tick.textContent ?? "").trim()}`));

test("Transaction ruler labels follow cycles-per-TC (10 -> 5 -> 1 -> Undo) and Cycle mode stays in cycles", async ({ page }) => {
  await page.goto("/?transaction-demo");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  const select = page.getByTestId("transaction-tc-scale");
  await expect(select).toHaveValue("10");
  await expect.poll(() => labels(page)).toEqual(["0:0", "10:1", "20:2", "30:3", "40:4"]);

  await select.selectOption("5");
  await expect.poll(() => labels(page), { message: "5 cycles/TC" }).toEqual(["0:0", "5:1", "10:2", "15:3", "20:4"]);
  await select.selectOption("1");
  await expect.poll(() => labels(page), { message: "1 cycle/TC" }).toEqual(["0:0", "1:1", "2:2", "3:3", "4:4"]);

  await page.getByTestId("ribbon").getByRole("button", { name: "Undo", exact: true }).click();
  await expect(select).toHaveValue("5");
  await expect.poll(() => labels(page), { message: "after Undo" }).toEqual(["0:0", "5:1", "10:2", "15:3", "20:4"]);

  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  await expect.poll(() => labels(page), { message: "Cycle keeps system cycles" }).toEqual(["0:0", "1:1", "2:2", "3:3", "4:4"]);
});
