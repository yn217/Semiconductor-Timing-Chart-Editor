import { expect, test } from "@playwright/test";
import { startInCycleSample } from "./cycle-startup.js";

startInCycleSample(test);

test("Start reuse retains distinct transition identities during independent edits and deletion", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  const editor = page.getByTestId("signal-editor");
  const addAtFive = async () => {
    await editor.getByLabel("New event start").fill("5");
    await editor.getByLabel("New event comment").fill("new at five");
    await editor.getByTestId("add-signal-event").click();
  };
  await addAtFive();
  const created = editor.locator("form.event-row[data-event-start='5']");
  const movedId = await created.getAttribute("data-event-id");
  expect(movedId).toBeTruthy();
  await created.getByTestId("event-row-start-5").fill("10");
  await created.getByRole("button", { name: "Apply", exact: true }).click();
  const moved = editor.locator(`form.event-row[data-event-id="${movedId}"]`);
  await expect(moved).toHaveAttribute("data-event-start", "10");
  await addAtFive();
  const replacement = editor.locator("form.event-row[data-event-start='5']");
  const replacementId = await replacement.getAttribute("data-event-id");
  expect(replacementId).toBeTruthy();
  expect(replacementId).not.toBe(movedId);
  const ids = await editor.locator("form.event-row").evaluateAll((rows) => rows.map((row) => row.getAttribute("data-event-id")));
  expect(new Set(ids).size).toBe(ids.length);
  await moved.getByLabel("Comment 10").fill("moved identity only");
  await moved.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(replacement.getByLabel("Comment 5")).toHaveValue("new at five");
  await replacement.getByLabel("Comment 5").fill("replacement identity only");
  await replacement.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(moved.getByLabel("Comment 10")).toHaveValue("moved identity only");
  await replacement.getByRole("button", { name: "Delete transition at cycle 5", exact: true }).click();
  await expect(editor.locator(`form.event-row[data-event-id="${replacementId}"]`)).toHaveCount(0);
  await expect(moved).toHaveAttribute("data-event-start", "10");
  await editor.getByTestId("editor-undo").click();
  await expect(editor.locator(`form.event-row[data-event-id="${replacementId}"]`)).toHaveAttribute("data-event-start", "5");
});
