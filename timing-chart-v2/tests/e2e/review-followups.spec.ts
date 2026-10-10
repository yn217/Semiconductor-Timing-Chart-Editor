import { expect, test } from "@playwright/test";

test("dismissing a popover with a right-click does not swallow the next left click", async ({ page }) => {
  await page.setViewportSize({ width: 1500, height: 900 });
  await page.goto("/?transaction-demo");
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Home", exact: true }).click();
  await page.getByTestId("find-replace-trigger").click();
  await expect(page.getByTestId("find-replace-panel")).toBeVisible();
  const row = page.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").first();
  const box = (await row.boundingBox())!;
  await page.mouse.click(box.x + 30, box.y + 10, { button: "right" });
  await expect(page.getByTestId("find-replace-panel")).toBeHidden();
  await page.keyboard.press("Escape");
  await row.click({ position: { x: 30, y: 10 } });
  await expect(page.getByTestId("selection-status")).toHaveText("REQUEST");
});

test("Undo with nothing to undo keeps an earlier failed Open message", async ({ page }) => {
  await page.setViewportSize({ width: 1500, height: 900 });
  await page.goto("/?transaction-demo");
  await expect(page.locator(".view-mode")).toBeVisible();
  await page.locator("input[type=file]").first().setInputFiles({ name: "broken.tcd", mimeType: "application/json", buffer: Buffer.from("not json") });
  const message = page.getByText("Open document: Expected a JSON value.").first();
  await expect(message).toBeVisible();
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("Control+z");
  await expect(message).toBeVisible();
});

test("Paste with a Group header selected puts the copied Signal into that Group", async ({ page }) => {
  await page.setViewportSize({ width: 1500, height: 900 });
  await page.goto("/?transaction-demo");
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  await page.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click({ position: { x: 30, y: 10 } });
  await page.keyboard.press("Control+c");
  await page.locator("[data-role='left-group-header'][data-group-id='grp_cycle_payload'] [data-role='tree-branch']").first().click();
  await page.keyboard.press("Control+v");
  await expect(page.getByTestId("selection-status")).toHaveText("REQUEST_copy");
  const lastPayloadRow = await page.evaluate(() => {
    const rows = [...document.querySelectorAll<HTMLElement>("[data-role='frozen-row'][data-group-id='grp_cycle_payload']")];
    return rows.at(-1)?.textContent ?? "";
  });
  expect(lastPayloadRow).toContain("REQUEST_copy");
});

test("opening a file that is not UTF-8 reports a failed Open instead of silently replacing characters", async ({ page }) => {
  await page.setViewportSize({ width: 1500, height: 900 });
  await page.goto("/?transaction-demo");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  const [download] = await Promise.all([page.waitForEvent("download"), page.locator(".ribbon").getByRole("button", { name: "Save", exact: true }).first().click()]);
  const text = await (await import("node:fs/promises")).readFile((await download.path())!, "utf8");
  const [before, after] = text.split('"Sample -- Transaction Mode"');
  expect(after).toBeDefined();
  // A valid document whose title is "名前" encoded as Shift_JIS: the bytes are not valid UTF-8.
  const bytes = Buffer.concat([Buffer.from(before!), Buffer.from([0x22, 0x96, 0xbc, 0x91, 0x4f, 0x22]), Buffer.from(after!)]);
  await page.locator("input[type=file]").first().setInputFiles({ name: "sjis.tcd", mimeType: "application/json", buffer: bytes });
  await expect(page.getByText(/Could not decode document/).first()).toBeVisible();
  await expect(page.getByTestId("titlebar-document-title")).not.toContainText("�");
});

test("an unsupported old format version is not called newer than the editor", async ({ page }) => {
  await page.setViewportSize({ width: 1500, height: 900 });
  await page.goto("/?transaction-demo");
  await expect(page.locator(".view-mode")).toBeVisible();
  await page.locator("input[type=file]").first().setInputFiles({ name: "old.tcd", mimeType: "application/json", buffer: Buffer.from('{"formatVersion":0}') });
  const dialog = page.getByTestId("compatibility-dialog");
  if (await dialog.count()) await expect(dialog).not.toContainText("newer than this editor");
});

test("corrupt Recent metadata does not turn Recent into an Open failure", async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.setItem("timing-chart-v2.recent-meta", "{not json"); } catch { /* storage blocked */ } });
  await page.setViewportSize({ width: 1500, height: 900 });
  await page.goto("/?transaction-demo");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  await page.locator(".ribbon").getByRole("button", { name: "Recent", exact: true }).click();
  await expect(page.getByText(/No recent document is available/).first()).toBeVisible();
  await expect(page.getByText(/Open recent document failed/)).toHaveCount(0);
});

test("Enter that confirms an IME conversion does not commit an inline rename", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  const revision = await host.getAttribute("data-canonical-revision");
  const name = page.getByTestId("inspector").getByLabel("Inspector signal name", { exact: true });
  await name.fill("へんかん");
  await name.evaluate((input) => input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true, isComposing: true })));
  await expect(host).toHaveAttribute("data-canonical-revision", revision!);
  await name.fill("変換");
  await name.press("Enter");
  await expect(host).not.toHaveAttribute("data-canonical-revision", revision!);
});
