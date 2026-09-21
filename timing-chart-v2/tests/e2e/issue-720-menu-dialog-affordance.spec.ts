import { expect, test } from "@playwright/test";

// #720: dialog-opening commands are marked (aria-haspopup=dialog or an ellipsis), menu commands expose aria-haspopup=menu + aria-expanded,
// and immediate commands do not claim either. Audited on every Ribbon tab.
for (const viewport of [{ width: 1672, height: 941 }, { width: 1280, height: 720 }]) {
  test(`Ribbon menu/dialog/immediate commands are distinguishable at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
    const problems: string[] = [];
    const tabs = await page.locator(".ribbon-tabs button").allInnerTexts();
    for (const tab of tabs) {
      await page.locator(".ribbon-tabs").getByRole("button", { name: tab, exact: true }).click();
      const found = await page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>("[data-testid='ribbon'] button")).filter((b) => b.getBoundingClientRect().width > 0).map((b) => ({
        name: b.getAttribute("aria-label") ?? b.textContent ?? "", text: (b.textContent ?? "").trim(), popup: b.getAttribute("aria-haspopup"), expanded: b.getAttribute("aria-expanded"), title: b.getAttribute("title") ?? "",
      })));
      for (const b of found) {
        const dialogish = /\.\.\.|…/.test(b.name + b.text + b.title);
        if (b.popup === "menu" && b.expanded === null) problems.push(`[${tab}] menu without aria-expanded: ${b.name}`);
        if (b.expanded !== null && b.popup === null && !/pressed/.test(b.name)) problems.push(`[${tab}] expandable without aria-haspopup: ${b.name}`);
        // Collapsed-group popovers (aria-haspopup=dialog + aria-expanded) are disclosure triggers, not dialog commands.
        if (b.popup === "dialog" && b.expanded === null && !dialogish && !/dialog|settings|export|import|open|save/i.test(b.name)) problems.push(`[${tab}] dialog command without ellipsis: ${b.name}`);
      }
    }
    expect(problems, problems.join("\n")).toEqual([]);
  });
}
