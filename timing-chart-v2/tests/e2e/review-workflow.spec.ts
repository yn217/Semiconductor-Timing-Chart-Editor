import { expect, test } from "@playwright/test";

test("Review filters and navigates the shared Problems diagnostics without mutation", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");

  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  const editor = page.getByTestId("signal-editor");
  const row = editor.locator("form.event-row").nth(1);
  await row.getByLabel("Start 3").fill("0");
  await row.getByRole("button", { name: "Save" }).click();
  await expect(page.getByTestId("problems-status")).toHaveText("Problems: 1");

  const before = {
    revision: await host.getAttribute("data-canonical-revision"),
    history: await page.getByTestId("history-status").textContent(),
    dirty: await page.getByTestId("dirty-status").textContent(),
  };
  await page.getByRole("button", { name: "Review", exact: true }).click();
  const review = page.getByTestId("review-workflow");
  await expect(review).toBeVisible();
  await expect(page.getByTestId("review-summary")).toHaveText("1 of 1 · Errors 1 · Warnings 0 · Info 0");

  await page.getByTestId("review-severity-filter").selectOption("warning");
  await expect(page.getByTestId("review-summary")).toHaveText("0 of 1 · Errors 1 · Warnings 0 · Info 0");
  await expect(page.getByTestId("review-next")).toBeDisabled();
  await page.getByTestId("review-severity-filter").selectOption("error");
  await expect(page.getByTestId("review-next")).toBeEnabled();
  await expect(page.getByTestId("review-current-target")).toHaveText("$.start");
  await page.getByTestId("review-next").click();
  await expect(page.getByTestId("review-current-target")).toHaveText("$.start");
  await page.getByTestId("review-previous").click();
  await expect(page.getByTestId("review-current-target")).toHaveText("$.start");

  await expect(host).toHaveAttribute("data-canonical-revision", before.revision!);
  await expect(page.getByTestId("history-status")).toHaveText(before.history!);
  await expect(page.getByTestId("dirty-status")).toHaveText(before.dirty!);
});
