import { expect, test } from "@playwright/test";
import { startInCycleMode } from "./cycle-startup.js";

startInCycleMode(test);

/**
 * The Signal Split Lower pane mounts AFTER the workspace (it exists only while Signal Split is on). The Cursor overlay owner must attach to it
 * when it appears: the Lower pane shows Cursor A at the same source cycle as the Upper pane, and a Cursor A drag that starts in the Lower pane
 * moves the cursor under the pointer (timeline-local X of the Lower pane's own inner scroller, not the pane's outer left edge). Toggling Signal Split off and on again must keep working (no stale/disconnected pane).
 */
for (const size of [{ width: 1280, height: 720 }, { width: 1672, height: 941 }] as const) {
  test(`Cursor overlay attaches to a Signal Split Lower pane that mounts later at ${size.width}x${size.height}`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.goto("/");
    const host = page.getByTestId("cycle-surface");
    await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
    await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
    await page.getByTestId("cursor-set-a").click();
    // Give the split panes real height (with the Bottom Editor open, the 1280x720 Lower pane exposes only its ruler).
    const bottomToggle = page.getByTestId("ribbon").getByRole("button", { name: "Bottom Editor", exact: true });
    if (await bottomToggle.getAttribute("aria-pressed") === "true") await bottomToggle.click();
    const upperLine = page.getByTestId("cycle-viewport").locator("[data-role='cursor-line'][data-cursor='a']");
    await expect(upperLine).toBeVisible();

    for (const round of [1, 2]) {
      await page.getByTestId("view-panel-signal-split").click();
      const lower = page.getByTestId("cycle-viewport-lower");
      await expect(lower).toBeVisible();
      await expect(host).toHaveAttribute("data-editor-idle", "true", { timeout: 30_000 });
      const lowerLine = lower.locator("[data-role='cursor-line'][data-cursor='a']");
      await expect(lowerLine, `round ${round}: Lower pane shows Cursor A`).toBeVisible();
      await expect(lowerLine).toHaveAttribute("data-cycle", (await upperLine.getAttribute("data-cycle"))!);
      const upperBox = (await upperLine.boundingBox())!;
      const lowerBox = (await lowerLine.boundingBox())!;
      expect(Math.abs(lowerBox.x - upperBox.x), `round ${round}: same source cycle -> same X in both panes`).toBeLessThanOrEqual(1);

      // A drag that starts on the Lower pane's line moves Cursor A.
      const before = await lowerLine.getAttribute("data-cycle");
      // Grab the line where it is actually exposed: inside the Lower pane and above the Bottom panel splitter (the pane continues under it).
      const paneBox = (await lower.boundingBox())!;
      const trackTop = await page.evaluate(() => document.querySelector(".bottom-resize-track")?.getBoundingClientRect().top ?? Number.POSITIVE_INFINITY);
      const grabY = (Math.max(lowerBox.y, paneBox.y) + Math.min(lowerBox.y + lowerBox.height, paneBox.y + paneBox.height, trackTop)) / 2;
      const hit = await page.evaluate(([x, y]) => (document.elementFromPoint(x!, y!) as HTMLElement | null)?.dataset.role ?? null, [lowerBox.x + 1, grabY]);
      expect(hit, `round ${round}: the Lower-pane cursor line is hit-testable`).toBe("cursor-line");
      await page.mouse.move(lowerBox.x + 1, grabY);
      await page.mouse.down();
      for (let step = 1; step <= 5; step += 1) {
        await page.mouse.move(lowerBox.x + 1 + step * 40, grabY);
        await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
      }
      await page.mouse.up();
      await expect.poll(() => lowerLine.getAttribute("data-cycle"), { message: `round ${round}: Lower-pane drag moves Cursor A` }).not.toBe(before);
      await expect(upperLine).toHaveAttribute("data-cycle", (await lowerLine.getAttribute("data-cycle"))!);
      // The line follows the pointer in the Lower pane exactly as in the Upper pane (same shared time geometry, timeline-local X).
      const after = (await lowerLine.boundingBox())!;
      expect(Math.abs(after.x - (lowerBox.x + 200)), `round ${round}: Cursor A ends under the pointer`).toBeLessThanOrEqual(25);

      await page.getByTestId("view-panel-signal-split").click();
      await expect(page.getByTestId("cycle-viewport-lower")).toHaveCount(0);
    }
  });
}
