import { expect, test } from "@playwright/test";
import { resolve } from "node:path";
import { writeFile } from "node:fs/promises";

test("transaction-view", async ({ page }) => {
  const recordingStart = Date.now();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto("/");
  // The deterministic production startup showcase is authored by the application, not injected by the capture.
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true");
  // Include a settled frame, but omit startup/loading from the public demo. Never trim failed UI actions.
  await page.waitForTimeout(500);
  const trimStartSeconds = (Date.now() - recordingStart) / 1000;
  await page.waitForTimeout(2500); // Deliberate reading pause, not a readiness workaround.
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  await expect(page.getByTestId("transaction-lanes")).toBeVisible();
  await expect(page.getByTestId("transaction-lanes").locator("[data-transaction-id]").filter({ hasText: "Address" }).first()).toBeVisible();
  await page.waitForTimeout(3000);
  await page.locator(".view-mode").getByRole("button", { name: "Combined", exact: true }).click();
  await expect(page.locator(".split-transaction-pane")).toBeVisible();
  await expect(page.locator(".split-signal-content")).toBeVisible();
  await page.waitForTimeout(3000);
  expect(errors).toEqual([]);
  const video = page.video();
  expect(video).not.toBeNull();
  await page.close();
  await video!.saveAs(resolve("artifacts/readme-demo-capture/transaction-view.webm"));
  await writeFile(resolve("artifacts/readme-demo-capture/transaction-view.json"), JSON.stringify({
    trimStartSeconds, viewport: { width: 1440, height: 900 }, dpr: 1,
    build: "production-preview", scenes: ["Cycle", "Transaction", "Combined"], errors,
  }, null, 2));
});
