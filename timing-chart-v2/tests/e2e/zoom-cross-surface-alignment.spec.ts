import { expect, test } from "@playwright/test";
import { startInCycleMode } from "./cycle-startup.js";

startInCycleMode(test);

test("Annotation and Transaction X positions stay exactly aligned with the Ruler at 50/100/150/200% zoom, with no double-scaling", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const ruler = page.getByTestId("cycle-ruler");
  const ribbon = page.getByTestId("ribbon");
  const tabs = page.locator(".ribbon-tabs");

  // Create a Transaction spanning [2, 6).
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click({ force: true });
  await tabs.getByRole("button", { name: "View", exact: true }).click();
  await page.getByLabel("Workspace preset").selectOption("transaction");
  const txEditor = page.getByTestId("transaction-editor");
  await txEditor.getByLabel("New Transaction name").fill("TX1");
  await txEditor.getByLabel("New Transaction start").fill("2");
  await txEditor.getByLabel("New Transaction end").fill("6");
  await txEditor.getByRole("button", { name: "Create Transaction" }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  const transactionId = await page.getByTestId("transaction-lanes").locator("[data-transaction-id]").filter({ hasText: "TX1" }).getAttribute("data-transaction-id");
  expect(transactionId).toBeTruthy();
  await page.locator(".view-mode").getByRole("button", { name: "Combined", exact: true }).click();

  // Create a verticalLine Annotation anchored at the currently selected Timeline range.
  await tabs.getByRole("button", { name: "Annotation", exact: true }).click();
  await page.getByLabel("Annotation type").selectOption("verticalLine");
  await ribbon.getByRole("button", { name: "Add annotation" }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  const annotationId = await page.getByTestId("annotation-editor").getAttribute("data-annotation-id");
  expect(annotationId).toBeTruthy();
  const annotationBody = host.locator(`[data-role='annotation-owner'][data-annotation-id='${annotationId}'] [data-role='annotation-body']`);
  const transaction = page.getByTestId("transaction-lanes").locator(`[data-transaction-id='${transactionId}']`);

  const checkAt = async (label: string) => {
    await tabs.getByRole("button", { name: "View", exact: true }).click();
    await expect(page.getByTestId("zoom-status")).toHaveText(label);
    const cycle2 = (await ruler.locator("[data-cycle='2']").boundingBox())!;
    const annotationBox = (await annotationBody.boundingBox())!;
    const transactionBox = (await transaction.boundingBox())!;
    expect(Math.abs(cycle2.x - annotationBox.x)).toBeLessThan(1);
    expect(Math.abs(cycle2.x - transactionBox.x)).toBeLessThan(1);
  };

  await checkAt("100%");
  await ribbon.getByRole("button", { name: "Zoom out" }).click();
  await ribbon.getByRole("button", { name: "Zoom out" }).click();
  await checkAt("50%");
  await ribbon.getByRole("button", { name: "Zoom in" }).click();
  await ribbon.getByRole("button", { name: "Zoom in" }).click();
  await ribbon.getByRole("button", { name: "Zoom in" }).click();
  await ribbon.getByRole("button", { name: "Zoom in" }).click();
  await checkAt("150%");
  await ribbon.getByRole("button", { name: "Zoom in" }).click();
  await ribbon.getByRole("button", { name: "Zoom in" }).click();
  await checkAt("200%");
});
