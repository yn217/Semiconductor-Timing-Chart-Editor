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
