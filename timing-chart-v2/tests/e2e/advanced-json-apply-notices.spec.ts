import { expect, test, type Page } from "@playwright/test";

async function openWholeDocumentJson(page: Page) {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  await page.getByTestId("cycle-surface").locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  await page.getByTestId("bottom-editor").getByRole("tab", { name: "JSON", exact: true }).click();
  const json = page.getByTestId("json-panel");
  await expect(json.getByTestId("json-advanced-toggle")).toHaveAttribute("aria-pressed", "false");
  await json.getByLabel("JSON scope").selectOption("document");
  await json.getByTestId("json-advanced-toggle").click();
  await expect(json.getByLabel("JSON editing mode")).toHaveText("Advanced");
  return json;
}

test("Advanced JSON Apply surfaces the same migration notices that Open shows", async ({ page }) => {
  test.setTimeout(60_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const json = await openWholeDocumentJson(page);
  const editor = json.getByLabel("Advanced JSON");
  const source = JSON.parse(await editor.inputValue());
  // A legacy change point without an ID is repaired by normalizeDocument (the same
  // migration Open runs) and reported as an information notice, not silently dropped.
  const signal = source.signals.find((item: { values?: unknown[] }) => Array.isArray(item.values) && item.values.length > 0);
  expect(signal.values[0]).toHaveProperty("id");
  delete signal.values[0].id;
  // The deterministic repaired ID equals the original, so a real edit is needed for Apply to commit.
  source.document.title = "Apply notice edit";
  await editor.fill(JSON.stringify(source));
  await expect(json.getByTestId("json-unapplied-status")).toBeVisible();
  await json.getByTestId("apply-advanced-json").click();
  await expect(json.getByTestId("json-advanced-toggle")).toHaveAttribute("aria-pressed", "false");
  await expect(json.locator("output")).toContainText("MIGRATED_VALUE_CHANGE_IDS");
  await expect(json.locator("output")).toContainText("Applied");
  expect(errors).toEqual([]);
});

test("Advanced JSON Validate reports deeply nested malformed JSON without throwing", async ({ page }) => {
  test.setTimeout(60_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const json = await openWholeDocumentJson(page);
  // The syntax scanner is recursive; this input is deep enough to overflow it after JSON.parse rejects the trailing token.
  await json.getByLabel("Advanced JSON").fill(`${"[".repeat(20_000)}x`);
  // Wait for the draft-change effect to settle so it cannot overwrite the Validate status afterwards.
  await expect(json.getByTestId("json-unapplied-status")).toBeVisible();
  await json.getByRole("button", { name: "Validate", exact: true }).click();
  await expect(json.locator("output")).toContainText("Invalid JSON");
  expect(errors).toEqual([]);
});

test("Advanced JSON Apply rejects drafts above the Open byte limit", async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const json = await openWholeDocumentJson(page);
  const editor = json.getByLabel("Advanced JSON");
  const source = JSON.parse(await editor.inputValue());
  // Trailing whitespace keeps the JSON valid while pushing the draft past the 32 MiB Open limit.
  const padded = `${JSON.stringify(source)}${" ".repeat(33 * 1024 * 1024)}`;
  await editor.fill(padded);
  await expect(json.getByTestId("json-unapplied-status")).toBeVisible();
  await json.getByTestId("apply-advanced-json").click();
  await expect(json.locator("output")).toContainText("Apply rejected");
  await expect(json.getByTestId("json-advanced-toggle")).toHaveAttribute("aria-pressed", "true");
  expect(errors).toEqual([]);
});
