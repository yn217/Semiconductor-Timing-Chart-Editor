import { expect, test } from "@playwright/test";

// #720: pointer/cursor feedback matches the interaction type, and disabled commands in the Ribbon/Bottom/Tree explain themselves.
for (const viewport of [{ width: 1672, height: 941 }, { width: 1280, height: 720 }]) {
  for (const mode of ["Cycle", "Transaction", "Combined"] as const) {
    test(`cursor and disabled-reason audit in ${mode} at ${viewport.width}x${viewport.height}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto("/?transaction-demo");
      await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
      await page.locator(".view-mode").getByRole("button", { name: mode, exact: true }).click();
      const result = await page.evaluate(() => {
        const problems: string[] = [];
        const label = (el: Element) => `${el.getAttribute("data-testid") ?? el.getAttribute("aria-label") ?? el.className.toString().slice(0, 30)}`;
        for (const control of Array.from(document.querySelectorAll<HTMLElement>("[data-testid='ribbon'] button, [data-testid='bottom-editor'] button, .left-column-heading button"))) {
          const rect = control.getBoundingClientRect(); if (rect.width === 0 || rect.height === 0) continue;
          const cursor = getComputedStyle(control).cursor;
          const disabled = (control as HTMLButtonElement).disabled || control.getAttribute("aria-disabled") === "true";
          if (!disabled && !["pointer", "default", "grab", "grabbing", "auto"].includes(cursor)) problems.push(`enabled ${label(control)} cursor=${cursor}`);
          if (!disabled && cursor === "text") problems.push(`button with text cursor: ${label(control)}`);
          if (disabled && !control.getAttribute("title") && !control.getAttribute("aria-describedby") && !control.getAttribute("aria-label")) problems.push(`disabled without explanation: ${label(control)}`);
          if (disabled && !["not-allowed", "default", "auto"].includes(cursor)) problems.push(`disabled ${label(control)} cursor=${cursor}`);
        }
        for (const cell of Array.from(document.querySelectorAll<HTMLElement>("[data-testid='bottom-editor'] input[type='text'], [data-testid='bottom-editor'] input:not([type])"))) {
          if (cell.getBoundingClientRect().width > 0 && getComputedStyle(cell).cursor !== "text") problems.push(`editable field ${label(cell)} cursor=${getComputedStyle(cell).cursor}`);
        }
        return problems;
      });
      expect(result, result.join("\n")).toEqual([]);
    });
  }
}
