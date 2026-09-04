import { expect, test } from "@playwright/test";

test("AI proposal uses preview, deterministic validation, atomic apply, and exact persistence", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();

  await page.getByLabel("Ribbon tabs").getByRole("button", { name: "AI", exact: true }).click();
  const ai = page.getByTestId("ai-operation-panel");
  await ai.getByLabel("AI semantic query").fill("rename selected signal to AI_REQUEST");
  await ai.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(ai.getByTestId("ai-preview")).toContainText("Rename REQUEST to AI_REQUEST");
  await expect(host).toHaveAttribute("data-canonical-revision", "0");
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");

  await ai.getByTestId("ai-validate").click();
  await expect(ai.getByTestId("ai-status")).toHaveText("Validated · deterministic local checks passed");
  await ai.getByTestId("ai-apply").click();
  await expect(ai.getByTestId("ai-status")).toHaveText("Applied · one atomic SemanticCommand transaction");
  await expect(host).toHaveAttribute("data-canonical-revision", "1");
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await expect(host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']")).toContainText("AI_REQUEST");

  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']")).toContainText("REQUEST");
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']")).toContainText("AI_REQUEST");

  const downloadPromise = page.waitForEvent("download");
  await page.getByLabel("Ribbon tabs").getByRole("button", { name: "File", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Save", exact: true }).click();
  const savedPath = await (await downloadPromise).path();
  expect(savedPath).toBeTruthy();
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(savedPath!);
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']")).toContainText("AI_REQUEST");
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
});

test("AI proposal rejects a stale revision after an intervening semantic edit", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  await page.getByLabel("Ribbon tabs").getByRole("button", { name: "AI", exact: true }).click();
  const ai = page.getByTestId("ai-operation-panel");
  await ai.getByLabel("AI semantic query").fill("rename selected signal to STALE_PROPOSAL");
  await ai.getByRole("button", { name: "Preview", exact: true }).click();

  const inspector = page.getByTestId("inspector");
  await inspector.getByLabel("Inspector signal name").fill("INTERVENING_EDIT");
  await inspector.getByTestId("apply-inspector-signal").click();
  await expect(host).toHaveAttribute("data-canonical-revision", "1");
  await ai.getByTestId("ai-validate").click();
  await expect(ai.getByTestId("ai-status")).toHaveText(/Conflict · preview revision 0, current revision 1/);
  await expect(ai.getByTestId("ai-preview")).toHaveCount(0);
  await expect(host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']")).toContainText("INTERVENING_EDIT");
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
});
