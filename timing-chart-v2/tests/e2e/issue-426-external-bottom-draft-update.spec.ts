import { expect, test } from "@playwright/test";
import { startInCycleSample } from "./cycle-startup.js";

startInCycleSample(test);

test("external event replacement never silently overwrites a dirty Bottom transition draft", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  const editor = page.getByTestId("signal-editor");
  const row = editor.locator("form.event-row[data-event-start='3']");
  await row.getByRole("button", { name: /Edit transition/ }).click();
  await row.getByLabel("Comment 3").fill("local unapplied draft");
  const revisionBefore = await host.getAttribute("data-canonical-revision");

  await editor.getByTestId("event-import-action").click();
  await editor.getByLabel("Import signal events").setInputFiles({ name: "external-events.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ values: [{ start: 0, value: "0" }, { start: 3, value: "X", comment: "external canonical update" }] })) });

  await expect(host).not.toHaveAttribute("data-canonical-revision", revisionBefore!);
  await expect(row.getByTestId("event-row-draft-conflict-3")).toBeVisible();
  await expect(row.getByLabel("Comment 3")).toHaveValue("local unapplied draft");
  await expect(row.getByRole("button", { name: "Save" })).toBeDisabled();
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");

  await row.getByRole("button", { name: "Reload latest" }).click();
  await expect(row.getByLabel("Comment 3")).toHaveValue("external canonical update");
  await expect(row.getByTestId("event-row-draft-conflict-3")).toHaveCount(0);
  await expect(row.getByRole("button", { name: "Save" })).toBeDisabled();
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
});

test("external transition removal prunes Bottom bulk selection immediately", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  const editor = page.getByTestId("signal-editor");
  const row = editor.locator("form.event-row[data-event-start='3']");
  await row.getByLabel("Select transition 2").check();
  await expect(editor.getByTestId("event-selected-count")).toHaveText("1 row selected");

  await editor.getByTestId("event-import-action").click();
  await editor.getByLabel("Import signal events").setInputFiles({ name: "removed-transition.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ values: [{ start: 0, value: "0" }, { start: 2, value: "X" }] })) });

  await expect(row).toHaveCount(0);
  await expect(editor.getByTestId("event-selected-count")).toHaveText("0 rows selected");
  await expect(editor.getByTestId("event-delete-selected")).toBeDisabled();
});

test("Canvas anchor commit cannot be overwritten by a dirty Inspector anchor draft", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Annotation", exact: true }).click();
  await page.getByRole("tablist", { name: "Bottom context panels" }).getByRole("tab", { name: "Annotation" }).click();
  const list = page.getByTestId("annotation-list");
  const beforeIds = await list.locator("[data-annotation-list-id]").evaluateAll((rows) => rows.map((row) => row.getAttribute("data-annotation-list-id")).filter((id): id is string => Boolean(id)));
  await page.getByLabel("Annotation type").selectOption("marker");
  await page.getByRole("button", { name: "Add annotation" }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect.poll(async () => {
    const ids = await list.locator("[data-annotation-list-id]").evaluateAll((rows) => rows.map((row) => row.getAttribute("data-annotation-list-id")).filter((id): id is string => Boolean(id)));
    return ids.some((id) => !beforeIds.includes(id));
  }).toBe(true);
  const newId = (await list.locator("[data-annotation-list-id]").evaluateAll((rows) => rows.map((row) => row.getAttribute("data-annotation-list-id")).filter((id): id is string => Boolean(id)))).find((id) => !beforeIds.includes(id))!;
  await page.getByRole("tablist", { name: "Bottom context panels" }).getByRole("tab", { name: "Annotation" }).click();
  const inspector = page.getByTestId("inspector");
  const anchorEditor = inspector.getByLabel("Inspector Annotation Anchor");
  const cycleDraft = anchorEditor.getByLabel("Inspector annotation anchor cycle");
  await cycleDraft.fill("0");
  const owner = host.locator(`[data-role='annotation-owner'][data-annotation-id="${newId}"]`);
  const handle = owner.locator("[data-role='annotation-handle'][data-annotation-field='anchor']");
  await expect(handle).toBeVisible();
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();

  await expect(cycleDraft).toHaveValue("0");
  await expect(anchorEditor.getByTestId("inspector-annotation-anchor-draft-conflict")).toBeVisible();
  await expect(anchorEditor.getByRole("button", { name: "Apply Anchor" })).toBeDisabled();
  await anchorEditor.getByRole("button", { name: "Keep my draft" }).click();
  await expect(anchorEditor.getByTestId("inspector-annotation-anchor-draft-conflict")).toHaveCount(0);
  await expect(anchorEditor.getByRole("button", { name: "Apply Anchor" })).toBeEnabled();
  await anchorEditor.getByRole("button", { name: "Apply Anchor" }).click();
  await expect(page.getByTestId("history-status")).toHaveText("History 3 / Redo 0");
  await expect(owner).toHaveAttribute("data-annotation-id", newId);
});
