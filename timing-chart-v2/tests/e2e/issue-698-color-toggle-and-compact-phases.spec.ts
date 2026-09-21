import { expect, test } from "@playwright/test";

// #698 closure-audit gaps: compact "Use group color" toggle (unavailable for Ungrouped) and an Inspector-specific Phase row whose primary
// controls all fit inside the Inspector at both locked viewports.
for (const size of [{ width: 1672, height: 941 }, { width: 1280, height: 720 }]) {
  test(`Inspector Phase controls stay inside the Inspector and colour uses an inline toggle at ${size.width}x${size.height}`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.goto("/?transaction-demo");
    await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
    await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
    await page.getByTestId("transaction-left-tree-row-demo_txn_read").click();
    const inspector = page.getByTestId("inspector");
    const editor = inspector.getByTestId("inspector-phase-editor");
    await expect(editor).toBeVisible();
    const history = await page.getByTestId("history-status").innerText();

    // Geometry: name, start, end, duration and Delete of every row are inside Inspector.clientWidth; the panel does not scroll sideways.
    const fit = await inspector.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const bad: string[] = [];
      element.querySelectorAll<HTMLElement>("[data-testid='inspector-phase-editor'] .transaction-bottom-phase-row:not(.transaction-bottom-phase-head) :is(input, button, .phase-cell)").forEach((control) => {
        const rect = control.getBoundingClientRect();
        if (rect.width > 0 && (rect.left < box.left - 1 || rect.right > box.left + element.clientWidth + 1)) bad.push(`${control.getAttribute("aria-label") ?? control.className}:${Math.round(rect.left)}-${Math.round(rect.right)} vs ${Math.round(box.left)}-${Math.round(box.left + element.clientWidth)}`);
      });
      return { bad, overflowX: element.scrollWidth - element.clientWidth };
    });
    expect(fit.bad).toEqual([]);
    expect(fit.overflowX).toBeLessThanOrEqual(1);
    await expect(editor.locator(".transaction-bottom-phase-row .phase-cell").first()).toBeVisible();
    // Same session draft as the Bottom editor is preserved (the shared-draft guard lives in issue-698-inspector-phases).

    // Colour: swatch + inline checkbox (no large "Use Group Color" push button).
    await expect(inspector.getByRole("button", { name: "Use Group Color" })).toHaveCount(0);
    const useGroup = inspector.getByTestId("transaction-use-group-color");
    await expect(useGroup).toBeEnabled();
    const swatch = inspector.getByLabel("Transaction color");
    // Turn inheritance on: the swatch shows the Group colour; turn it off and pick an own colour; turn it on again.
    await useGroup.check();
    await expect(useGroup).toBeChecked();
    const inherited = await swatch.inputValue();
    await useGroup.uncheck();
    await expect(useGroup).not.toBeChecked();
    await swatch.fill("#aa3366");
    await expect(swatch).toHaveValue("#aa3366");
    await useGroup.check();
    await expect(swatch).toHaveValue(inherited);
    await expect(page.getByTestId("history-status")).toHaveText(history);

    // Ungrouped Transactions cannot inherit: the toggle is unavailable, not a dead button.
    await page.getByTestId("transaction-left-tree-row-demo_txn_other").click();
    await expect(inspector.getByTestId("transaction-use-group-color")).toBeDisabled();
    await expect(inspector.getByTestId("transaction-use-group-color")).not.toBeChecked();
    await expect(page.getByTestId("history-status")).toHaveText(history);
  });
}
