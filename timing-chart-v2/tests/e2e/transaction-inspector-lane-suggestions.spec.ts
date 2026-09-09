import { expect, test } from "@playwright/test";

// Transaction Mode GUI realignment: the reference shows Lane as a dropdown
// of existing lanes. laneId is a free-form identifier (a brand new lane
// name is a valid, common input), so this keeps the same text input and
// command while adding a <datalist> of every lane already in use as a
// suggestion -- picking an existing lane is now one click, and typing a
// new one still works exactly as before.
test("Transaction Inspector's Lane field suggests existing lanes via datalist, and still accepts a new lane name", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();

  const ribbon = page.getByTestId("ribbon");
  const create = ribbon.getByRole("button", { name: "Create Transaction", exact: true });
  await create.click();
  await create.click();

  const inspector = page.getByTestId("inspector");
  const laneInput = inspector.getByLabel("Transaction lane");
  await expect(laneInput).toHaveAttribute("list", "transaction-lane-options");

  const options = await inspector.locator("#transaction-lane-options option").evaluateAll((els) => els.map((el) => (el as HTMLOptionElement).value));
  expect(options).toContain("lane_0");

  // Still a free-text input: a brand new lane name is accepted.
  await laneInput.fill("lane_new");
  await expect(laneInput).toHaveValue("lane_new");
});
