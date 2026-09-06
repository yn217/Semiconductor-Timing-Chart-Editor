import { expect, test } from "@playwright/test";

// #396: the Timeline Ribbon's Range Edit "Preview" cell showed a single
// long "Selected [.,.) -> Target [.,.)" line that never fit its actual
// column width -- it wrapped, and the shared .ds-ribbon-number-input
// output's tight line-height then overlapped the wrapped lines on top of
// each other, making Selected/Target unreadable.

for (const viewport of [{ width: 1672, height: 941 }, { width: 1280, height: 720 }]) {
  test(`Range Edit's Selected/Target preview stays on two non-overlapping lines, fully inside its own box, at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
    await page.locator(".ribbon-tabs").getByRole("button", { name: "Timeline", exact: true }).click();

    // A destination value with different digit counts than the default,
    // to prove this isn't just "happens to fit today's default numbers".
    await page.getByLabel("Timeline destination").fill("123");

    const output = page.getByTestId("timeline-destination-summary");
    await expect(output).toContainText("Selected");
    await expect(output).toContainText("Target [123,");
    const outputBox = (await output.boundingBox())!;
    const lines = output.locator("span");
    await expect(lines).toHaveCount(2);
    const lineBoxes = await Promise.all((await lines.all()).map((line) => line.boundingBox()));
    const [first, second] = lineBoxes as [{ x: number; y: number; width: number; height: number }, { x: number; y: number; width: number; height: number }];

    // Each line's own glyph box is fully contained within the Preview
    // cell -- not clipped, not spilling past its edges.
    for (const line of [first, second]) {
      expect(line.x, JSON.stringify({ line, outputBox })).toBeGreaterThanOrEqual(outputBox.x - 1);
      expect(line.x + line.width, JSON.stringify({ line, outputBox })).toBeLessThanOrEqual(outputBox.x + outputBox.width + 1);
    }
    // The two lines never overlap vertically -- the exact #396 symptom.
    expect(first.y + first.height, JSON.stringify({ first, second })).toBeLessThanOrEqual(second.y + 0.5);

    // Delete/Duplicate/Move stay fully inside the Range Edit group, and no
    // two controls in that group overlap each other.
    const group = page.locator(".timeline-range-edit-group");
    const geometry = await group.evaluate((root) => {
      const box = root.getBoundingClientRect();
      const cells = [...root.children].map((child) => child.getBoundingClientRect());
      const overlaps = (a: DOMRect, b: DOMRect) => a.left < b.right - 0.5 && a.right > b.left + 0.5 && a.top < b.bottom - 0.5 && a.bottom > b.top + 0.5;
      const pairOverlap = cells.some((cell, index) => cells.slice(index + 1).some((other) => overlaps(cell, other)));
      return { cellsInside: cells.every((cell) => cell.left >= box.left - 1 && cell.right <= box.right + 1), pairOverlap };
    });
    expect(geometry).toEqual({ cellsInside: true, pairOverlap: false });

    // Ribbon height stays the same as every other tab (constraint F).
    const [rangeEditHeight, insertGroupHeight] = await Promise.all([
      group.evaluate((element) => element.getBoundingClientRect().height),
      page.locator(".timeline-insert-group").evaluate((element) => element.getBoundingClientRect().height),
    ]);
    expect(rangeEditHeight).toBeCloseTo(insertGroupHeight, 0);
  });
}

test("Delete/Duplicate/Move tooltips describe the actual resulting range, matching real Timeline command semantics", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Timeline", exact: true }).click();
  await page.getByLabel("Timeline range start").fill("2");
  await page.getByLabel("Timeline range end").fill("4");
  await page.getByLabel("Timeline destination").fill("8");

  const group = page.locator(".timeline-range-edit-group");
  await expect(group.getByRole("button", { name: "Delete range" })).toHaveAttribute("title", /Delete \[2,4\)/);
  await expect(group.getByRole("button", { name: "Duplicate to" })).toHaveAttribute("title", /\[2,4\).*\[8,10\)/);
  await expect(group.getByRole("button", { name: "Move to" })).toHaveAttribute("title", /Move \[2,4\) to start at 8/);
});
