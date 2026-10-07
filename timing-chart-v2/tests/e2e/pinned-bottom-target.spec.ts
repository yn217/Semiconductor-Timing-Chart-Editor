import { expect, test, type Page } from "@playwright/test";
import { openBottomSettings } from "./bottom-settings";

async function ready(page: Page) {
  await page.goto("/");
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
}

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
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_ready']").click();
  await expect(bottom.getByTestId("annotation-collection")).toBeVisible();
  await bottom.getByTestId("annotation-collection").getByRole("button", { name: "Delete", exact: true }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect.poll(async () => (await ids()).includes(created)).toBe(false);
  const after = await ids();
  for (const id of before.filter((item) => item !== created)) expect(after, `${id} must survive`).toContain(id);
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
  // The pinned Transaction is the active (editable) Bottom row; select it in the Tree so the Inspector edits the same stable ID.
  await expect(page.getByLabel("Bottom Transaction name")).toHaveValue(created);
  await page.getByTestId("transaction-left-tree").getByText(created, { exact: true }).click();
  const inspector = page.getByTestId("inspector");
  await inspector.getByLabel("Transaction name").fill(`${created} Updated`);
  await inspector.getByTestId("apply-inspector-transaction").click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(page.getByTestId("transaction-left-tree").getByText(`${created} Updated`, { exact: true })).toHaveCount(1);
  await expect(host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']")).toHaveCount(1);
});
