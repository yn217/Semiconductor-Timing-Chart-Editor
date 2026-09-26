import { expect, test } from "@playwright/test";
import { startInCycleSample } from "./cycle-startup.js";

startInCycleSample(test);

test("Bottom transition bulk selection is scoped to its stable Signal ID", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");

  const request = host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']");
  const ready = host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_ready']");
  await request.click();
  const editor = page.getByTestId("signal-editor");
  const requestStart = editor.locator("form.event-row[data-event-start='0']");
  await requestStart.getByLabel("Select transition 1").check();
  await expect(editor.getByTestId("event-selected-count")).toHaveText("1 row selected");

  // Both Signals have a transition at source cycle 0. A cycle/start identity
  // is unique only within its owning Signal, not across the Bottom editor.
  await ready.click();
  await expect(editor).toContainText("READY");
  await expect(editor.getByTestId("event-selected-count")).toHaveText("0 rows selected");
  await expect(editor.getByTestId("event-delete-selected")).toBeDisabled();
  await expect(editor.locator("form.event-row[data-event-start='0'] input[type='checkbox']")).not.toBeChecked();

  // A row draft has the same Signal-scoped ownership. Switching Signals
  // follows the existing explicit transient-draft discard contract; it must
  // never become an editable draft targeting the newly selected Signal.
  await request.click();
  const requestStartAgain = editor.locator("form.event-row[data-event-start='0']");
  await requestStartAgain.getByRole("button", { name: /Edit transition/ }).click();
  await requestStartAgain.getByLabel("Comment 0").fill("belongs only to REQUEST");
  const revision = await host.getAttribute("data-canonical-revision");
  const history = await page.getByTestId("history-status").innerText();
  const dirty = await page.getByTestId("dirty-status").innerText();

  await ready.click();
  const readyStart = editor.locator("form.event-row[data-event-start='0']");
  await expect(readyStart.getByLabel("Comment 0")).toHaveCount(0);
  await expect(editor.getByTestId("event-selected-count")).toHaveText("0 rows selected");
  await expect(host).toHaveAttribute("data-canonical-revision", revision!);
  await expect(page.getByTestId("history-status")).toHaveText(history);
  await expect(page.getByTestId("dirty-status")).toHaveText(dirty);
});
