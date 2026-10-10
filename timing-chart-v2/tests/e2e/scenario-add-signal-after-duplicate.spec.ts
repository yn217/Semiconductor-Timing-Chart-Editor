import { expect, test } from "@playwright/test";

test("adding a Signal in a duplicated Scenario succeeds and Undo removes it", async ({ page }) => {
  page.on("dialog", (dialog) => void dialog.accept());
  await page.setViewportSize({ width: 1500, height: 900 });
  await page.goto("/?transaction-demo");
  await page.getByRole("button", { name: "Enable Scenarios" }).click();
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  await page.getByRole("button", { name: "Duplicate", exact: true }).first().click();
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");

  await page.getByRole("button", { name: "Add signal or group" }).first().click();
  await page.getByRole("menuitem", { name: "Signal", exact: true }).click();

  await expect(page.getByTestId("history-status")).toHaveText("History 2 / Redo 0");
  await expect(page.locator("body")).not.toContainText("already owned");
  await expect(page.getByText(/Problems: [1-9]/)).toHaveCount(0);
  await page.keyboard.press("Control+z");
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 1");
});

test("a Scenario cannot be renamed to a name another Scenario already has", async ({ page }) => {
  await page.setViewportSize({ width: 1500, height: 900 });
  await page.goto("/?transaction-demo");
  await page.getByRole("button", { name: "Enable Scenarios" }).click();
  await page.getByTestId("scenario-duplicate").click();
  const rename = page.getByTestId("scenario-rename");
  await page.getByTestId("scenario-name").fill("Scenario 1");
  await expect(rename).toBeDisabled();
  await page.getByTestId("scenario-name").fill("Scenario 2");
  await expect(rename).toBeEnabled();
});

test("each Scenario can add a transition to the same Signal", async ({ page }) => {
  page.on("dialog", (dialog) => void dialog.accept());
  await page.setViewportSize({ width: 1500, height: 900 });
  await page.goto("/?transaction-demo");
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  await page.getByRole("button", { name: "Enable Scenarios" }).click();
  const addTransition = async (start: string, value: string) => {
    await page.locator("[data-role='frozen-row'][data-row-id='sig_cycle_data']").click({ position: { x: 30, y: 10 } });
    await page.getByLabel("New event start").fill(start);
    await page.getByLabel("New event value").fill(value);
    await page.getByTestId("add-signal-event").click();
  };
  await addTransition("70", "11");
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await page.getByTestId("scenario-duplicate").click();
  await expect(page.getByTestId("history-status")).toHaveText("History 2 / Redo 0");
  await addTransition("80", "22");
  await expect(page.getByTestId("history-status")).toHaveText("History 3 / Redo 0");
  await expect(page.locator("body")).not.toContainText("already owned");
  await expect(page.getByTestId("problems-status")).toHaveText("Problems: 0");
});
