import { expect, test } from "@playwright/test";
import { startInCycleSample } from "./cycle-startup.js";

startInCycleSample(test);

for (const input of [
  { name: "syntax.tcd", text: "{ broken", code: "JSON_SYNTAX" },
  { name: "invalid.tcd", text: "{}", code: "FORMAT_VERSION" },
]) test(`failed Open ${input.name} is visible without a selected Signal`, async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const revision = await page.getByTestId("revision-status").textContent();
  await expect(page.getByTestId("selection-status")).toHaveText("None");
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: input.name, mimeType: "application/json", buffer: Buffer.from(input.text) });
  const feedback = page.getByTestId("operation-feedback");
  await expect(feedback.getByRole("alert")).not.toBeEmpty();
  await feedback.getByRole("button", { name: "Open Problems" }).click();
  await expect(page.getByTestId("problems-panel")).toContainText(input.code);
  await expect(page.getByTestId("revision-status")).toHaveText(revision!);
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
  await expect(page.getByTestId("dirty-status")).toHaveText("Clean");
});

test("file access failure retains its reason, filename and actionable diagnostic", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const revision = await page.getByTestId("revision-status").textContent();
  await page.evaluate(() => { File.prototype.arrayBuffer = async () => { throw new DOMException("Permission denied", "NotReadableError"); }; });
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "unreadable.tcd", mimeType: "application/json", buffer: Buffer.from("{}") });
  const feedback = page.getByTestId("operation-feedback");
  await expect(feedback.getByRole("alert")).toContainText("Could not read unreadable.tcd: Permission denied");
  await feedback.getByRole("button", { name: "Open Problems" }).click();
  await expect(page.getByTestId("problems-panel")).toContainText("OPEN_READ_FAILED");
  await expect(page.getByTestId("problems-panel")).toContainText("Check file access permissions");
  await expect(page.getByTestId("revision-status")).toHaveText(revision!);
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
  await expect(page.getByTestId("dirty-status")).toHaveText("Clean");
});

test("Save failure stays dirty; successful retry publishes filename only after download and New clears it", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  const name = page.getByTestId("inspector").getByLabel("Inspector signal name", { exact: true });
  await name.fill("UNSAVED_REQUEST");
  await name.press("Enter");
  const revision = await page.getByTestId("revision-status").textContent();
  await page.evaluate(() => { const original = URL.createObjectURL; URL.createObjectURL = (blob) => { URL.createObjectURL = original; throw new Error("download blocked"); }; });
  const save = page.getByTestId("ribbon").getByRole("button", { name: "Save", exact: true });
  await save.click();
  const feedback = page.getByTestId("operation-feedback");
  await expect(feedback.getByRole("alert")).toContainText("Save document failed: download blocked");
  await expect(feedback.getByRole("status")).toHaveCount(0);
  await expect(page.getByTestId("dirty-status")).toHaveText("Modified");
  await expect(page.getByTestId("revision-status")).toHaveText(revision!);
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  const pending = page.waitForEvent("download");
  await save.click();
  const download = await pending;
  await expect(feedback.getByRole("status")).toHaveText(`Saved: ${download.suggestedFilename()}`);
  await expect(feedback.getByRole("alert")).toHaveCount(0);
  await expect(page.getByTestId("dirty-status")).toHaveText("Clean");
  await expect(page.getByTestId("revision-status")).toHaveText(revision!);
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await page.getByTestId("ribbon").getByRole("button", { name: "New", exact: true }).click();
  await expect(feedback).toHaveCount(0);
});
