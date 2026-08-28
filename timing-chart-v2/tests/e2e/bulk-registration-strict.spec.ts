import { expect, test } from "@playwright/test";

async function ready(page: import("@playwright/test").Page) {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
}

test("Bulk Registration requires a strict preview and infers bus width", async ({ page }) => {
  await ready(page);
  const host = page.getByTestId("cycle-surface");
  await page.getByTestId("bulk-register-open").click();
  const dialog = page.getByRole("dialog", { name: "Bulk Signal Registration" });
  await dialog.getByLabel("Bulk signal definitions").fill("dut.core.status binary\ndut.core.payload[31:0] bus");
  await expect(dialog.getByTestId("bulk-register-apply")).toBeDisabled();
  await dialog.getByTestId("bulk-register-preview-button").click();
  await expect(dialog.getByTestId("bulk-register-preview")).toContainText("width 32");
  await expect(dialog.getByTestId("bulk-register-apply")).toBeEnabled();
  await dialog.getByTestId("bulk-register-apply").click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await page.getByTestId("cycle-viewport").evaluate((element) => { element.scrollTop = element.scrollHeight; });
  await expect(host.locator("[data-role='left-tree-rows'] [data-full-path]").filter({ hasText: "payload[31:0]" })).toHaveCount(1);
});

test("Bulk Registration preview rejects unknown types and duplicate paths without mutation", async ({ page }) => {
  await ready(page);
  const host = page.getByTestId("cycle-surface");
  await page.getByTestId("bulk-register-open").click();
  const dialog = page.getByRole("dialog", { name: "Bulk Signal Registration" });
  const beforeRevision = await page.getByTestId("revision-status").textContent();
  const beforeHistory = await page.getByTestId("history-status").textContent();
  await dialog.getByLabel("Bulk signal definitions").fill("dut.bad.signal buss\ndut.new.signal binary\ndut.new.signal binary");
  await dialog.getByTestId("bulk-register-preview-button").click();
  await expect(dialog.getByTestId("bulk-register-preview")).toContainText("unsupported signal type 'buss'");
  await expect(dialog.getByTestId("bulk-register-preview")).toContainText("duplicate signal path 'dut.new.signal'");
  await expect(dialog.getByTestId("bulk-register-apply")).toBeDisabled();
  await expect(page.getByTestId("revision-status")).toHaveText(beforeRevision!);
  await expect(page.getByTestId("history-status")).toHaveText(beforeHistory!);
  await expect(host.locator("[data-full-path='dut.new.signal']")).toHaveCount(0);
});
