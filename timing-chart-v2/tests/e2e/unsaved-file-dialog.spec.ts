import { expect, test } from "@playwright/test";
import { canonicalFixture } from "../fixtures/canonical";

async function makeDirty(page: import("@playwright/test").Page) {
  const host = page.getByTestId("cycle-surface");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  const name = page.getByTestId("signal-editor").getByLabel("Signal name");
  await name.fill("UNSAVED_REQUEST");
  await name.press("Enter");
  await expect(page.getByTestId("dirty-status")).toHaveText("Modified");
}

test("dirty New uses Cancel and Discard without losing the current document", async ({ page }) => {
  await page.goto("/");
  await makeDirty(page);
  const host = page.getByTestId("cycle-surface");
  const beforeRevision = await host.getAttribute("data-canonical-revision");
  const beforeName = await page.getByTestId("signal-editor").getByLabel("Signal name").inputValue();

  await page.getByRole("button", { name: "File", exact: true }).click();
  const newButton = page.getByTestId("ribbon").getByRole("button", { name: "New", exact: true });
  await newButton.click();
  const dialog = page.getByTestId("unsaved-file-dialog");
  await expect(dialog).toBeVisible();
  await expect(page.getByTestId("unsaved-cancel")).toBeFocused();
  await page.getByTestId("unsaved-cancel").click();
  await expect(dialog).toHaveCount(0);
  await expect(newButton).toBeFocused();
  await expect(host).toHaveAttribute("data-canonical-revision", beforeRevision!);
  await expect(page.getByTestId("signal-editor").getByLabel("Signal name")).toHaveValue(beforeName);
  await expect(page.getByTestId("dirty-status")).toHaveText("Modified");

  await newButton.click();
  await page.getByTestId("unsaved-discard").click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId("dirty-status")).toHaveText("Clean");
});

test("dirty Open uses Save before replacing the document", async ({ page }) => {
  await page.goto("/");
  await makeDirty(page);
  await page.getByRole("button", { name: "File", exact: true }).click();
  const openButton = page.getByTestId("ribbon").getByRole("button", { name: "Open", exact: true });
  const fixtureText = JSON.stringify(canonicalFixture());
  await page.locator("input[accept='.json,.tcd']").setInputFiles({ name: "replacement.tcd.json", mimeType: "application/json", buffer: Buffer.from(fixtureText) });
  const dialog = page.getByTestId("unsaved-file-dialog");
  await expect(dialog).toBeVisible();
  await page.getByTestId("unsaved-save").click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId("dirty-status")).toHaveText("Clean");
  await expect(page.locator(".app-titlebar h1")).toHaveText(canonicalFixture().document.title);
  await expect(openButton).toBeVisible();
});

test("Save As failure keeps the exact revision dirty and leaves the dialog open", async ({ page }) => {
  await page.goto("/");
  await makeDirty(page);
  await page.evaluate(() => {
    HTMLAnchorElement.prototype.click = () => { throw new Error("download unavailable"); };
  });

  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Save As", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Save As" });
  await dialog.getByLabel("Save As filename").fill("failed-save");
  await dialog.getByTestId("save-as-submit").click();

  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Save As filename")).toHaveValue("failed-save");
  await expect(page.getByTestId("dirty-status")).toHaveText("Modified");
  await expect(dialog.getByRole("alert")).toHaveText("Save failed. The document remains modified.");
});

test("concurrent Open requests are latest-request-wins", async ({ page }) => {
  await page.addInitScript(() => {
    const nativeText = Blob.prototype.text;
    const resolvers: Record<string, () => void> = {};
    Object.assign(globalThis, { __openReadResolvers: resolvers });
    File.prototype.text = function () {
      const file = this;
      return new Promise<string>((resolve, reject) => {
        resolvers[file.name] = () => { void nativeText.call(file).then(resolve, reject); };
      });
    };
  });
  await page.goto("/");
  const input = page.locator("input[accept='.json,.tcd']");
  const documentA = canonicalFixture();
  const documentB = canonicalFixture();
  documentA.document.title = "Slow A";
  documentB.document.title = "Latest B";

  await input.setInputFiles({ name: "slow-a.tcd", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(documentA)) });
  await input.setInputFiles({ name: "latest-b.tcd", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(documentB)) });
  await page.evaluate(() => (globalThis as typeof globalThis & { __openReadResolvers: Record<string, () => void> }).__openReadResolvers["latest-b.tcd"]?.());
  await expect(page.locator(".app-titlebar h1")).toHaveText("Latest B");
  await page.evaluate(() => (globalThis as typeof globalThis & { __openReadResolvers: Record<string, () => void> }).__openReadResolvers["slow-a.tcd"]?.());
  await page.waitForTimeout(100);
  await expect(page.locator(".app-titlebar h1")).toHaveText("Latest B");
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
});

test("Open atomically clears document-scoped selection, pin, filter and timeline state", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_ready']").click({ modifiers: ["Control"] });
  await expect(page.getByTestId("selection-status")).toHaveText("2 signals");
  await page.getByTestId("bottom-pin").click();
  await expect(page.getByTestId("bottom-pin")).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("signal-tree-search-top").fill("REQUEST");
  await page.getByTestId("cycle-status").click();

  const replacement = canonicalFixture();
  replacement.document.title = "Replacement B";
  await page.locator("input[accept='.json,.tcd']").setInputFiles({ name: "replacement-b.tcd", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(replacement)) });
  await expect(host).toHaveAttribute("data-editor-idle", "true");

  await expect(page.locator(".app-titlebar h1")).toHaveText("Replacement B");
  await expect(page.getByTestId("selection-status")).toContainText("None");
  await expect(page.getByTestId("bottom-pin")).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByTestId("signal-tree-search-top")).toHaveValue("");
  await expect(page.getByTestId("range-status")).toHaveText("Range: [0, 1)");
  await expect(page.getByTestId("cycle-status")).toHaveText("Cycle 0");
});
