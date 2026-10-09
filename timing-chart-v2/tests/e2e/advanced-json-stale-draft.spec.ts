import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { startInCycleSample } from "./cycle-startup.js";

startInCycleSample(test);

async function openJson(page: Page, scope: "document" | "selected") {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.getByTestId("cycle-surface").locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  const json = page.getByTestId("bottom-editor");
  await json.getByRole("tab", { name: "JSON", exact: true }).click();
  const panel = page.getByTestId("json-panel");
  await panel.getByLabel("JSON scope").selectOption(scope);
  await panel.getByTestId("json-advanced-toggle").click();
  return { panel, editor: panel.getByLabel("Advanced JSON") };
}

async function renameSelectedSignal(page: Page, name: string) {
  const ribbon = page.getByTestId("ribbon");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Home", exact: true }).click();
  await ribbon.getByRole("button", { name: "More", exact: true }).click();
  await page.getByRole("menu", { name: "More Home Commands" }).getByRole("menuitem", { name: "Rename", exact: true }).click();
  const dialog = page.getByTestId("rename-dialog");
  await dialog.getByRole("textbox").fill(name);
  await dialog.getByRole("button", { name: "Apply", exact: true }).click();
}

test("Whole Document Advanced JSON refuses to overwrite a newer canonical revision", async ({ page }) => {
  const { panel, editor } = await openJson(page, "document");
  const source = JSON.parse(await editor.inputValue()) as Record<string, unknown>;
  const stale = structuredClone(source);
  (stale as { document: { title: string } }).document.title = "Stale JSON title";
  await editor.fill(JSON.stringify(stale));

  await renameSelectedSignal(page, "REQUEST_RENAMED_AFTER_JSON_DRAFT");
  const baseline = await Promise.all(["revision-status", "history-status", "dirty-status"].map((id) => page.getByTestId(id).textContent()));
  await panel.getByTestId("apply-advanced-json").click();

  await expect(panel.locator("output")).toContainText("Stale draft");
  await expect(panel.getByTestId("reload-latest-advanced-json")).toBeVisible();
  await expect.poll(() => Promise.all(["revision-status", "history-status", "dirty-status"].map((id) => page.getByTestId(id).textContent()))).toEqual(baseline);
  await panel.getByTestId("reload-latest-advanced-json").click();
  const latest = JSON.parse(await editor.inputValue()) as { document: { title: string }; signals: Array<{ id: string; name: string; display: { name: string } }> };
  expect(latest.document.title).not.toBe("Stale JSON title");
  expect(latest.signals.find((signal) => signal.id === "sig_cycle_request")?.display.name).toBe("REQUEST_RENAMED_AFTER_JSON_DRAFT");
});

test("Selected Object draft follows its captured stable ID and rejects same-object edits", async ({ page }) => {
  const { panel, editor } = await openJson(page, "selected");
  const stale = JSON.parse(await editor.inputValue()) as { id: string; display: { name: string } };
  stale.display.name = "Stale selected JSON";
  await editor.fill(JSON.stringify(stale));
  await renameSelectedSignal(page, "REQUEST_RENAMED_AFTER_SELECTED_DRAFT");
  const baseline = await Promise.all(["revision-status", "history-status", "dirty-status"].map((id) => page.getByTestId(id).textContent()));

  await panel.getByTestId("apply-advanced-json").click();
  await expect(panel.locator("output")).toContainText("Stale draft");
  await expect.poll(() => Promise.all(["revision-status", "history-status", "dirty-status"].map((id) => page.getByTestId(id).textContent()))).toEqual(baseline);
  await panel.getByTestId("cancel-advanced-json").click();
  const latest = JSON.parse(await editor.inputValue()) as { id: string; display: { name: string } };
  expect(latest.id).toBe("sig_cycle_request");
  expect(latest.display.name).toBe("REQUEST_RENAMED_AFTER_SELECTED_DRAFT");
});

test("Selected Object draft remains bound to its stable ID across unrelated selection changes", async ({ page }) => {
  const { panel, editor } = await openJson(page, "selected");
  const source = JSON.parse(await editor.inputValue()) as { id: string; display: { name: string } };
  source.display.name = "Edited captured Signal";
  await editor.fill(JSON.stringify(source));
  await page.getByTestId("cycle-surface").locator("[data-role='frozen-row'][data-row-id='sig_cycle_ready']").click();
  await expect(editor).toHaveValue(JSON.stringify(source));
  await panel.getByTestId("apply-advanced-json").click();
  await expect(panel.getByTestId("json-advanced-toggle")).toHaveAttribute("aria-pressed", "false");

  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  const download = page.waitForEvent("download");
  await page.getByTestId("ribbon").getByRole("button", { name: "Save", exact: true }).click();
  const saved = JSON.parse(await readFile((await (await download).path())!, "utf8")) as { signals: Array<{ id: string; display: { name: string } }> };
  expect(saved.signals.find((signal) => signal.id === "sig_cycle_request")?.display.name).toBe("Edited captured Signal");
});
