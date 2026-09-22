import { expect, test } from "@playwright/test";
import { startInCycleSample } from "./cycle-startup.js";

startInCycleSample(test);

test("does not select an annotation rejected by import", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Annotation", exact: true }).click();
  const tools = page.getByTestId("annotation-toolbar");
  await tools.getByRole("button", { name: "Add annotation" }).click();
  const list = page.getByTestId("annotation-list");
  const selectedBefore = await list.locator("[data-selected='true']").getAttribute("data-annotation-list-id");
  const revisionBefore = await host.getAttribute("data-canonical-revision");
  const historyBefore = await page.getByTestId("history-status").textContent();
  await page.getByLabel("Import annotations").setInputFiles({
    name: "invalid-annotations.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify([{ id: "annotation_invalid", type: "text", label: "Invalid", visible: true, anchor: { signalId: "missing", cycle: 999, point: "cycle-start" } }])),
  });
  await expect(page.getByTestId("annotation-collection-status")).not.toHaveText(/Imported/);
  await expect(list.locator("[data-selected='true']")).toHaveAttribute("data-annotation-list-id", selectedBefore!);
  await expect(host).toHaveAttribute("data-canonical-revision", revisionBefore!);
  await expect(page.getByTestId("history-status")).toHaveText(historyBefore!);
});

test("does not select a transaction when creation is rejected", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
  await page.getByLabel("Workspace preset").selectOption("transaction");
  const editor = page.getByTestId("transaction-editor");
  const historyBefore = await page.getByTestId("history-status").textContent();
  await editor.getByLabel("New Transaction start").fill("5");
  await editor.getByLabel("New Transaction end").fill("2");
  await editor.getByRole("button", { name: "Create Transaction", exact: true }).click();
  await expect(page.getByTestId("history-status")).toHaveText(historyBefore!);
  await expect(editor).toContainText("Transaction Editor");
  await expect(host.locator("[data-transaction-id]")).toHaveCount(0);
});
