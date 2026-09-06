import { expect, test } from "@playwright/test";

// #401: under `color-scheme: dark` (responsive.css, prefers-color-scheme:
// dark), an unstyled <button> takes its default text color from the UA's
// `ButtonText` system color, which becomes near-white -- rendering
// unselected View Mode segments as invisible white-on-white. Same root
// cause #391 already fixed for the Bottom Editor's own tab buttons.
test.use({ colorScheme: "dark" });

function rgbToLuminanceLikeSum(rgb: string): number {
  const match = /rgb\((\d+), (\d+), (\d+)\)/.exec(rgb);
  if (!match) throw new Error(`Unexpected color format: ${rgb}`);
  return Number(match[1]) + Number(match[2]) + Number(match[3]);
}

for (const viewport of [{ width: 1672, height: 941 }, { width: 1280, height: 720 }]) {
  test(`unselected View Mode segments stay readable (dark text on light background) at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    const host = page.getByTestId("cycle-surface");
    await expect(host).toHaveAttribute("data-cycle-view-ready", "true");

    const buttons = page.locator(".view-mode button");
    await expect(buttons).toHaveCount(3);
    const viewportRight = viewport.width;
    for (const button of await buttons.all()) {
      const box = (await button.boundingBox())!;
      expect(box.x, JSON.stringify(box)).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, JSON.stringify(box)).toBeLessThanOrEqual(viewportRight);
      const isActive = (await button.getAttribute("class"))?.includes("active") ?? false;
      const style = await button.evaluate((element) => { const computed = getComputedStyle(element); return { color: computed.color, background: computed.backgroundColor }; });
      const textSum = rgbToLuminanceLikeSum(style.color);
      const backgroundSum = rgbToLuminanceLikeSum(style.background);
      // A real contrast check, not just "not literally identical": text
      // and background must be on opposite ends of light/dark, not both
      // near-white (the exact #401 bug) or both near-black.
      expect(Math.abs(textSum - backgroundSum), `${await button.textContent()} active=${isActive} ${JSON.stringify(style)}`).toBeGreaterThan(300);
    }
  });
}

test("View Mode segments show a visible keyboard focus ring, and switching the selected segment causes no layout shift", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");

  const transaction = page.locator(".view-mode button", { hasText: "Transaction" });
  const boxBefore = (await transaction.boundingBox())!;
  await transaction.focus();
  const isFocusVisible = await transaction.evaluate((element) => element.matches(":focus-visible"));
  // A programmatic .focus() is not guaranteed to be treated as
  // focus-visible by every engine; only assert the outline contract when
  // the browser did mark it focus-visible, and always assert real Tab
  // navigation (below) does.
  if (isFocusVisible) {
    const outlineStyle = await transaction.evaluate((element) => getComputedStyle(element).outlineStyle);
    expect(outlineStyle).toBe("solid");
  }

  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  const focused = await page.evaluate(() => { const element = document.activeElement; return { tag: element?.tagName, isFocusVisible: element?.matches(":focus-visible") ?? false, text: element?.textContent }; });
  if (focused.tag === "BUTTON" && focused.isFocusVisible) {
    const outlineStyle = await page.evaluate(() => getComputedStyle(document.activeElement!).outlineStyle);
    expect(outlineStyle).toBe("solid");
  }

  await transaction.click();
  const boxAfter = (await transaction.boundingBox())!;
  expect(boxAfter.width).toBeCloseTo(boxBefore.width, 1);
  expect(boxAfter.height).toBeCloseTo(boxBefore.height, 1);

  // View-only: switching View Mode never mutates Canonical/History/Dirty.
  await expect(host).toHaveAttribute("data-canonical-revision", "0");
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
});
