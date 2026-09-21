import { expect, test } from "@playwright/test";

// #737 selection grammar in the Bottom Transaction grid (both viewports): click, Ctrl/Cmd+click toggle, Shift+click contiguous range in visible
// order (including under a filter), Ctrl+A selects all visible only outside text inputs; selection is view-only.
for (const viewport of [{ width: 1672, height: 941 }, { width: 1280, height: 720 }]) {
  test(`Bottom grid selection gestures at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize(viewport);
    await page.goto("/?transaction-demo");
    await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
    await page.locator(".bottom-tabs").getByRole("tab", { name: "Transaction", exact: true }).click();
    const editor = page.getByTestId("bottom-editor");
    const rows = editor.locator(".transaction-list-row > button[data-selected], .transaction-list-row > .transaction-list-row-editor[data-selected]");
    const total = await rows.count();
    expect(total).toBeGreaterThanOrEqual(4);
    const selected = () => editor.locator(".transaction-list-row > [data-selected='true']").count();
    const history = await page.getByTestId("history-status").innerText();
    const revision = await page.getByTestId("cycle-surface").getAttribute("data-canonical-revision");

    await rows.nth(0).click();
    expect(await selected()).toBe(1);
    await rows.nth(2).click({ modifiers: ["Control"] });
    expect(await selected()).toBe(2);
    // Row 2 is now the primary (rendered as its inline editor); Ctrl+click the non-primary row 0 to toggle it out of the set.
    await rows.nth(0).click({ modifiers: ["Control"] });
    expect(await selected()).toBe(1);
    // Shift+click: contiguous range from the anchor in visible order.
    await rows.nth(0).click();
    await rows.nth(3).click({ modifiers: ["Shift"] });
    expect(await selected()).toBe(4);
    // Filtered visible order: the range covers only visible rows.
    await editor.getByTestId("transaction-list-search").fill("_0");
    const visible = await rows.count();
    await rows.nth(0).click();
    await rows.nth(visible - 1).click({ modifiers: ["Shift"] });
    expect(await selected()).toBe(visible);
    await editor.getByTestId("transaction-list-search").fill("");
    // Ctrl+A on the grid selects everything; inside the search input it must NOT hijack.
    await rows.nth(0).click();
    await rows.nth(0).focus();
    await page.keyboard.press("Control+a");
    expect(await selected()).toBe(total);
    // Reset to a single selection through the Tree (the primary row is an inline editor, so clicking it does not narrow the set).
    await page.getByTestId("transaction-left-tree-row-demo_txn_read").click();
    expect(await selected()).toBe(1);
    await editor.getByTestId("transaction-list-search").focus();
    await page.keyboard.press("Control+a");
    expect(await selected()).toBe(1);
    // Selection is view-only.
    await expect(page.getByTestId("history-status")).toHaveText(history);
    expect(await page.getByTestId("cycle-surface").getAttribute("data-canonical-revision")).toBe(revision);
    expect(errors).toEqual([]);
  });
}

// #737 section 16: selected rows expose aria-selected, expandable parents expose aria-expanded with an Expand/Collapse name, and selection /
// hierarchy are not conveyed by colour alone (selected rows carry a non-colour marker: aria-selected + data-selected + outline/ background).
test("Bottom grid exposes aria-selected and aria-expanded with named disclosure controls", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/?transaction-demo");
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  await page.locator(".bottom-tabs").getByRole("tab", { name: "Transaction", exact: true }).click();
  const editor = page.getByTestId("bottom-editor");
  const disclosure = editor.locator(".transaction-disclosure-slot[aria-expanded]").first();
  await expect(disclosure).toHaveAttribute("aria-label", /^(Expand|Collapse) phases for /);
  await expect(disclosure).toHaveAttribute("aria-expanded", "false");
  await disclosure.click();
  await expect(disclosure).toHaveAttribute("aria-expanded", "true");
  await expect(disclosure).toHaveAttribute("aria-label", /^Collapse phases for /);
  await expect(editor.locator("[data-transaction-phase-row-id]").first()).toBeVisible();
  const rows = editor.locator(".transaction-list-row > button[data-selected]");
  await rows.nth(1).click();
  const selectedRows = editor.locator(".transaction-list-row > [data-selected='true']");
  await expect(selectedRows.first()).toBeVisible();
  const marker = await editor.locator(".transaction-list-row > [data-selected='true']").first().evaluate((el) => { const s = getComputedStyle(el); return { outline: s.outlineStyle, weight: s.fontWeight, ariaSelected: el.getAttribute("aria-selected"), border: s.borderTopColor }; });
  const plain = await editor.locator(".transaction-list-row > button[data-selected='false']").first().evaluate((el) => { const s = getComputedStyle(el); return { outline: s.outlineStyle, weight: s.fontWeight, ariaSelected: el.getAttribute("aria-selected"), border: s.borderTopColor }; });
  expect(plain.ariaSelected).toBe("false");
  // Not colour alone: aria-selected differs, and at least one non-fill visual property (outline, weight or border) differs from an unselected row.
  expect(marker.outline !== plain.outline || marker.weight !== plain.weight || marker.border !== plain.border).toBe(true);
});
