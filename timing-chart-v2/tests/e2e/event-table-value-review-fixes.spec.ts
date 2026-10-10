import { expect, test } from "@playwright/test";
import { startInCycleSample } from "./cycle-startup.js";

// Review fixes for the bottom Event Table's Add/Edit Transition form and rows:
// an occupied Start is prefilled from its existing change (keeping Comment),
// Add Row/Duplicate are disabled when no cycle is free, Add & Continue only
// advances after a successful add, and an import entry without a value is
// rejected with a clear message.

startInCycleSample(test);

async function openSignalEvents(page: import("@playwright/test").Page) {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  await page.getByRole("tab", { name: "Signal", exact: true }).click();
  return page.getByTestId("signal-editor");
}

async function importEvents(page: import("@playwright/test").Page, name: string, payload: unknown) {
  const editor = page.getByTestId("signal-editor");
  await editor.getByLabel("Import signal events").setInputFiles({
    name,
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(payload)),
  });
}

test("Add on an occupied Start prefills the existing Value and Comment, and submitting unchanged keeps them", async ({ page }) => {
  const editor = await openSignalEvents(page);
  await importEvents(page, "prefill-events.json", { values: [{ start: 0, value: "0" }, { start: 3, value: "1", comment: "keep this comment" }] });
  await expect(editor.getByTestId("event-import-status")).toHaveText(/Imported 2 events/);

  await page.getByLabel("New event start").fill("3");
  await expect(page.getByTestId("transition-form-mode")).toHaveAttribute("data-mode", "edit");
  await expect(page.getByLabel("New event value")).toHaveValue("1");
  await expect(page.getByLabel("New event comment")).toHaveValue("keep this comment");

  const before = await page.getByTestId("history-status").textContent();
  await page.getByTestId("add-signal-event").click();
  // Submitting the unchanged prefilled form is a no-op: nothing was overwritten or dropped.
  await expect(page.getByTestId("history-status")).toHaveText(before ?? "");
  await expect(editor.getByLabel("Comment 3")).toHaveValue("keep this comment");
  await expect(editor.getByLabel("Value 3")).toHaveValue("1");
});

test("Add & Continue keeps Start and Comment when the add is rejected", async ({ page }) => {
  const editor = await openSignalEvents(page);
  await importEvents(page, "continue-events.json", { values: [{ start: 0, value: "0" }, { start: 3, value: "1", comment: "unchanged" }] });
  await expect(editor.getByTestId("event-import-status")).toHaveText(/Imported 2 events/);

  // Start 3 already holds exactly this Value and Comment, so the add is rejected as a no-op.
  await page.getByLabel("New event start").fill("3");
  await expect(page.getByLabel("New event comment")).toHaveValue("unchanged");
  const before = await page.getByTestId("history-status").textContent();
  await page.getByTestId("add-signal-event-continue").click();

  await expect(page.getByTestId("history-status")).toHaveText(before ?? "");
  await expect(page.getByLabel("New event start")).toHaveValue("3");
  await expect(page.getByLabel("New event comment")).toHaveValue("unchanged");
});

test("Add Row and Duplicate are disabled when every cycle already has a transition", async ({ page }) => {
  const editor = await openSignalEvents(page);
  const lastCycle = Number(await page.getByLabel("New event start").getAttribute("max"));
  expect(lastCycle).toBeGreaterThan(0);
  const values = Array.from({ length: lastCycle + 1 }, (_, cycle) => ({ start: cycle, value: cycle % 2 === 0 ? "0" : "1" }));
  await importEvents(page, "full-events.json", { values });
  await expect(editor.getByTestId("event-import-status")).toHaveText(/Imported \d+ events/);

  await expect(page.getByTestId("event-add-row")).toBeDisabled();
  await expect(page.getByTestId("event-add-row")).toHaveAttribute("title", "No free cycle for a new transition");
  await editor.locator("form.event-row[data-event-start='0']").click();
  await expect(page.getByTestId("event-duplicate")).toBeDisabled();
});

test("Import rejects an entry without a value with a clear message and leaves History unchanged", async ({ page }) => {
  const editor = await openSignalEvents(page);
  const before = await page.getByTestId("history-status").textContent();
  await importEvents(page, "missing-value.json", { values: [{ start: 0, value: "0" }, { start: 2 }] });
  await expect(editor.getByTestId("event-import-status")).toHaveText("Import rejected: every event needs a value (a string or number), for example \"0\" or \"X\".");
  await expect(page.getByTestId("history-status")).toHaveText(before ?? "");
});
