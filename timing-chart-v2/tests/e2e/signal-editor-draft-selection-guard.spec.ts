import { expect, test } from "@playwright/test";

test("new Transition draft requires an explicit discard decision before Follow Selection changes Signal", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  await page.getByRole("treeitem", { name: /REQUEST/ }).first().click();

  const bottom = page.getByTestId("bottom-editor");
  const host = page.getByTestId("cycle-surface");
  const revision = await host.getAttribute("data-canonical-revision");
  const history = await page.getByTestId("history-status").textContent();
  const dirty = await page.getByTestId("dirty-status").textContent();
  const comment = bottom.getByRole("textbox", { name: "New event comment" });
  await comment.fill("unapplied new-transition draft");

  await page.getByRole("treeitem", { name: /READY/ }).first().click();
  const confirmation = page.getByRole("alertdialog", { name: "Unapplied Signal Draft" });
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole("button", { name: "Keep editing" }).click();
  await expect(page.locator(".editor-selection")).toHaveText("REQUEST · Signal");
  await expect(comment).toHaveValue("unapplied new-transition draft");

  await page.getByRole("treeitem", { name: /READY/ }).first().click();
  await page.getByTestId("selection-change-discard").click();
  await expect(page.locator(".editor-selection")).toHaveText("READY · Signal");
  await page.getByRole("treeitem", { name: /REQUEST/ }).first().click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect(bottom.getByRole("textbox", { name: "New event comment" })).toHaveValue("");
  await expect(host).toHaveAttribute("data-canonical-revision", revision!);
  await expect(page.getByTestId("history-status")).toHaveText(history!);
  await expect(page.getByTestId("dirty-status")).toHaveText(dirty!);
});

test("rejected Add & Continue keeps the new Transition draft intact", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  await page.getByRole("treeitem", { name: /REQUEST/ }).first().click();

  const bottom = page.getByTestId("bottom-editor");
  const host = page.getByTestId("cycle-surface");
  const revision = await host.getAttribute("data-canonical-revision");
  const history = await page.getByTestId("history-status").textContent();
  const dirty = await page.getByTestId("dirty-status").textContent();
  const start = bottom.getByRole("spinbutton", { name: "New event start" });
  const maximumStart = Number(await start.getAttribute("max"));
  expect(Number.isInteger(maximumStart)).toBeTruthy();
  const rejectedStart = String(maximumStart + 1);
  const comment = bottom.getByRole("textbox", { name: "New event comment" });
  await start.fill(rejectedStart);
  await comment.fill("preserve after rejected Add & Continue");

  await bottom.getByRole("button", { name: "Add & Continue" }).click();
  await expect(page.getByText(/Change point is outside the timeline/)).toBeVisible();
  await expect(start).toHaveValue(rejectedStart);
  await expect(comment).toHaveValue("preserve after rejected Add & Continue");
  await expect(host).toHaveAttribute("data-canonical-revision", revision!);
  await expect(page.getByTestId("history-status")).toHaveText(history!);
  await expect(page.getByTestId("dirty-status")).toHaveText(dirty!);
});

test("Generator draft requires an explicit discard decision before Follow Selection changes Signal", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  await page.getByRole("treeitem", { name: /REQUEST/ }).first().click();

  const bottom = page.getByTestId("bottom-editor");
  const host = page.getByTestId("cycle-surface");
  const revision = await host.getAttribute("data-canonical-revision");
  const history = await page.getByTestId("history-status").textContent();
  const dirty = await page.getByTestId("dirty-status").textContent();
  const period = bottom.getByRole("spinbutton", { name: "Signal generator period" });
  await period.fill("6");

  await page.getByRole("treeitem", { name: /READY/ }).first().click();
  const confirmation = page.getByRole("alertdialog", { name: "Unapplied Signal Draft" });
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole("button", { name: "Keep editing" }).click();
  await expect(page.locator(".editor-selection")).toHaveText("REQUEST · Signal");
  await expect(period).toHaveValue("6");

  await page.getByRole("treeitem", { name: /READY/ }).first().click();
  await page.getByTestId("selection-change-discard").click();
  await expect(page.locator(".editor-selection")).toHaveText("READY · Signal");
  await page.getByRole("treeitem", { name: /REQUEST/ }).first().click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect(bottom.getByRole("spinbutton", { name: "Signal generator period" })).toHaveValue("4");
  await expect(host).toHaveAttribute("data-canonical-revision", revision!);
  await expect(page.getByTestId("history-status")).toHaveText(history!);
  await expect(page.getByTestId("dirty-status")).toHaveText(dirty!);
});

test("dirty Transition row edit requires an explicit discard decision before Follow Selection changes Signal", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  await page.getByRole("treeitem", { name: /REQUEST/ }).first().click();

  const bottom = page.getByTestId("bottom-editor");
  await bottom.getByRole("button", { name: "Edit transition at cycle 0" }).click();
  const comment = bottom.getByRole("textbox", { name: "Comment 0" });
  await comment.fill("unapplied row draft");
  await expect(bottom.getByTestId("event-row-unapplied-0")).toBeVisible();

  const host = page.getByTestId("cycle-surface");
  const revision = await host.getAttribute("data-canonical-revision");
  const history = await page.getByTestId("history-status").textContent();
  const dirty = await page.getByTestId("dirty-status").textContent();

  await page.getByRole("treeitem", { name: /READY/ }).first().click();
  const confirmation = page.getByRole("alertdialog", { name: "Unapplied Signal Draft" });
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole("button", { name: "Keep editing" }).click();
  await expect(page.locator(".editor-selection")).toHaveText("REQUEST · Signal");
  await expect(comment).toHaveValue("unapplied row draft");

  await page.getByRole("treeitem", { name: /READY/ }).first().click();
  await page.getByTestId("selection-change-discard").click();
  await expect(page.locator(".editor-selection")).toHaveText("READY · Signal");
  await page.getByRole("treeitem", { name: /REQUEST/ }).first().click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect(bottom.getByTestId("event-row-comment-0")).toHaveText("");
  await expect(host).toHaveAttribute("data-canonical-revision", revision!);
  await expect(page.getByTestId("history-status")).toHaveText(history!);
  await expect(page.getByTestId("dirty-status")).toHaveText(dirty!);
});
