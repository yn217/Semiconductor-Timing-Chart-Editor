import { expect, test } from "@playwright/test";

test("creating a Transaction in Cycle mode keeps Bottom content within Cycle tabs", async ({ page }) => {
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  const bottomTabs = page.getByTestId("bottom-tabs");
  await expect(bottomTabs.getByRole("tab", { name: "Signal" })).toHaveAttribute("aria-selected", "true");
  await expect(bottomTabs.getByRole("tab", { name: "Transaction" })).toHaveCount(0);

  const revision = await host.getAttribute("data-canonical-revision");
  const history = await page.getByTestId("history-status").textContent();
  const dirty = await page.getByTestId("dirty-status").textContent();
  await page.getByTestId("ribbon").getByRole("button", { name: "Create Transaction" }).click();

  await expect(host).toHaveAttribute("data-canonical-revision", String(Number(revision) + 1));
  await expect(bottomTabs.getByRole("tab", { name: "Signal" })).toHaveAttribute("aria-selected", "true");
  await expect(bottomTabs.getByRole("tab", { name: "Transaction" })).toHaveCount(0);
  await expect(page.getByRole("tabpanel")).toHaveAttribute("aria-labelledby", "bottom-tab-signal");
  await expect(page.getByTestId("transaction-editor")).toHaveCount(0);
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await expect(page.getByTestId("dirty-status")).toHaveText("Modified");
  expect(revision).toBe("0");
  expect(history).toBe("History 0 / Redo 0");
  expect(dirty).toBe("Clean");
});
