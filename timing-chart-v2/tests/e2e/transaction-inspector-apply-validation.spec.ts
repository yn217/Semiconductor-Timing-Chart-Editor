import { expect, test } from "@playwright/test";

// #454 Visual Quality Closure ("unclear draft state"): a rejected Transaction
// Inspector Apply (e.g. End beyond the document's own cycle count) used to
// fail completely silently -- the draft stayed on-screen looking applied,
// with no error message and no History change, indistinguishable from a
// successful Apply except that nothing actually happened. Now surfaced via
// the same shared status output the Phases validation already used.
test("a rejected Transaction Apply surfaces its reason instead of silently no-opping", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Create Transaction", exact: true }).click();
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");

  const inspector = page.getByTestId("inspector");
  const end = inspector.getByLabel("Transaction end");
  const cycleCount = Number(await end.getAttribute("max"));
  await end.fill(String(cycleCount + 1));
  await inspector.getByTestId("apply-inspector-transaction").click();
  await expect(inspector.getByRole("status")).toHaveText(/half-open|range|cycle/i);
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");

  await inspector.getByLabel("Transaction end").fill("20");
  await inspector.getByTestId("apply-inspector-transaction").click();
  await expect(page.getByTestId("history-status")).toHaveText("History 2 / Redo 0");
});
