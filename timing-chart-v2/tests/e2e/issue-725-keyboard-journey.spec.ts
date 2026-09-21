import { expect, test } from "@playwright/test";

// #725 keyboard-only journey: select row -> F2 -> Tab follows the visible column order -> draft stays uncommitted -> Escape reverts.
for (const viewport of [{ width: 1672, height: 941 }, { width: 1280, height: 720 }]) {
  test(`Bottom grid keyboard editing journey at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/?transaction-demo");
    await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
    await page.locator(".bottom-tabs").getByRole("tab", { name: "Transaction", exact: true }).click();
    const bottom = page.getByTestId("bottom-editor");
    const history = () => page.getByTestId("history-status").innerText();
    const revision = () => page.getByTestId("cycle-surface").getAttribute("data-canonical-revision");
    const rowButton = bottom.locator(".transaction-list-row > button[data-selected]").first();
    await rowButton.click();
    const h0 = await history(); const r0 = await revision();
    await rowButton.focus();
    await page.keyboard.press("F2");
    const name = page.getByLabel("Bottom Transaction name");
    await expect(name).toBeFocused();
    // Tab order across the row editor follows the visible left-to-right column order.
    const visited: number[] = [];
    for (let step = 0; step < 4; step += 1) {
      const x = await page.evaluate(() => { const el = document.activeElement as HTMLElement | null; return el ? el.getBoundingClientRect().x : -1; });
      visited.push(x);
      await page.keyboard.press("Tab");
    }
    expect(visited.every((x) => x >= 0)).toBe(true);
    for (let index = 1; index < visited.length; index += 1) expect(visited[index]!, `tab step ${index}: ${visited.join(",")}`).toBeGreaterThanOrEqual(visited[index - 1]! - 1);
    // Draft remains uncommitted until Apply; Escape reverts.
    const original = await name.inputValue();
    await name.fill(`${original}_kb`);
    expect(await history()).toBe(h0);
    expect(await revision()).toBe(r0);
    await name.press("Escape");
    await expect(name).toHaveValue(original);
    expect(await history()).toBe(h0);
    expect(await revision()).toBe(r0);
  });
}
