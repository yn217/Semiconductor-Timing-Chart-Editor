import { expect, test } from "@playwright/test";
import { startInCycleSample } from "./cycle-startup.js";

startInCycleSample(test);

test("clean mounted EventRow rebases through external replacement and Undo/Redo", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  const editor = page.getByTestId("signal-editor");
  const row = editor.locator("form.event-row[data-event-start='3']");
  await expect(row.getByLabel("Comment 3")).toHaveValue("");

  await editor.getByTestId("event-import-action").click();
  await editor.getByLabel("Import signal events").setInputFiles({
    name: "clean-row-update.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ values: [{ start: 0, value: "0" }, { start: 3, value: "X", comment: "external canonical update" }] })),
  });

  await expect(row).toHaveCount(1);
  await expect(row.getByLabel("Value 3")).toHaveValue("X");
  await expect(row.getByLabel("Comment 3")).toHaveValue("external canonical update");
  await expect(row.getByTestId("event-row-draft-conflict-3")).toHaveCount(0);
  await expect(row.getByRole("button", { name: "Apply" })).toHaveCount(0);
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");

  await page.locator(".ribbon-tabs").getByRole("button", { name: "Home", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Undo", exact: true }).click();
  await expect(row.getByLabel("Value 3")).toHaveValue("1");
  await expect(row.getByLabel("Comment 3")).toHaveValue("");
  await expect(row.getByTestId("event-row-draft-conflict-3")).toHaveCount(0);
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 1");

  await page.getByTestId("ribbon").getByRole("button", { name: "Redo", exact: true }).click();
  await expect(row.getByLabel("Value 3")).toHaveValue("X");
  await expect(row.getByLabel("Comment 3")).toHaveValue("external canonical update");
  await expect(row.getByTestId("event-row-draft-conflict-3")).toHaveCount(0);
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
});
