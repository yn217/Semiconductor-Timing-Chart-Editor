import { expect, test, type Page } from "@playwright/test";
import { generatePerformanceDocument } from "@timing-chart-v2/testing";

// Exercise the same production chain as a user: drag the native horizontal thumb,
// then hit whitespace in the visible ruler cell (not its numeric glyph).
test.use({ launchOptions: { ignoreDefaultArgs: ["--hide-scrollbars"] } });

const sizes = [{ width: 1280, height: 720 }, { width: 1672, height: 941 }] as const;

for (const size of sizes) {
  test(`ruler whitespace remains source-cycle accurate after native thumb scroll at ${size.width}x${size.height}`, async ({ page }) => {
    test.setTimeout(90_000);
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.setViewportSize(size);
    await page.goto("/");
    const surface = page.getByTestId("cycle-surface");
    await expect(surface).toHaveAttribute("data-cycle-view-ready", "true");
    const document = generatePerformanceDocument({ signalCount: 8, cycleCount: 1_200, profile: "transaction-heavy" });
    await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({
      name: "issue-738-native-thumb-hit.tcd",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(document)),
    });
    await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 60_000 });
    await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
    await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 60_000 });
    await page.locator(".ribbon-tabs").getByRole("button", { name: "Timeline", exact: true }).click();

    const owner = page.locator("[data-role='timeline-viewport']");
    const bar = page.getByTestId("timeline-hscroll");
    const geometry = await bar.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      return {
        left: bounds.left,
        bottom: bounds.bottom,
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
        scrollbarHeight: element.offsetHeight - element.clientHeight,
      };
    });
    test.skip(geometry.scrollbarHeight === 0, "Native thumb interaction requires a classic scrollbar.");
    expect(geometry.scrollWidth).toBeGreaterThan(geometry.clientWidth);

    const arrow = 17;
    const thumbWidth = Math.max(20, (geometry.clientWidth - 2 * arrow) * geometry.clientWidth / geometry.scrollWidth);
    const travel = geometry.clientWidth - 2 * arrow - thumbWidth;
    const thumbStart = geometry.left + arrow + thumbWidth / 2;
    const thumbTarget = thumbStart + travel * 0.55;
    const thumbY = geometry.bottom - geometry.scrollbarHeight / 2;
    await page.mouse.move(thumbStart, thumbY);
    await page.mouse.down();
    try {
      for (let step = 1; step <= 8; step += 1) {
        await page.mouse.move(thumbStart + (thumbTarget - thumbStart) * step / 8, thumbY);
      }
      await expect.poll(() => owner.evaluate((element) => element.scrollLeft), { timeout: 30_000 }).toBeGreaterThan(0);
    } finally {
      await page.mouse.up();
    }
    await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 60_000 });
    const scrollLeft = await owner.evaluate((element) => element.scrollLeft);
    expect(scrollLeft, "native thumb must produce real horizontal overflow movement").toBeGreaterThan(geometry.clientWidth);

    const hit = await page.getByTestId("cycle-ruler").evaluate((ruler) => {
      const bounds = ruler.getBoundingClientRect();
      const ticks = Array.from(ruler.querySelectorAll<HTMLElement>(".cycle-tick[data-source-cycle]"))
        .map((tick) => ({ cycle: Number(tick.dataset.sourceCycle), x: tick.getBoundingClientRect().left }))
        .filter((tick) => tick.x >= bounds.left && tick.x < bounds.right)
        .sort((left, right) => left.x - right.x);
      for (let index = 0; index + 1 < ticks.length; index += 1) {
        const current = ticks[index]!;
        const next = ticks[index + 1]!;
        if (next.cycle !== current.cycle + 1 || next.x - current.x < 4) continue;
        return {
          cycle: current.cycle,
          x: current.x + (next.x - current.x) * 0.72,
          y: bounds.top + bounds.height * 0.72,
          bounds: { left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom },
        };
      }
      return undefined;
    });
    expect(hit, "a fully visible source-cycle ruler cell exists after native scrolling").toBeDefined();
    expect(hit!.x).toBeGreaterThan(hit!.bounds.left);
    expect(hit!.x).toBeLessThan(hit!.bounds.right);
    const target = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.outerHTML.slice(0, 160), hit!);

    const history = await page.getByTestId("history-status").innerText();
    const revision = await surface.getAttribute("data-canonical-revision");
    const dirty = await page.getByTestId("dirty-status").innerText();
    await page.mouse.click(hit!.x, hit!.y);
    await expect(page.getByLabel("Timeline range start")).toHaveValue(String(hit!.cycle), { timeout: 10_000 });
    await expect(page.getByLabel("Timeline range end")).toHaveValue(String(hit!.cycle + 1));
    await expect(page.getByTestId("history-status")).toHaveText(history);
    await expect(surface).toHaveAttribute("data-canonical-revision", revision!);
    await expect(page.getByTestId("dirty-status")).toHaveText(dirty);
    expect(pageErrors, `page errors after ruler hit on ${JSON.stringify(target)}`).toEqual([]);
  });
}
