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

  await page.locator(".view-mode").getByRole("button", { name: "Split", exact: true }).click();
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
