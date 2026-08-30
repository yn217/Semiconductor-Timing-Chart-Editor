import { expect, test } from "@playwright/test";

test("Advanced JSON reports deterministic line and column for malformed input", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
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
