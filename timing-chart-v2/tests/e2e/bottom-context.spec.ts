import { expect, test, type Page } from "@playwright/test";

async function ready(page: Page) {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
}

test("Bottom Pin preserves the selected context independently from Follow Selection", async ({ page }) => {
  await ready(page);
  const host = page.getByTestId("cycle-surface");
  const bottom = page.getByTestId("bottom-editor");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  await expect(bottom).toContainText("REQUEST · binary");
  await bottom.getByTestId("follow-selection").uncheck();
  await bottom.getByTestId("bottom-pin").click();
  await expect(bottom.getByTestId("bottom-pin")).toHaveText("Unpin");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_ready']").click();
  await expect(page.getByTestId("selection-status")).toHaveText("READY");
  await expect(bottom).toContainText("REQUEST · binary");
  await bottom.getByTestId("bottom-pin").click();
  await expect(bottom.getByTestId("bottom-pin")).toHaveText("Pin");
  await expect(bottom).toContainText("READY · binary");
});

test("Advanced JSON applies a selected object through one document command", async ({ page }) => {
  await ready(page);
  const host = page.getByTestId("cycle-surface");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  const bottom = page.getByTestId("bottom-editor");
  await bottom.getByRole("button", { name: "JSON", exact: true }).click();
  const json = page.getByTestId("json-panel");
  await json.getByTestId("json-advanced-toggle").click();
  await json.getByLabel("JSON scope").selectOption("selected");
  const editor = json.getByLabel("Advanced JSON");
  const selected = JSON.parse(await editor.inputValue()) as Record<string, unknown>;
  selected.name = "REQUEST_JSON";
  (selected.display as Record<string, unknown>).name = "REQUEST_JSON";
  await editor.fill(JSON.stringify(selected, null, 2));
  await json.getByTestId("apply-advanced-json").click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await expect(host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request'] [data-role='frozen-signal-name']")).toHaveText("REQUEST_JSON");
  await expect(json).toContainText("REQUEST_JSON");
});

test("Whole Document JSON stays read-only until Advanced mode and validates before Apply", async ({ page }) => {
  await ready(page);
  const bottom = page.getByTestId("bottom-editor");
  await bottom.getByRole("button", { name: "JSON", exact: true }).click();
  const json = page.getByTestId("json-panel");
  await expect(json.locator("pre")).toBeVisible();
  await expect(json.getByLabel("Advanced JSON")).toHaveCount(0);
  await json.getByTestId("json-advanced-toggle").click();
  await json.getByLabel("JSON scope").selectOption("document");
  await json.getByRole("button", { name: "Validate", exact: true }).click();
  await expect(json).toContainText("Valid");
});

test("Advanced JSON applies a selected Group through one document command", async ({ page }) => {
  await ready(page);
  const host = page.getByTestId("cycle-surface");
  await host.locator("[data-role='left-group-header'][data-group-id='grp_cycle_control'] [data-role='tree-branch'][data-group-id='grp_cycle_control']").first().click();
  const bottom = page.getByTestId("bottom-editor");
  await bottom.getByRole("button", { name: "JSON", exact: true }).click();
  const json = page.getByTestId("json-panel");
  await json.getByTestId("json-advanced-toggle").click();
  await json.getByLabel("JSON scope").selectOption("selected");
  const editor = json.getByLabel("Advanced JSON");
  const selected = JSON.parse(await editor.inputValue()) as Record<string, unknown>;
  selected.name = "CONTROL_JSON";
  await editor.fill(JSON.stringify(selected, null, 2));
  await json.getByTestId("apply-advanced-json").click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await expect(host.locator("[data-role='left-group-header'][data-group-id='grp_cycle_control']")).toContainText("CONTROL_JSON");
});
