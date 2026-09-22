import { expect, test } from "@playwright/test";
import { startInCycleSample } from "./cycle-startup.js";

startInCycleSample(test);

for (const width of [1672, 1000]) {
  test(`Left Tree and frozen badges share geometry at ${width}px`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width, height: 941 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    await page.goto("/?visual-reference");
    await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
    const result = await page.evaluate(() => {
      const presentations = ["input", "output", "internal", "comment"] as const;
      const rows = presentations.map((presentation) => {
        const leftSelector = presentation === "comment" ? "[data-role='left-row'][data-kind='comment']" : `[data-role='left-row'][data-signal-role='${presentation}']:not([data-kind='comment'])`;
        const frozenSelector = presentation === "comment" ? "[data-role='frozen-row'][data-kind='comment']" : `[data-role='frozen-row'][data-signal-role='${presentation}']:not([data-kind='comment'])`;
        const left = document.querySelector<HTMLElement>(`${leftSelector} [data-role='tree-signal-role']`);
        const frozen = document.querySelector<HTMLElement>(`${frozenSelector} [data-role='signal-role']`);
        if (!left || !frozen) return { presentation, missing: true };
        const leftStyle = getComputedStyle(left);
        const frozenStyle = getComputedStyle(frozen);
        const row = left.closest<HTMLElement>("[data-role='left-row']")!;
        const name = row.querySelector<HTMLElement>("[data-role='tree-signal-name']")!;
        const badgeBox = left.getBoundingClientRect();
        const nameBox = name.getBoundingClientRect();
        return {
          presentation,
          missing: false,
          left: { width: leftBox(left).width, height: leftBox(left).height, radius: leftStyle.borderRadius, fontSize: leftStyle.fontSize, fontWeight: leftStyle.fontWeight, background: leftStyle.backgroundColor, color: leftStyle.color },
          frozen: { width: leftBox(frozen).width, height: leftBox(frozen).height, radius: frozenStyle.borderRadius, fontSize: frozenStyle.fontSize, fontWeight: frozenStyle.fontWeight, background: frozenStyle.backgroundColor, color: frozenStyle.color },
          noOverlap: nameBox.left >= badgeBox.right,
          gap: Math.round((nameBox.left - badgeBox.right) * 100) / 100,
          commentFilled: presentation !== "comment" || left.querySelector("path")?.getAttribute("fill") === "#f1dcff",
        };
      });
      function leftBox(element: HTMLElement) { const box = element.getBoundingClientRect(); return { width: Math.round(box.width), height: Math.round(box.height) }; }
      return rows;
    });
    console.log(JSON.stringify({ width, result }));
    expect(result.every((item) => !item.missing)).toBe(true);
    expect(result.every((item) => !item.missing && JSON.stringify(item.left) === JSON.stringify(item.frozen))).toBe(true);
    expect(result.every((item) => !item.missing && item.noOverlap && item.gap >= 0 && item.commentFilled)).toBe(true);
    await context.close();
  });
}
