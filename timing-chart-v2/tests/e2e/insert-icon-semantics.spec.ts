import { expect, test } from "@playwright/test";

for (const viewport of [{ width: 1672, height: 941 }, { width: 1280, height: 720 }]) {
  test(`uses deterministic semantic Insert icons at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
    await page.locator(".ribbon-tabs").getByRole("button", { name: "Insert", exact: true }).click();
    const insert = page.getByTestId("insert-ribbon");
    const contract = await insert.locator("[data-insert-icon]").evaluateAll((icons) => icons.map((icon) => ({
      kind: icon.getAttribute("data-insert-icon"),
      useCount: icon.querySelectorAll("use").length,
      textCount: [...icon.childNodes].filter((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim()).length,
      pathCount: icon.querySelectorAll("path").length,
      signature: [...icon.querySelectorAll("path")].map((path) => path.getAttribute("d")).join("|"),
      box: [icon.getBoundingClientRect().width, icon.getBoundingClientRect().height],
    })));
    expect(contract.map((item) => item.kind)).toEqual(["signal", "clock", "bus", "state", "event", "pulse", "marker", "range", "text", "dependency", "measurement", "highlight", "bracket", "verticalLine"]);
    expect(contract.every((item) => item.useCount === 0 && item.textCount === 0 && item.pathCount > 0 && item.box[0] > 0 && item.box[0] === item.box[1])).toBe(true);
    expect(new Set(contract.map((item) => item.box.join("x"))).size).toBe(1);
    const byKind = Object.fromEntries(contract.map((item) => [item.kind, item]));
    expect(new Set(contract.map((item) => item.signature)).size).toBe(contract.length);
    expect(byKind.clock.signature).not.toContain("a");
    expect(byKind.clock.signature).not.toBe(byKind.pulse.signature);
    expect(byKind.state.signature).not.toBe(byKind.pulse.signature);
    expect(byKind.event.signature).not.toBe(byKind.state.signature);
    expect(byKind.text.pathCount).toBeGreaterThanOrEqual(2);
    const layout = await insert.evaluate((root) => {
      const box = root.getBoundingClientRect();
      const buttons = [...root.querySelectorAll<HTMLButtonElement>("button")];
      return { overflow: root.scrollWidth > root.clientWidth, buttonsInside: buttons.every((button) => { const rect = button.getBoundingClientRect(); return rect.left >= box.left - 1 && rect.right <= box.right + 1; }) };
    });
    expect(layout).toEqual({ overflow: false, buttonsInside: true });
  });
}

test("keeps semantic Insert icons crisp at higher device scale", async ({ browser }, testInfo) => {
  const context = await browser.newContext({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 2 });
  try {
    const page = await context.newPage();
    await page.goto("/");
    await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
    await page.locator(".ribbon-tabs").getByRole("button", { name: "Insert", exact: true }).click();
    const insert = page.getByTestId("insert-ribbon");
    expect(await page.evaluate(() => window.devicePixelRatio)).toBe(2);
    const boxes = await insert.locator("[data-insert-icon]").evaluateAll((icons) => icons.map((icon) => {
      const box = icon.getBoundingClientRect();
      return { width: box.width, height: box.height, clipped: icon.scrollWidth < icon.clientWidth || icon.scrollHeight < icon.clientHeight };
    }));
    expect(boxes.length).toBe(14);
    expect(boxes.every((box) => box.width === 18 && box.height === 18 && !box.clipped)).toBe(true);
    await testInfo.attach("insert-ribbon-dpr2.png", { body: await insert.screenshot(), contentType: "image/png" });
  } finally {
    await context.close();
  }
});
