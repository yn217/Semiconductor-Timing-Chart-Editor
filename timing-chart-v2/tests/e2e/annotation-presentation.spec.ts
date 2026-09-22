import { expect, test } from "@playwright/test";
import { startInCycleMode } from "./cycle-startup.js";

startInCycleMode(test);

async function addAnnotation(page: import("@playwright/test").Page, type: string) {
  await page.getByLabel("Annotation type").selectOption(type);
  await page.getByRole("button", { name: "Add annotation" }).click();
  return page.getByTestId("cycle-surface").locator(`[data-role='annotation-owner'][data-annotation-type='${type}']`).last();
}

test("renders distinct product presentation for text, callout, marker, ranges, and brackets", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Annotation", exact: true }).click();

  const text = await addAnnotation(page, "text");
  const callout = await addAnnotation(page, "callout");
  const marker = await addAnnotation(page, "marker");
  const range = await addAnnotation(page, "range");
  const highlight = await addAnnotation(page, "highlight");
  const bracket = await addAnnotation(page, "bracket");

  await expect(text.locator("[data-role='annotation-body']")).toBeHidden();
  await expect(text.locator("[data-role='annotation-label']")).toHaveCSS("border-width", "0px");
  await expect(callout.locator("[data-role='annotation-label']")).toHaveCSS("border-radius", "8px");
  await expect(marker.locator("[data-role='annotation-body']")).toHaveCSS("border-left-style", "solid");
  await expect(marker.locator("[data-role='annotation-body']")).toHaveCSS("height", "28px");
  await expect(range.locator("[data-role='annotation-body']")).toHaveCSS("border-style", "solid");
  await expect(highlight.locator("[data-role='annotation-body']")).toHaveCSS("border-style", "dashed");
  await expect(highlight.locator("[data-role='annotation-body']")).toHaveCSS("border-radius", "0px");
  await expect(bracket.locator("[data-role='annotation-bracket-caps']")).toHaveCount(1);
  await expect(page.getByTestId("history-status")).toHaveText("History 6 / Redo 0");
});
