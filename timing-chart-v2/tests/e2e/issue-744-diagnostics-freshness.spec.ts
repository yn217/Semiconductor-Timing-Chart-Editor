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
