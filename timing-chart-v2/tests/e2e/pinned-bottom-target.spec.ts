import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { openBottomSettings } from "./bottom-settings";

async function ready(page: Page) {
  await page.goto("/");
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
}

async function savedDocument(page: Page) {
  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  const pending = page.waitForEvent("download");
  await page.getByTestId("ribbon").getByRole("button", { name: "Save", exact: true }).click();
  return JSON.parse(await readFile((await (await pending).path())!, "utf8"));
}

for (const kind of ["Signal", "Annotation", "Transaction"] as const) {
  test(`delete pinned selected ${kind} repairs selection and remains one History unit`, async ({ page }) => {
    await ready(page);
    const host = page.getByTestId("cycle-surface");
    const bottom = page.getByTestId("bottom-editor");
    let id: string;
    let entity: import("@playwright/test").Locator;
    if (kind === "Signal") {
      id = "sig_cycle_reset_n";
      entity = host.locator(`[data-role='frozen-row'][data-row-id='${id}']`);
      await entity.click();
    } else if (kind === "Annotation") {
      await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
      await page.locator(".ribbon-tabs").getByRole("button", { name: "Annotation", exact: true }).click();
      await page.getByTestId("annotation-toolbar").getByRole("button", { name: "Add annotation", exact: true }).click();
      const selected = page.getByTestId("annotation-list").locator("[data-annotation-list-id][data-selected='true']");
      await expect(selected).toHaveCount(1);
      id = (await selected.getAttribute("data-annotation-list-id"))!;
      entity = page.getByTestId("annotation-list").locator(`[data-annotation-list-id='${id}']`);
    } else {
      await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
      await bottom.getByTestId("bottom-transaction-add").click();
      const selected = page.getByTestId("transaction-left-tree").locator("[data-transaction-tree-id][data-selected='true']");
      await expect(selected).toHaveCount(1);
      id = (await selected.getAttribute("data-transaction-tree-id"))!;
      entity = page.getByTestId(`transaction-left-tree-row-${id}`);
    }
    const baseDepth = kind === "Signal" ? 0 : 1;
    await expect(page.getByTestId("history-status")).toHaveText(`History ${baseDepth} / Redo 0`);
    await openBottomSettings(page);
    await bottom.getByTestId("bottom-pin").click();
    await expect(bottom.getByTestId("bottom-pin")).toHaveAttribute("aria-pressed", "true");
    // Close the settings popover before clicking a covered editor action.
    await bottom.getByTestId("bottom-settings").click();
    if (kind === "Signal") await bottom.getByTestId("signal-delete").click();
    else if (kind === "Annotation") await bottom.getByTestId("annotation-collection").getByRole("button", { name: "Delete", exact: true }).click();
    else await bottom.getByTestId("bottom-transaction-delete").click();
    await expect(entity).toHaveCount(0);
    await expect(page.getByTestId("selection-status")).toHaveText("None");
    await expect(bottom.getByTestId("bottom-pin")).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByTestId("history-status")).toHaveText(`History ${baseDepth + 1} / Redo 0`);
    await page.locator(".ribbon-tabs").getByRole("button", { name: "Home", exact: true }).click();
    const ribbon = page.getByTestId("ribbon");
    await ribbon.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(entity).toHaveCount(1);
    await expect(page.getByTestId("history-status")).toHaveText(`History ${baseDepth} / Redo 1`);
    await ribbon.getByRole("button", { name: "Redo", exact: true }).click();
    await expect(entity).toHaveCount(0);
    await expect(page.getByTestId("selection-status")).toHaveText("None");
    await expect(page.getByTestId("history-status")).toHaveText(`History ${baseDepth + 1} / Redo 0`);
  });
}

test("pinned Clock Apply mutates its stable ID, not the selected Signal", async ({ page }) => {
  await ready(page);
  const before = await savedDocument(page);
  const clock = before.signals.find((signal: { id: string }) => signal.id === "sig_cycle_clock");
  const bottom = page.getByTestId("bottom-editor");
  const host = page.getByTestId("cycle-surface");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_clock']").click();
  await openBottomSettings(page);
  await bottom.getByTestId("bottom-pin").click();
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  const canonicalState = () => Promise.all(["revision-status", "history-status", "dirty-status"].map((id) => page.getByTestId(id).textContent()));
  const beforeDraft = await canonicalState();
  await bottom.getByLabel("Clock period", { exact: true }).fill(String(clock.generator.period + 4));
  await bottom.getByTestId("cancel-bottom-draft").click();
  await expect(bottom.getByLabel("Clock period", { exact: true })).toHaveValue(String(clock.generator.period));
  expect(await canonicalState()).toEqual(beforeDraft);
  await bottom.getByLabel("Clock period", { exact: true }).fill(String(clock.generator.period + 2));
  await bottom.getByTestId("apply-clock-generator").click();
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  const after = await savedDocument(page);
  expect(after.signals.find((signal: { id: string }) => signal.id === clock.id).generator.period).toBe(clock.generator.period + 2);
  expect(after.signals.filter((signal: { id: string }) => signal.id !== clock.id)).toEqual(before.signals.filter((signal: { id: string }) => signal.id !== clock.id));
});

test("Pin changes are view-only and Open/New clear the previous document target", async ({ page }) => {
  await ready(page);
  const bottom = page.getByTestId("bottom-editor");
  await page.getByTestId("cycle-surface").locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  const state = () => Promise.all(["revision-status", "history-status", "dirty-status"].map((id) => page.getByTestId(id).textContent()));
  const before = await state();
  await openBottomSettings(page);
  await bottom.getByTestId("bottom-pin").click();
  await bottom.getByTestId("bottom-pin").click();
  await bottom.getByTestId("bottom-pin").click();
  expect(await state()).toEqual(before);
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(path.resolve("samples/current/01_cycle_signals.tcd.json"));
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true");
  await openBottomSettings(page);
  await expect(bottom.getByTestId("bottom-pin")).toHaveAttribute("aria-pressed", "false");
  await expect(bottom.getByTestId("follow-selection")).toBeChecked();
  await expect(bottom.getByTestId("bottom-target-mode")).toHaveCount(0);
  await page.getByTestId("cycle-surface").locator("[data-role='frozen-row'][data-row-id='sig.req']").click();
  await openBottomSettings(page);
  await bottom.getByTestId("bottom-pin").click();
  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "New", exact: true }).click();
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true");
  await openBottomSettings(page);
  await expect(bottom.getByTestId("bottom-pin")).toHaveAttribute("aria-pressed", "false");
  await expect(bottom.getByTestId("follow-selection")).toBeChecked();
  await expect(bottom.getByTestId("bottom-target-mode")).toHaveCount(0);
});

test("pinned Transaction duplicate ignores live multi-selection", async ({ page }) => {
  await ready(page);
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  const bottom = page.getByTestId("bottom-editor");
  await bottom.locator(".bottom-tabs").getByRole("tab", { name: "Transaction", exact: true }).click();
  const names: string[] = [];
  for (let index = 0; index < 3; index += 1) {
    await bottom.getByTestId("bottom-transaction-add").click();
    names.push(await page.getByLabel("Bottom Transaction name").inputValue());
  }
  const tree = page.getByTestId("transaction-left-tree");
  await tree.getByText(names[0]!, { exact: true }).click();
  await openBottomSettings(page);
  await bottom.getByTestId("bottom-pin").click();
  await tree.getByText(names[1]!, { exact: true }).click();
  await tree.getByText(names[2]!, { exact: true }).click({ modifiers: ["Control"] });
  await expect(page.getByLabel("Bottom Transaction name")).toHaveValue(names[0]!);
  await bottom.getByTestId("bottom-transaction-duplicate").click();
  await expect(tree.getByText(`${names[0]} Copy`, { exact: true })).toHaveCount(1);
  await expect(tree.getByText(`${names[1]} Copy`, { exact: true })).toHaveCount(0);
  await expect(tree.getByText(`${names[2]} Copy`, { exact: true })).toHaveCount(0);
  await expect(page.getByTestId("history-status")).toHaveText("History 4 / Redo 0");
});

test("pinned Signal visibility and duplicate actions target the pinned stable ID", async ({ page }) => {
  await ready(page);
  const host = page.getByTestId("cycle-surface");
  const bottom = page.getByTestId("bottom-editor");

  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  await openBottomSettings(page);
  await bottom.getByTestId("bottom-pin").click();
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_ready']").click();
  await bottom.getByTestId("signal-visibility").click();
  await expect(bottom.getByTestId("signal-visibility")).toHaveText("Show signal");
  await expect(host.locator("[data-role='left-row'][data-row-id='sig_cycle_request'] [data-role='tree-visibility'] svg")).toHaveAttribute("data-icon", "eye-off");
  await expect(host.locator("[data-role='left-row'][data-row-id='sig_cycle_ready'] [data-role='tree-visibility'] svg")).toHaveAttribute("data-icon", "eye");

  await openBottomSettings(page);
  await bottom.getByTestId("bottom-pin").click();
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_clock']").click();
  await openBottomSettings(page);
  await bottom.getByTestId("bottom-pin").click();
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_data']").click();
  await bottom.getByTestId("clock-duplicate").click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(page.getByTestId("selection-status")).toHaveText("CLOCK_duplicate");
  await expect(bottom).toContainText(/CLOCK · clock/i);
});

test("pinned Annotation stays on the collection surface and deletes the created annotation", async ({ page }) => {
  await ready(page);
  const host = page.getByTestId("cycle-surface");
  const bottom = page.getByTestId("bottom-editor");
  const ids = () => page.getByTestId("annotation-list").locator("[data-annotation-list-id]").evaluateAll((rows) => rows.map((row) => row.getAttribute("data-annotation-list-id")!));
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Annotation", exact: true }).click();
  await page.getByTestId("annotation-toolbar").getByRole("button", { name: "Add annotation", exact: true }).click();
  await expect.poll(async () => (await ids()).some((id) => id.startsWith("annotation_phase9_"))).toBe(true);
  const before = await ids();
  const created = before.find((id) => id.startsWith("annotation_phase9_"))!;
  await openBottomSettings(page);
  await bottom.getByTestId("bottom-pin").click();
  await page.locator(".view-mode").getByRole("button", { name: "Combined", exact: true }).click();
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Home", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Create Transaction", exact: true }).click();
  const selectedTransaction = page.getByTestId("transaction-left-tree").locator("[data-transaction-tree-id][data-selected='true']");
  const transactionId = await selectedTransaction.getAttribute("data-transaction-tree-id");
  expect(transactionId).toBeTruthy();
  await expect(bottom.getByTestId("annotation-collection")).toBeVisible();
  await bottom.getByTestId("annotation-collection").getByRole("button", { name: "Delete", exact: true }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect.poll(async () => (await ids()).includes(created)).toBe(false);
  const after = await ids();
  for (const id of before.filter((item) => item !== created)) expect(after, `${id} must survive`).toContain(id);
  await expect(page.getByTestId(`transaction-left-tree-row-${transactionId}`)).toHaveCount(1);
  await expect(host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_ready']")).toHaveCount(1);
});

test("pinned Signal delete targets the pinned stable ID", async ({ page }) => {
  await ready(page);
  const host = page.getByTestId("cycle-surface");
  const bottom = page.getByTestId("bottom-editor");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_reset_n']").click();
  await openBottomSettings(page);
  await bottom.getByTestId("bottom-pin").click();
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_ready']").click();
  await bottom.getByTestId("signal-delete").click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_reset_n']")).toHaveCount(0);
  await expect(host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_ready']")).toHaveCount(1);
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await expect(bottom.getByTestId("bottom-pin")).toHaveAttribute("aria-pressed", "false");
});

test("pinned Transaction edits target the pinned stable ID", async ({ page }) => {
  await ready(page);
  const host = page.getByTestId("cycle-surface");
  const bottom = page.getByTestId("bottom-editor");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Timeline", exact: true }).click();
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  await page.locator(".bottom-tabs").getByRole("tab", { name: "Transaction", exact: true }).click();
  await bottom.getByTestId("bottom-transaction-add").click();
  const created = await page.getByLabel("Bottom Transaction name").inputValue();
  await expect(page.getByLabel("Bottom Transaction name")).toHaveValue(created);
  await openBottomSettings(page);
  await bottom.getByTestId("bottom-pin").click();
  await page.locator(".view-mode").getByRole("button", { name: "Combined", exact: true }).click();
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  await expect(bottom.getByTestId("bottom-pin")).toHaveAttribute("aria-pressed", "true");
  await bottom.locator(".bottom-tabs").getByRole("tab", { name: "Transaction", exact: true }).click();
  await expect(page.getByLabel("Bottom Transaction name")).toHaveValue(created);
  await bottom.getByLabel("Bottom Transaction name", { exact: true }).fill(`${created} Updated`);
  await bottom.getByTestId("apply-transaction-properties").click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(page.getByTestId("transaction-left-tree").getByText(`${created} Updated`, { exact: true })).toHaveCount(1);
  await expect(host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']")).toHaveCount(1);
});
