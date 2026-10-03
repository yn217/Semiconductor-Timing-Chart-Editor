import { expect, test } from "@playwright/test";
import { startInCycleMode } from "./cycle-startup.js";
import { openBottomSettings } from "./bottom-settings";

startInCycleMode(test);

test("Inspector and Bottom expose the documented edit contract surfaces", async ({ page }) => {
  await page.goto("/");
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  const inspector = page.getByTestId("inspector");
  await expect(inspector.getByLabel("Inspector signal name", { exact: true })).toBeVisible();
  await expect(inspector.getByTestId("apply-inspector-signal")).toBeVisible();
  await expect(inspector.getByLabel("Inspector signal visible")).toBeVisible();
  await expect(page.getByTestId("bottom-tabs").getByRole("tab", { name: "Signal", exact: true })).toBeVisible();
  await expect(page.getByTestId("bottom-tabs").getByRole("tab", { name: "Annotation", exact: true })).toBeVisible();
  await expect(page.getByTestId("bottom-tabs").getByRole("tab", { name: "Problems", exact: true })).toBeVisible();
  await expect(page.getByTestId("bottom-tabs").getByRole("tab", { name: "JSON", exact: true })).toBeVisible();
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  await expect(page.getByTestId("bottom-tabs").getByRole("tab", { name: "Transaction", exact: true })).toBeVisible();
  await openBottomSettings(page);
  await expect(page.getByTestId("follow-selection")).toBeVisible();
  await openBottomSettings(page);
  await expect(page.getByTestId("bottom-pin")).toBeVisible();
});

test("Inspector Cancel restores signal and clock drafts without a canonical mutation", async ({ page }) => {
  await page.goto("/");
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const revision = await host.getAttribute("data-canonical-revision");
  const history = await page.getByTestId("history-status").textContent();
  const dirty = await page.getByTestId("dirty-status").textContent();

  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  const signalInspector = page.getByTestId("inspector");
  const originalName = await signalInspector.getByLabel("Inspector signal name", { exact: true }).inputValue();
  await signalInspector.getByLabel("Inspector signal name", { exact: true }).fill("TRANSIENT_CANCELLED");
  await signalInspector.getByLabel("Inspector signal name", { exact: true }).press("Escape");
  await expect(page.getByTestId("inspector").getByLabel("Inspector signal name", { exact: true })).toHaveValue(originalName);
  await expect(host).toHaveAttribute("data-canonical-revision", revision!);
  await expect(page.getByTestId("history-status")).toHaveText(history!);
  await expect(page.getByTestId("dirty-status")).toHaveText(dirty!);

  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_clock']").click();
  const clockInspector = page.getByTestId("inspector");
  const originalPeriod = await clockInspector.getByLabel("Inspector clock period").inputValue();
  await clockInspector.getByLabel("Inspector clock period").fill("99");
  await expect(clockInspector.getByTestId("cancel-inspector-draft")).toBeVisible();
  await clockInspector.getByTestId("cancel-inspector-draft").click();
  await expect(page.getByTestId("inspector").getByLabel("Inspector clock period")).toHaveValue(originalPeriod);
  await expect(host).toHaveAttribute("data-canonical-revision", revision!);
  await expect(page.getByTestId("history-status")).toHaveText(history!);
  await expect(page.getByTestId("dirty-status")).toHaveText(dirty!);
});

// Bottom Panel Visual Reference pass (#402/#426): Name moved to Inspector,
// its sole owner now -- Bottom's own duplicate Name field was removed, so
// the "transient draft discarded on selection change" contract this test
// covers is now Inspector's own (still the same underlying mechanism: the
// Draft resyncs from the newly-selected Signal's own committed values,
// discarding whatever was mid-typed for the previous one).
test("Bottom editors cancel transient drafts and preserve canonical counters", async ({ page }) => {
  await page.goto("/");
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  const inspector = page.getByTestId("inspector");
  const originalName = await inspector.getByLabel("Inspector signal name", { exact: true }).inputValue();
  const before = {
    revision: await host.getAttribute("data-canonical-revision"),
    history: await page.getByTestId("history-status").textContent(),
    dirty: await page.getByTestId("dirty-status").textContent(),
  };
  await inspector.getByLabel("Inspector signal name", { exact: true }).fill("BOTTOM_TRANSIENT");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_ready']").click();
  await expect(page.getByTestId("inspector").getByLabel("Inspector signal name", { exact: true })).not.toHaveValue("BOTTOM_TRANSIENT");
  await expect(page.getByTestId("inspector").getByLabel("Inspector signal name", { exact: true })).not.toHaveValue(originalName);
  await expect(host).toHaveAttribute("data-canonical-revision", before.revision!);
  await expect(page.getByTestId("history-status")).toHaveText(before.history!);
  await expect(page.getByTestId("dirty-status")).toHaveText(before.dirty!);

  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  await page.getByTestId("bottom-tabs").getByRole("tab", { name: "Transaction", exact: true }).click();
  const transactions = page.getByTestId("transaction-editor");
  await expect(transactions.getByTestId("transaction-list-toolbar")).toBeVisible();
  await expect(transactions.locator(".transaction-list")).toBeVisible();
  await expect(transactions.getByTestId("apply-transaction-properties")).toHaveCount(0);
  await expect(transactions.getByText("Editing:")).toHaveCount(0);
});

test("Transaction Bottom table keeps selection while Inspector owns edits", async ({ page }) => {
  await page.goto("/?transaction-demo");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  await page.getByTestId("bottom-tabs").getByRole("tab", { name: "Transaction", exact: true }).click();
  await page.getByTestId("transaction-editor").getByTestId("transaction-list-toolbar").waitFor();
  await page.locator('[data-transaction-row-id="demo_txn_read"]').click();
  const inspector = page.getByTestId("inspector");
  await expect(inspector.getByLabel("Transaction name")).toHaveValue("Read_0");
  // #703: the selected Bottom row is the in-place editing row with its own Apply, disabled while the draft is clean.
  await expect(page.getByTestId("transaction-editor").getByTestId("apply-transaction-properties")).toBeDisabled();
});

test("Signal and Group rename use the same explicit Enter/Escape draft contract", async ({ page }) => {
  await page.goto("/");
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");

  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  const signalName = page.getByTestId("inspector").getByLabel("Inspector signal name", { exact: true });
  const originalSignalName = await signalName.inputValue();
  const beforeSignal = await host.getAttribute("data-canonical-revision");
  await signalName.fill("TRANSIENT_SIGNAL_NAME");
  await signalName.press("Escape");
  await expect(signalName).toHaveValue(originalSignalName);
  await expect(host).toHaveAttribute("data-canonical-revision", beforeSignal!);

  await signalName.fill("   ");
  await signalName.press("Enter");
  await expect(page.getByRole("alert").filter({ hasText: "Name is required" })).toBeVisible();
  await expect(host).toHaveAttribute("data-canonical-revision", beforeSignal!);
  await expect(signalName).toHaveValue("   ");

  await signalName.fill("RENAMED_SIGNAL");
  await signalName.press("Enter");
  await expect(host).not.toHaveAttribute("data-canonical-revision", beforeSignal!);
  await expect(page.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']")).toContainText("RENAMED_SIGNAL");
  await page.getByTestId("ribbon").getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']")).toContainText(originalSignalName);

  await page.getByTestId("cycle-viewport").evaluate(async (element) => { element.scrollTop = element.scrollHeight; await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))); });
  await page.locator("[data-role='left-group-header'][data-group-id='grp_cycle_scratch'] [data-role='tree-branch']").click();
  const groupName = page.getByTestId("inspector").getByLabel("Inspector group name");
  const originalGroupName = await groupName.inputValue();
  const beforeGroup = await host.getAttribute("data-canonical-revision");
  await groupName.fill("RENAMED_GROUP");
  await groupName.press("Enter");
  await expect(host).not.toHaveAttribute("data-canonical-revision", beforeGroup!);
  await expect(page.getByTestId("inspector").getByLabel("Inspector group name")).toHaveValue("RENAMED_GROUP");
  await groupName.fill("TRANSIENT_GROUP_NAME");
  await groupName.press("Escape");
  await expect(page.getByTestId("inspector").getByLabel("Inspector group name")).toHaveValue("RENAMED_GROUP");
  await page.getByTestId("ribbon").getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByTestId("inspector").getByLabel("Inspector group name")).toHaveValue(originalGroupName);
});
