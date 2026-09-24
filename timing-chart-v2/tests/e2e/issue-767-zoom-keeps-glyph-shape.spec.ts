import { expect, test } from "@playwright/test";

// #767: in standalone Transaction, zoom re-lays the geometry out; nothing is CSS-scaled, so bar / Phase text keeps its natural size and aspect,
// the track's layout width is the scroll extent, and bar edges stay on the ruler ticks.
// Glyph size and zoom semantics do not depend on viewport width; responsive clipping/overflow has separate geometry acceptance.
for (const viewport of [{ width: 1280, height: 720 }]) {
  test(`zoom does not stretch Transaction text at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/?transaction-demo");
    await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
    await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
    await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
    const history = await page.getByTestId("history-status").innerText();
    const measure = () => page.evaluate(() => {
      const viewport = document.querySelector<HTMLElement>("[data-testid='cycle-viewport']")!;
      const track = document.querySelector<HTMLElement>(".transaction-track")!;
      const bar = document.querySelector<HTMLElement>(".transaction-track [data-transaction-id='demo_txn_read']")!;
      const label = bar.querySelector<HTMLElement>(":scope > span")!;
      const phase = bar.querySelector<HTMLElement>("[data-phase-segment]")!;
      const startCycle = Number(bar.getAttribute("data-source-cycle") ?? "");
      const barBox = bar.getBoundingClientRect();
      const ticks = Array.from(document.querySelectorAll<HTMLElement>("[data-testid='cycle-ruler'] .cycle-tick[data-source-cycle]"));
      const tick = ticks.find((candidate) => Number(candidate.dataset.sourceCycle) === 10);
      return {
        fontSize: getComputedStyle(label).fontSize, phaseFont: getComputedStyle(phase).fontSize, labelHeight: Math.round(label.getBoundingClientRect().height),
        trackLayout: Math.round(track.getBoundingClientRect().width), scrollWidth: viewport.scrollWidth, barLeft: barBox.left, tickLeft: tick?.getBoundingClientRect().left, startCycle,
      };
    });
    const base = await measure();
    for (const zoom of ["200", "400", "800"]) {
      await page.getByLabel("Zoom preset").selectOption(zoom);
      await expect.poll(async () => (await measure()).scrollWidth).toBeGreaterThan(base.scrollWidth);
      // React applies the zoom var after the ruler extent changes; wait until the single extent owner has settled.
      await expect.poll(async () => { const m = await measure(); return Math.abs(m.trackLayout - m.scrollWidth); }, { message: `${zoom}% track vs scroll` }).toBeLessThanOrEqual(2);
      const now = await measure();
      expect(now.fontSize).toBe(base.fontSize);
      expect(now.phaseFont).toBe(base.phaseFont);
      expect(now.labelHeight).toBe(base.labelHeight);
      // One extent owner: the track's layout width is the scroll extent.
      expect(Math.abs(now.trackLayout - now.scrollWidth), `${zoom}% track vs scroll`).toBeLessThanOrEqual(2);
      // Bar edges still land on the ruler tick for the same cycle.
      if (now.tickLeft !== undefined) expect(Math.abs(now.barLeft - now.tickLeft), `${zoom}% bar vs tick`).toBeLessThanOrEqual(2);
    }
    await expect(page.getByTestId("history-status")).toHaveText(history);
  });
}

// Real pointer drag at 400%: the pointer -> cycle conversion must follow the re-laid-out geometry (16px per cycle here), not a CSS transform.
test("dragging a Transaction edge at 400% zoom lands on the cycle under the pointer", async ({ page }) => {
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto("/?transaction-demo");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
  await page.getByLabel("Zoom preset").selectOption("400");
  const bar = page.locator(".transaction-track [data-transaction-id='demo_txn_read']");
  await expect.poll(async () => Math.round((await bar.boundingBox())!.width)).toBe(800);
  const box = (await bar.boundingBox())!;
  const perCycle = box.width / 50; // Read_0 spans cycles 10..60
  const endCycle = page.getByTestId("inspector").getByLabel("Transaction end");
  const handle = (await bar.locator("i[data-edge='end']").boundingBox())!;
  const startX = handle.x + handle.width / 2; const y = handle.y + handle.height / 2;
  const before = await page.getByTestId("history-status").innerText();
  await page.mouse.move(startX, y);
  await page.mouse.down();
  await page.mouse.move(startX + perCycle * 5, y, { steps: 6 });
  await page.mouse.up();
  await expect.poll(() => page.getByTestId("history-status").innerText()).not.toBe(before);
  // Assert the semantic result instead of re-deriving expected cycle geometry from the production bar width.
  await expect(endCycle).toHaveValue("6.5");
});

// #750 follow-up: a narrow bar drops its label text but must keep a body-drag handle (the label element collapsed to 0px height before).
test("a narrow Transaction bar keeps a body drag handle and can be moved", async ({ page }) => {
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto("/?transaction-demo");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  await page.getByTestId("transaction-tc-scale").selectOption("50");
  const bar = page.locator(".transaction-track [data-transaction-id='demo_txn_read']");
  await expect.poll(async () => (await bar.boundingBox())!.width).toBeLessThan(56);
  const handle = bar.locator(":scope > span");
  await expect(handle).toHaveAttribute("data-label-compact", "true");
  const box = (await handle.boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(14);
  const before = await page.getByTestId("history-status").innerText();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2, { steps: 6 });
  await page.mouse.up();
  await expect.poll(() => page.getByTestId("history-status").innerText()).not.toBe(before);
});
