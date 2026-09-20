import { expect, test, type Page } from "@playwright/test";

/**
 * #684 blind fresh-state journeys (production path, no injected state): every test starts from a fresh browser context (default
 * startup document, no persisted preferences) and only uses the UI a user has. Each journey also asserts no console/page errors.
 * productionPath: true, freshStart: true.
 */
function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  return errors;
}
const mode = (page: Page, name: string) => page.locator(".view-mode").getByRole("button", { name, exact: true });
const status = (page: Page) => Promise.all([page.getByTestId("revision-status").textContent(), page.getByTestId("history-status").textContent(), page.getByTestId("dirty-status").textContent()]);
async function fresh(page: Page) {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
}
async function toCycleSample(page: Page) {
  // Fresh start on the plain Cycle sample: File > New, then Cycle mode.
  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "New", exact: true }).click();
  await mode(page, "Cycle").click();
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true");
}

for (const target of ["Cycle", "Transaction", "Combined"]) {
  test(`J1-3 fresh -> ${target}: renders, view-only, no errors`, async ({ page }) => {
    const errors = trackErrors(page);
    await fresh(page);
    const before = await status(page);
    await mode(page, target).click();
    await expect(page.getByTestId("view-mode-status")).toHaveText(`Mode: ${target}`);
    expect(await status(page)).toEqual(before);
    expect(errors).toEqual([]);
  });
}

test("J4/J16 Cycle -> Transaction -> Combined -> Cycle, then rapid switching, stays view-only and error-free", async ({ page }) => {
  const errors = trackErrors(page);
  await fresh(page);
  const before = await status(page);
  for (const name of ["Cycle", "Transaction", "Combined", "Cycle"]) { await mode(page, name).click(); await expect(page.getByTestId("view-mode-status")).toHaveText(`Mode: ${name}`); }
  for (let i = 0; i < 12; i += 1) await mode(page, ["Transaction", "Combined", "Cycle"][i % 3]!).click();
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  expect(await status(page)).toEqual(before);
  expect(errors).toEqual([]);
});

test("J5/J10 select -> edit -> Apply -> Undo -> Redo, and an unapplied draft does not leak to the next selection", async ({ page }) => {
  const errors = trackErrors(page);
  await fresh(page); await toCycleSample(page);
  const host = page.getByTestId("cycle-surface");
  const nameField = () => page.getByTestId("inspector").getByLabel("Inspector signal name", { exact: true });
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  await nameField().fill("DRAFT_ONLY");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_ready']").click();
  await expect(nameField()).toHaveValue("READY");
  expect((await status(page))[1]).toContain("History 0");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  await nameField().fill("RENAMED");
  await nameField().press("Enter");
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Home", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 1");
  await page.getByTestId("ribbon").getByRole("button", { name: "Redo", exact: true }).click();
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  expect(errors).toEqual([]);
});

test("J6 annotation create -> drag -> Escape leaves Canonical untouched", async ({ page }) => {
  const errors = trackErrors(page);
  await fresh(page); await toCycleSample(page);
  const host = page.getByTestId("cycle-surface");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Annotation", exact: true }).click();
  await page.getByLabel("Annotation type").selectOption("text");
  await page.getByRole("button", { name: "Add annotation" }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  const before = await status(page);
  const label = host.locator("[data-role='annotation-owner'] [data-role='annotation-label']").last();
  const box = (await label.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 60, box.y + 30, { steps: 5 });
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  expect(await status(page)).toEqual(before);
  expect(errors).toEqual([]);
});

test("J7/J8/J15 far horizontal + vertical scroll -> select, zoom -> scroll -> mode switch", async ({ page }) => {
  const errors = trackErrors(page);
  await fresh(page); await mode(page, "Cycle").click();
  const host = page.getByTestId("cycle-surface");
  const viewport = page.getByTestId("cycle-viewport");
  await viewport.evaluate((element) => { element.scrollLeft = element.scrollWidth; element.dispatchEvent(new Event("scroll", { bubbles: true })); });
  await expect.poll(() => viewport.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
  await viewport.evaluate((element) => { element.scrollTop = element.scrollHeight; element.dispatchEvent(new Event("scroll", { bubbles: true })); });
  await host.locator("[data-role='frozen-row']").last().click();
  await expect(page.getByTestId("selection-status")).not.toHaveText("None");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Home", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Zoom In", exact: true }).click();
  await viewport.evaluate((element) => { element.scrollLeft = Math.floor(element.scrollWidth / 2); element.dispatchEvent(new Event("scroll", { bubbles: true })); });
  await mode(page, "Transaction").click();
  await mode(page, "Cycle").click();
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  expect(errors).toEqual([]);
});

test("J9 Bottom follows the selected entity kind", async ({ page }) => {
  const errors = trackErrors(page);
  await fresh(page); await toCycleSample(page);
  const host = page.getByTestId("cycle-surface");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  await expect(page.getByTestId("bottom-tabs").locator("[data-bottom-tab='Signal'].active")).toHaveCount(1);
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Annotation", exact: true }).click();
  await page.getByLabel("Annotation type").selectOption("text");
  await page.getByRole("button", { name: "Add annotation" }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(page.getByTestId("bottom-tabs").locator("[data-bottom-tab='Annotation'].active")).toHaveCount(1);
  expect(errors).toEqual([]);
});

test("J11-J14 save -> edit -> Undo, dirty -> Open -> Cancel / Discard, reload -> Open", async ({ page }) => {
  const errors = trackErrors(page);
  await fresh(page); await toCycleSample(page);
  const host = page.getByTestId("cycle-surface");
  const fileInput = page.locator("input[type='file'][accept='.json,.tcd']");
  const download = page.waitForEvent("download");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Save", exact: true }).click();
  const savedPath = (await (await download).path())!;
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  const name = page.getByTestId("inspector").getByLabel("Inspector signal name", { exact: true });
  await name.fill("DIRTY_EDIT");
  await name.press("Enter");
  await expect(page.getByTestId("dirty-status")).not.toHaveText("Clean");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Home", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 1");
  await page.getByTestId("ribbon").getByRole("button", { name: "Redo", exact: true }).click();
  await fileInput.setInputFiles(savedPath);
  await expect(page.getByTestId("unsaved-file-dialog")).toBeVisible();
  await page.getByTestId("unsaved-cancel").click();
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await fileInput.setInputFiles(savedPath);
  await page.getByTestId("unsaved-discard").click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
  await page.reload();
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await fileInput.setInputFiles(savedPath);
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  expect(errors).toEqual([]);
});

test("J17 window resize during an active range drag keeps the app consistent", async ({ page }) => {
  const errors = trackErrors(page);
  await fresh(page); await toCycleSample(page);
  const ruler = page.getByTestId("cycle-ruler");
  const a = (await ruler.locator("[data-cycle='2']").boundingBox())!;
  const b = (await ruler.locator("[data-cycle='6']").boundingBox())!;
  await page.mouse.move(a.x + 2, a.y + 10);
  await page.mouse.down();
  await page.mouse.move(b.x + 2, b.y + 10, { steps: 4 });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.mouse.up();
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true");
  expect((await status(page))[1]).toContain("History 0");
  expect(errors).toEqual([]);
});
