import { expect, test } from "@playwright/test";
import { canonicalFixture } from "../fixtures/canonical";

// Bottom Panel Visual Reference pass (#402/#426): Name moved to Inspector
// (its sole owner now) -- Bottom's own duplicate Name field was removed.
async function makeDirty(page: import("@playwright/test").Page) {
  const host = page.getByTestId("cycle-surface");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  const name = page.getByTestId("inspector").getByLabel("Inspector signal name", { exact: true });
  await name.fill("UNSAVED_REQUEST");
  await name.press("Enter");
  await expect(page.getByTestId("dirty-status")).toHaveText("Modified");
}

test("dirty New uses Cancel and Discard without losing the current document", async ({ page }) => {
  await page.goto("/");
  await makeDirty(page);
  const host = page.getByTestId("cycle-surface");
  const beforeRevision = await host.getAttribute("data-canonical-revision");
  const beforeName = await page.getByTestId("inspector").getByLabel("Inspector signal name", { exact: true }).inputValue();

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
  await expect(page.getByTestId("inspector").getByLabel("Inspector signal name", { exact: true })).toHaveValue(beforeName);
  await expect(page.getByTestId("dirty-status")).toHaveText("Modified");

  await newButton.click();
  await page.getByTestId("unsaved-discard").click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId("dirty-status")).toHaveText("Clean");
  await expect(page.locator(".app-titlebar h1")).toHaveText("Untitled Timing Chart");
  await expect(page.getByTestId("signal-count-status")).toHaveText("Signals: 8");
  await expect(host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']")).toContainText("REQUEST");
});

// #208: Escape on the unsaved-changes dialog itself must behave exactly
// like clicking Cancel -- preserve the current document exactly, and
// restore focus to a safe default (the button that opened the dialog),
// not just close the dialog and leave focus stranded.
test("Escape on the unsaved-changes dialog behaves exactly like Cancel", async ({ page }) => {
  await page.goto("/");
  await makeDirty(page);
  const host = page.getByTestId("cycle-surface");
  const beforeRevision = await host.getAttribute("data-canonical-revision");
  const beforeName = await page.getByTestId("inspector").getByLabel("Inspector signal name", { exact: true }).inputValue();

  await page.getByRole("button", { name: "File", exact: true }).click();
  const newButton = page.getByTestId("ribbon").getByRole("button", { name: "New", exact: true });
  await newButton.click();
  const dialog = page.getByTestId("unsaved-file-dialog");
  await expect(dialog).toBeVisible();
  await expect(page.getByTestId("unsaved-cancel")).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(newButton).toBeFocused();
  await expect(host).toHaveAttribute("data-canonical-revision", beforeRevision!);
  await expect(page.getByTestId("inspector").getByLabel("Inspector signal name", { exact: true })).toHaveValue(beforeName);
  await expect(page.getByTestId("dirty-status")).toHaveText("Modified");
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
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

test("dirty Open keeps the current document on Cancel and replaces it on Discard", async ({ page }) => {
  await page.goto("/");
  await makeDirty(page);
  const host = page.getByTestId("cycle-surface");
  const beforeRevision = await host.getAttribute("data-canonical-revision");
  const replacement = canonicalFixture();
  replacement.document.title = "Discarded Into Replacement";
  const file = { name: "dirty-open.tcd", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(replacement)) };
  const input = page.locator("input[accept='.json,.tcd']");

  await input.setInputFiles(file);
  await expect(page.getByTestId("unsaved-file-dialog")).toBeVisible();
  await page.getByTestId("unsaved-cancel").click();
  await expect(page.getByTestId("unsaved-file-dialog")).toHaveCount(0);
  await expect(host).toHaveAttribute("data-canonical-revision", beforeRevision!);
  await expect(page.getByTestId("inspector").getByLabel("Inspector signal name", { exact: true })).toHaveValue("UNSAVED_REQUEST");
  await expect(page.getByTestId("dirty-status")).toHaveText("Modified");

  await input.setInputFiles(file);
  await page.getByTestId("unsaved-discard").click();
  await expect(page.getByTestId("unsaved-file-dialog")).toHaveCount(0);
  await expect(page.locator(".app-titlebar h1")).toHaveText("Discarded Into Replacement");
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
  await expect(page.getByTestId("dirty-status")).toHaveText("Clean");
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

test("Open resets entity-keyed Transaction bulk selection and Bottom pin across colliding document IDs", async ({ page }) => {
  await page.goto("/");
  const makeDocument = (title: string) => {
    const document = canonicalFixture();
    document.document.title = title;
    document.transactions = [{ id: "tx_shared", name: "Shared Transaction", start: 1, end: 3, laneId: "lane_0" }];
    return document;
  };
  const open = async (document: ReturnType<typeof makeDocument>, filename: string) => {
    await page.locator("input[accept='.json,.tcd']").setInputFiles({ name: filename, mimeType: "application/json", buffer: Buffer.from(JSON.stringify(document)) });
    await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true");
  };

  await open(makeDocument("Document A"), "document-a.tcd");
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  await page.getByRole("tab", { name: "Transaction", exact: true }).click();
  await page.getByLabel("Select Shared Transaction", { exact: true }).check();
  await expect(page.getByTestId("transaction-bulk-count")).toHaveText("1 selected");
  await page.getByTestId("bottom-pin").click();
  await expect(page.getByTestId("bottom-pin")).toHaveAttribute("aria-pressed", "true");

  await open(makeDocument("Document B"), "document-b.tcd");
  await expect(page.locator(".app-titlebar h1")).toHaveText("Document B");
  await expect(page.getByLabel("Select Shared Transaction", { exact: true })).not.toBeChecked();
  await expect(page.getByTestId("transaction-bulk-toolbar")).toHaveCount(0);
  await expect(page.getByTestId("bottom-pin")).toHaveAttribute("aria-pressed", "false");
});

test("Open discards an entity-keyed Inspector draft when the replacement document reuses the ID", async ({ page }) => {
  await page.goto("/");
  const makeDocument = (title: string, transactionName: string) => {
    const document = canonicalFixture();
    document.document.title = title;
    document.transactions = [{ id: "tx_shared", name: transactionName, start: 1, end: 3, laneId: "lane_0" }];
    return document;
  };
  const open = async (document: ReturnType<typeof makeDocument>, filename: string) => {
    await page.locator("input[accept='.json,.tcd']").setInputFiles({ name: filename, mimeType: "application/json", buffer: Buffer.from(JSON.stringify(document)) });
    await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true");
  };

  await open(makeDocument("Document A", "A Transaction"), "draft-a.tcd");
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  await page.getByTestId("transaction-lanes").locator("[data-transaction-id='tx_shared']").click();
  const inspectorName = page.getByTestId("inspector").getByLabel("Transaction name", { exact: true });
  await inspectorName.fill("A Draft Only");
  await expect(page.getByTestId("dirty-status")).toHaveText("Clean");

  await open(makeDocument("Document B", "B Transaction"), "draft-b.tcd");
  await page.getByTestId("transaction-lanes").locator("[data-transaction-id='tx_shared']").click();
  await expect(page.getByTestId("inspector").getByLabel("Transaction name", { exact: true })).toHaveValue("B Transaction");
  await expect(page.getByTestId("dirty-status")).toHaveText("Clean");
});

test("Open resets the independent Bookmark selection when the replacement document reuses the ID", async ({ page }) => {
  await page.goto("/");
  const makeDocument = (title: string, bookmarkName: string) => {
    const document = canonicalFixture();
    document.document.title = title;
    document.bookmarks = [{ id: "bookmark_shared", name: bookmarkName, start: 2 }];
    return document;
  };
  const open = async (document: ReturnType<typeof makeDocument>, filename: string) => {
    await page.locator("input[accept='.json,.tcd']").setInputFiles({ name: filename, mimeType: "application/json", buffer: Buffer.from(JSON.stringify(document)) });
    await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true");
  };

  await open(makeDocument("Document A", "A Bookmark"), "bookmark-a.tcd");
  await page.getByRole("tab", { name: "Bookmarks", exact: true }).click();
  await page.getByTestId("bookmark-row-bookmark_shared").click();
  await expect(page.getByTestId("bookmark-editor-panel")).toContainText("Editing: A Bookmark");

  await open(makeDocument("Document B", "B Bookmark"), "bookmark-b.tcd");
  await expect(page.getByTestId("bookmark-row-bookmark_shared")).toHaveAttribute("data-selected", "false");
  await page.getByTestId("bookmark-row-bookmark_shared").click();
  await expect(page.getByTestId("bookmark-editor-panel")).toContainText("Editing: B Bookmark");
});

test("future format opens a source-preserving read-only Compatibility Mode", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  const originalTitle = await page.locator(".app-titlebar h1").textContent();
  const originalRevision = await host.getAttribute("data-canonical-revision");
  const futureSource = JSON.stringify({ formatVersion: 99, document: { id: "future", title: "Future Document" }, futureField: { mustRemain: true } }, null, 2);

  await page.locator("input[accept='.json,.tcd']").setInputFiles({ name: "future.tcd", mimeType: "application/json", buffer: Buffer.from(futureSource) });
  const dialog = page.getByTestId("compatibility-dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Format version 99");
  await expect(dialog.getByLabel("Compatibility source")).toHaveValue(futureSource);
  await expect(page.locator(".app-titlebar h1")).toHaveText(originalTitle!);
  await expect(host).toHaveAttribute("data-canonical-revision", originalRevision!);

  await dialog.getByTestId("compatibility-read-only").click();
  await expect(dialog.getByRole("status")).toHaveText("Read-only Compatibility Mode active");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(".app-titlebar h1")).toHaveText(originalTitle!);
  await expect(host).toHaveAttribute("data-canonical-revision", originalRevision!);
  await expect(page.getByTestId("dirty-status")).toHaveText("Clean");
});
