import { expect, test } from "@playwright/test";

// The Signal pane ends at the Bottom editor's edge and scrolls vertically, so the last Signal row can be brought above the editor.
test("Combined Signal rows scroll into view above the Bottom editor", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto("/");
  await page.locator(".view-mode").getByRole("button", { name: "Combined", exact: true }).click();
  const content = page.locator(".split-signal-content");
  const bottomTop = (await page.locator(".bottom-editor").boundingBox())!.y;
  const box = (await content.boundingBox())!;
  expect(box.y + box.height).toBeLessThanOrEqual(bottomTop + 2);
  await page.mouse.move(box.x + 600, box.y + 60);
  await page.mouse.wheel(0, 1000);
  const state = content.getByText("STATE", { exact: true }).last();
  await expect.poll(async () => { const b = await state.boundingBox(); return b !== null && b.y + b.height <= bottomTop && b.y >= box.y; }).toBe(true);
});
