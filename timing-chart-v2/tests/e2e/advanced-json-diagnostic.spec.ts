import { expect, test } from "@playwright/test";

test("Advanced JSON reports deterministic line and column for malformed input", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await page.getByRole("button", { name: "Cycle", exact: true }).click();
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  const bottom = page.getByTestId("bottom-editor");
  await bottom.getByRole("tab", { name: "JSON", exact: true }).click();
  const json = page.getByTestId("json-panel");
  await json.getByTestId("json-advanced-toggle").click();
  const editor = json.getByLabel("Advanced JSON");
  await editor.fill("{\r\n  \"formatVersion\": 2,\r\n  \"title\": \"壊れた\",\r\n}");
  await json.getByRole("button", { name: "Format", exact: true }).click();
  await expect(json).toContainText("line 4, column 1");
  await expect(json).toContainText("Trailing commas are not valid in JSON");
  await bottom.getByRole("tab", { name: "Problems", exact: true }).click();
  await expect(page.getByTestId("problems-panel")).toContainText("JSON_SYNTAX");
  await expect(page.getByTestId("problems-panel")).toContainText("Parse Advanced JSON");
  await expect(page.getByTestId("problems-panel")).toContainText("parse");
  await expect(page.getByTestId("revision-status")).toHaveText("Canonical revision 0");
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
});

test("Advanced JSON preserves every semantic validation problem", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const bottom = page.getByTestId("bottom-editor");
  await bottom.getByRole("tab", { name: "JSON", exact: true }).click();
  const json = page.getByTestId("json-panel");
  const source = JSON.parse(await json.locator("pre").textContent() ?? "{}");
  await json.getByTestId("json-advanced-toggle").click();
  const valueSignalId = source.signals.find((signal: Record<string, unknown>) => Array.isArray(signal.values))?.id;
  const invalidSignals = source.signals.map((signal: Record<string, unknown>) => signal.id === valueSignalId
    ? { ...signal, values: [{ ...(signal.values as Array<Record<string, unknown>>)[0], start: -1 }] }
    : signal);
  await json.getByLabel("Advanced JSON").fill(JSON.stringify({
    ...source,
    timeline: { ...source.timeline, end: 0 },
    signals: invalidSignals,
  }, null, 2));
  await json.getByRole("button", { name: "Validate", exact: true }).click();
  await expect(json).toContainText("Invalid:");
  await bottom.getByRole("tab", { name: "Problems", exact: true }).click();
  const problems = page.getByTestId("problems-panel");
  await expect(problems.locator("tbody tr")).toHaveCount(2);
  await expect(problems).toContainText("Validate Advanced JSON");
  await expect(page.getByTestId("revision-status")).toHaveText("Canonical revision 0");
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
});

test("Advanced JSON validates a selected object against the canonical document contract", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await page.getByRole("button", { name: "Cycle", exact: true }).click();
  await page.getByRole("button", { name: "Cycle", exact: true }).click();
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  const bottom = page.getByTestId("bottom-editor");
  await bottom.getByRole("tab", { name: "JSON", exact: true }).click();
  const json = page.getByTestId("json-panel");
  await json.getByTestId("json-advanced-toggle").click();
  await json.getByLabel("JSON scope").selectOption("selected");
  const editor = json.getByLabel("Advanced JSON");
  const selected = JSON.parse(await editor.inputValue()) as Record<string, unknown>;
  (selected.values as Array<Record<string, unknown>>)[1] = { ...(selected.values as Array<Record<string, unknown>>)[1], start: -1 };
  await editor.fill(JSON.stringify(selected, null, 2));
  await json.getByRole("button", { name: "Validate", exact: true }).click();
  await expect(json).toContainText("Invalid: SCHEMA_MINIMUM");
  await bottom.getByRole("tab", { name: "Problems", exact: true }).click();
  await expect(page.getByTestId("problems-panel")).toContainText("SCHEMA_MINIMUM");
  await expect(page.getByTestId("revision-status")).toHaveText("Canonical revision 0");
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
});

test("Advanced JSON keeps the draft open when Apply rejects a selected-object ID change", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await page.getByRole("button", { name: "Cycle", exact: true }).click();
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  const bottom = page.getByTestId("bottom-editor");
  await bottom.getByRole("tab", { name: "JSON", exact: true }).click();
  const json = page.getByTestId("json-panel");
  await json.getByTestId("json-advanced-toggle").click();
  await json.getByLabel("JSON scope").selectOption("selected");
  const editor = json.getByLabel("Advanced JSON");
  const selected = JSON.parse(await editor.inputValue()) as Record<string, unknown>;
  selected.id = "sig_replaced";
  await editor.fill(JSON.stringify(selected, null, 2));
  await json.getByTestId("apply-advanced-json").click();
  await expect(json.getByTestId("json-advanced-toggle")).toHaveAttribute("aria-pressed", "true");
  await expect(json).toContainText("Selected object ID cannot change");
  await expect(page.getByTestId("revision-status")).toHaveText("Canonical revision 0");
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
});

test("Advanced JSON reports clipboard rejection without mutating the document", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const bottom = page.getByTestId("bottom-editor");
  await bottom.getByRole("tab", { name: "JSON", exact: true }).click();
  const json = page.getByTestId("json-panel");
  const before = {
    revision: await page.getByTestId("revision-status").textContent(),
    history: await page.getByTestId("history-status").textContent(),
    dirty: await page.getByTestId("dirty-status").textContent(),
  };
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async () => { throw new Error("permission denied"); } },
    });
  });
  await json.getByRole("button", { name: "Copy", exact: true }).click();
  await expect(json).toContainText("Copy failed: permission denied");
  await expect(page.getByTestId("revision-status")).toHaveText(before.revision!);
  await expect(page.getByTestId("history-status")).toHaveText(before.history!);
  await expect(page.getByTestId("dirty-status")).toHaveText(before.dirty!);
  await bottom.getByRole("tab", { name: "Problems", exact: true }).click();
  const problems = page.getByTestId("problems-panel");
  await expect(problems).toContainText("CLIPBOARD_FAILED");
  await expect(problems).toContainText("Copy JSON");
  await expect(problems).toContainText("Allow clipboard access or retry the copy operation");
});
