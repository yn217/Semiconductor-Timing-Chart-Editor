import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startInCycleMode } from "./cycle-startup.js";

startInCycleMode(test);

/**
 * #797 acceptance on the exact fixture: SignalGroup.style.opacity (APB = 0.15) is a background-band alpha only. Every foreground
 * layer (frozen Role/Signal cells, waveform owners, selection) keeps full opacity, before and after selecting and scrolling.
 */
const APB = ["psel", "penable", "pwrite", "paddr", "pwdata", "prdata", "pready", "pslverr"];

for (const viewport of [{ width: 1280, height: 720 }, { width: 1672, height: 941 }]) {
  test(`APB group opacity 0.15 is background-only at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize(viewport);
    await page.goto("/");
    const surface = page.getByTestId("cycle-surface");
    await expect(surface).toHaveAttribute("data-cycle-view-ready", "true");
    await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(resolve("samples/showcase/24_protocol_transaction_showcase.tcd.json"));
    await expect(page.getByRole("heading", { name: /Protocol \/ Transaction Showcase/ })).toBeVisible();
    await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 30_000 });
    await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
    await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 30_000 });

    const foregroundOpacity = () => page.evaluate((ids) => {
      const effective = (element: Element | null): number => {
        let value = 1;
        for (let node: Element | null = element; node && node !== document.body; node = node.parentElement) value *= Number(getComputedStyle(node).opacity);
        return value;
      };
      const rows = ids.map((id) => {
        const frozen = document.querySelector(`[data-role='frozen-row'][data-row-id='${id}']`);
        const wave = document.querySelector(`[data-role='wave-owner'][data-signal-id='${id}']`);
        return { id, mounted: frozen !== null || wave !== null, frozen: frozen ? effective(frozen) : undefined, wave: wave ? effective(wave) : undefined, waveSurface: wave?.querySelector("svg, canvas") ? effective(wave.querySelector("svg, canvas")) : undefined };
      });
      const band = document.querySelector<HTMLElement>("[data-role='group-band'][data-group-id='g24_apb'], [data-group-id='g24_apb'] [data-role='group-band']");
      return { rows, bandBackground: band ? getComputedStyle(band).backgroundColor : undefined, bandOpacity: band ? getComputedStyle(band).opacity : undefined };
    }, APB);
    const assertFull = async (label: string) => {
      const snapshot = await foregroundOpacity();
      const mounted = snapshot.rows.filter((row) => row.mounted);
      expect(mounted.length, `${label}: some APB rows must be mounted`).toBeGreaterThan(0);
      for (const row of mounted) for (const value of [row.frozen, row.wave, row.waveSurface]) if (value !== undefined) expect(value, `${label}: ${row.id} foreground effective opacity`).toBeGreaterThan(0.99);
    };

    const anchor = surface.locator(`[data-role='frozen-row'][data-row-id='psel']`);
    await anchor.scrollIntoViewIfNeeded();
    // The configured opacity is carried by the background variable only (15% alpha), never by an `opacity` on the row shell.
    const shell = await anchor.evaluate((element) => ({ variable: element.style.getPropertyValue("--group-background") || getComputedStyle(element).getPropertyValue("--group-background"), inlineOpacity: element.style.opacity }));
    expect(shell.variable).toContain("15%");
    expect(shell.inlineOpacity).toBe("");
    await assertFull("initial");
    await anchor.click();
    await expect(page.getByTestId("selection-status")).not.toContainText("None");
    await assertFull("selected");
    const box = (await page.getByTestId("cycle-viewport").boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.85, box.y + 80);
    await page.mouse.wheel(0, 500);
    await page.waitForTimeout(400);
    await assertFull("after scroll");
  });
}
