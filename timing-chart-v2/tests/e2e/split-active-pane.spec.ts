import { expect, test } from "@playwright/test";

// #407: Split's own pane-level counterpart to #404's ActiveContext.
// Non-goals explicitly exclude the horizontal side-by-side layout (#408)
// and the final Ribbon wiring (#409) -- this is scoped to establishing
// `activePane` ownership over the two *existing* Split regions (the Signal
// waveform surface, and `.transaction-lanes` stacked above it), synced
// into ActiveContext, view-only throughout.

test("Split active pane follows clicks on the Signal surface vs Transaction lanes, drives ActiveContext, and stays view-only", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");

  // Entering Transaction mode, then Split, should preserve "transaction"
  // as the active pane (matching #404's own ActiveContext preservation
  // contract for Split) -- not reset to "signal".
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Create Transaction", exact: true }).click();
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true");
  const before = await page.getByTestId("history-status").textContent();

  await page.locator(".view-mode").getByRole("button", { name: "Combined", exact: true }).click();
  const viewport = page.getByTestId("cycle-viewport");
  await expect(viewport).toHaveAttribute("data-active-pane", "transaction");
  await expect(page.getByTestId("active-pane-status")).toHaveText("Active Pane: Transaction");
  await expect(page.getByTestId("history-status")).toHaveText(before!);

  // Clicking the Signal surface flips the active pane -- view-only.
  await page.getByTestId("cycle-surface").click({ position: { x: 40, y: 160 } });
  await expect(viewport).toHaveAttribute("data-active-pane", "signal");
  await expect(page.getByTestId("active-pane-status")).toHaveText("Active Pane: Signal");
  await expect(page.getByTestId("history-status")).toHaveText(before!);
  // ActiveContext follows: the Ribbon shows Signal-context groups again.
  await expect(page.getByTestId("ribbon").locator("[data-major-group='Layout']")).toHaveCount(1);

  // Focusing a Transaction row also claims pane ownership.
  await page.locator(".transaction-lane-label-row").first().focus();
  await expect(viewport).toHaveAttribute("data-active-pane", "transaction");
  await expect(page.getByTestId("active-pane-status")).toHaveText("Active Pane: Transaction");
  await expect(page.getByTestId("history-status")).toHaveText(before!);

  // Outside Split, the status readout and data attribute are absent --
  // Cycle/Transaction each have exactly one meaningful pane.
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  await expect(page.getByTestId("active-pane-status")).toHaveCount(0);
  await expect(viewport).toHaveAttribute("data-active-pane", "");
});

test("Cycle and Transaction restore their last valid Bottom tab independently", async ({ page }) => {
  await page.goto("/?transaction-demo");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  await page.getByRole("tab", { name: "Annotation", exact: true }).click();
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  await expect(page.getByRole("tab", { name: "Transaction", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: "Phases", exact: true }).click();
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  await expect(page.getByRole("tab", { name: "Annotation", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  await expect(page.getByRole("tab", { name: "Phases", exact: true })).toHaveAttribute("aria-selected", "true");
});

test("Combined routes a real Transaction bar drag to the Transaction pane only", async ({ page }) => {
  await page.goto("/?transaction-demo");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  await page.locator(".view-mode").getByRole("button", { name: "Combined", exact: true }).click();
  const viewport = page.getByTestId("cycle-viewport");
  const bar = page.locator('[data-transaction-id="demo_txn_read"]');
  await expect(bar).toBeVisible();
  await bar.click();
  const beforeHistory = await page.getByTestId("history-status").textContent();
  const beforeStart = await page.getByTestId("inspector").getByLabel("Transaction start").inputValue();
  const box = await bar.locator(":scope > span").boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width / 2 + 24, box!.y + box!.height / 2, { steps: 3 });
  await page.mouse.up();
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true");
  await expect(page.getByTestId("inspector").getByLabel("Transaction start")).not.toHaveValue(beforeStart);
  await expect(page.getByTestId("history-status")).not.toHaveText(beforeHistory!);
  await expect(viewport).toHaveAttribute("data-active-pane", "transaction");
  await expect(page.getByTestId("active-pane-status")).toHaveText("Active Pane: Transaction");
});

test("Combined routes a Signal waveform range drag to the Signal pane only", async ({ page }) => {
  await page.goto("/?transaction-demo");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Combined", exact: true }).click();
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Timeline", exact: true }).click();
  const wave = host.locator("[data-role='stable-waveform-surface'] [data-signal-id='sig_cycle_request']");
  const ruler = page.getByTestId("cycle-ruler");
  const waveBox = await wave.boundingBox();
  const start = await ruler.locator("[data-cycle='2']").boundingBox();
  const end = await ruler.locator("[data-cycle='6']").boundingBox();
  expect(waveBox).not.toBeNull();
  expect(start).not.toBeNull();
  expect(end).not.toBeNull();
  const before = await page.getByTestId("history-status").textContent();
  await page.mouse.move(start!.x + 1, waveBox!.y + waveBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(end!.x + 1, waveBox!.y + waveBox!.height / 2);
  await page.mouse.up();
  await expect(page.getByTestId("active-pane-status")).toHaveText("Active Pane: Signal");
  await expect(page.getByTestId("history-status")).toHaveText(before!);
  await expect(page.getByLabel("Timeline range start")).toHaveValue("2");
  await expect(page.getByLabel("Timeline range end")).toHaveValue("6");
});

test("low-level view mode pointerdown cancels a Transaction drag before pointerup", async ({ page }) => {
  await page.goto("/?transaction-demo");
  await page.locator(".view-mode").getByRole("button", { name: "Combined", exact: true }).click();
  const bar = page.locator('[data-transaction-id="demo_txn_read"]');
  await bar.click();
  const row = page.locator('[data-transaction-row-id="demo_txn_read"]');
  const before = await row.textContent();
  const box = await bar.locator(":scope > span").boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width / 2 + 32, box!.y + box!.height / 2, { steps: 2 });
  const cycleButton = page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true });
  await cycleButton.dispatchEvent("pointerdown", { button: 0, buttons: 1 });
  await cycleButton.dispatchEvent("click", { button: 0 });
  await page.mouse.up();
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  await expect(page.locator('[data-transaction-row-id="demo_txn_read"]')).toHaveText(before!);
});
