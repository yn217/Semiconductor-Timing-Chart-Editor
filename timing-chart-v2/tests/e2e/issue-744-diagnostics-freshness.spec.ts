import { expect, test } from "@playwright/test";
import { generatePerformanceDocument } from "@timing-chart-v2/testing";

// #744: a successful semantic edit / Undo / Redo must not silently erase timing diagnostics.
test("timing diagnostics stay current across a semantic edit, Undo and Redo (no silent clear)", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const document = generatePerformanceDocument({ signalCount: 4, cycleCount: 40, profile: "transaction-heavy" }) as unknown as { signals: { type: string; values?: { start: number; value: unknown }[] }[] };
  // A value signal that is unknown before its first value (UNINITIALIZED_SIGNAL_VALUE timing diagnostic).
  const target = document.signals.find((signal) => signal.type !== "clock" && signal.type !== "commentRow" && signal.values && signal.values.length > 0)!;
  target.values![0]!.start = 5;
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "diag.tcd", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(document)) });
  await expect(host).toHaveAttribute("data-editor-idle", "true", { timeout: 60_000 });
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();

  const problems = async () => Number(((await page.locator("[data-testid='problems-status'], [data-testid='problem-count-status']").first().textContent()) ?? "").replace(/\D+/g, ""));
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Check", exact: true }).click();
  const before = await problems();
  expect(before, "fixture must produce a timing diagnostic").toBeGreaterThan(0);

  await page.locator(".ribbon-tabs").getByRole("button", { name: "Timeline", exact: true }).click();
  await page.getByRole("button", { name: "Add marker" }).click();
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  expect(await problems(), "problems after a successful semantic edit").toBe(before);
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Home", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Undo", exact: true }).click();
  expect(await problems(), "problems after Undo").toBe(before);
  await page.getByTestId("ribbon").getByRole("button", { name: "Redo", exact: true }).click();
  expect(await problems(), "problems after Redo").toBe(before);
});

// #744 single-full-validation invariant: each accepted execute / Undo / Redo costs exactly one authoritative canonical validation
// (in the DocumentSession) and zero duplicate UI-level full validations, while timing diagnostics are still refreshed.
test("one canonical validation per accepted command; the UI never rescans the structure", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  const counters = async () => JSON.parse((await host.getAttribute("data-session-counters")) ?? "{}") as { validationRuns: number; validatorInvocations: number };
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Timeline", exact: true }).click();
  const b0 = await counters();
  await page.getByRole("button", { name: "Add marker" }).click();
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  const b1 = await counters();
  expect(b1.validationRuns - b0.validationRuns, "execute: session validation delta").toBe(1);
  expect(b1.validatorInvocations - b0.validatorInvocations, "execute: UI duplicate validation delta").toBe(0);
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Home", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Undo", exact: true }).click();
  const b2 = await counters();
  expect(b2.validationRuns - b1.validationRuns, "undo: session validation delta").toBe(1);
  expect(b2.validatorInvocations - b1.validatorInvocations, "undo: UI duplicate validation delta").toBe(0);
  await page.getByTestId("ribbon").getByRole("button", { name: "Redo", exact: true }).click();
  const b3 = await counters();
  expect(b3.validationRuns - b2.validationRuns, "redo: session validation delta").toBe(1);
  expect(b3.validatorInvocations - b2.validatorInvocations, "redo: UI duplicate validation delta").toBe(0);
});
