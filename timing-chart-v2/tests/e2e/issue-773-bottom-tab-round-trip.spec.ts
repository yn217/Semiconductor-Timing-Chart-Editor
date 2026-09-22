import { expect, test } from "@playwright/test";

// #773: entering Combined is a temporary layout transition and must not erase the last standalone-mode Bottom tab.
test("Cycle and Transaction restore their last Bottom tab after round-tripping through Combined", async ({ page }) => {
  await page.goto("/?transaction-demo");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  const history = await page.getByTestId("history-status").innerText();
  const revision = await page.getByTestId("cycle-surface").getAttribute("data-canonical-revision");
  const tabs = page.locator(".bottom-tabs");
  const modes = page.locator(".view-mode");

  await modes.getByRole("button", { name: "Cycle", exact: true }).click();
  await tabs.getByRole("tab", { name: "Annotation", exact: true }).click();
  await modes.getByRole("button", { name: "Combined", exact: true }).click();
  await modes.getByRole("button", { name: "Cycle", exact: true }).click();
  await expect(tabs.getByRole("tab", { selected: true })).toHaveText("Annotation");

  await modes.getByRole("button", { name: "Cycle", exact: true }).click();
  await tabs.getByRole("tab", { name: "Bookmarks", exact: true }).click();
  await modes.getByRole("button", { name: "Combined", exact: true }).click();
  await modes.getByRole("button", { name: "Cycle", exact: true }).click();
  await expect(tabs.getByRole("tab", { selected: true })).toHaveText("Bookmarks");

  await modes.getByRole("button", { name: "Transaction", exact: true }).click();
  await tabs.getByRole("tab", { name: "Phases", exact: true }).click();
  await modes.getByRole("button", { name: "Combined", exact: true }).click();
  await modes.getByRole("button", { name: "Transaction", exact: true }).click();
  await expect(tabs.getByRole("tab", { selected: true })).toHaveText("Phases");

  await modes.getByRole("button", { name: "Transaction", exact: true }).click();
  await tabs.getByRole("tab", { name: "Linked Signals", exact: true }).click();
  await modes.getByRole("button", { name: "Combined", exact: true }).click();
  await modes.getByRole("button", { name: "Transaction", exact: true }).click();
  await expect(tabs.getByRole("tab", { selected: true })).toHaveText("Linked Signals");

  // Repeat round trips: memory holds across more than one hop.
  for (let round = 0; round < 3; round += 1) {
    await modes.getByRole("button", { name: "Combined", exact: true }).click();
    await modes.getByRole("button", { name: "Transaction", exact: true }).click();
    await expect(tabs.getByRole("tab", { selected: true })).toHaveText("Linked Signals");
  }

  // Cycle's memory (Bookmarks) is independent of Transaction's and was not overwritten by the Transaction round trips.
  await modes.getByRole("button", { name: "Cycle", exact: true }).click();
  await expect(tabs.getByRole("tab", { selected: true })).toHaveText("Bookmarks");

  // Mode/tab switching is view-only.
  await expect(page.getByTestId("history-status")).toHaveText(history);
  expect(await page.getByTestId("cycle-surface").getAttribute("data-canonical-revision")).toBe(revision);
});
