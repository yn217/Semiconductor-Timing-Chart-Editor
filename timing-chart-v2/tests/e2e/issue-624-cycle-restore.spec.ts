import { expect, test } from "@playwright/test";

for (const viewport of [{ width: 1672, height: 941 }, { width: 1280, height: 720 }]) {
  test(`Transaction-to-Cycle and Recent restore publish signal geometry before annotations at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    test.setTimeout(60_000);
    await page.setViewportSize(viewport);
    await page.goto("/");

    const host = page.getByTestId("cycle-surface");
    const surface = host.locator("[data-role='timing-chart-surface']");
    const waveOwnersWithoutSvg = () => surface.locator("[data-role='wave-owner']").evaluateAll((owners) => owners.filter((owner) => owner.querySelector("svg") === null).map((owner) => (owner as HTMLElement).dataset.signalId));
    const annotationResolvedCount = () => host.getAttribute("data-annotation-resolved-count").then((value) => Number(value ?? 0));

    await expect(host).toHaveAttribute("data-editor-idle", "true");
    await expect(page.getByTestId("view-mode-status")).toHaveText("Mode: Transaction");
    await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
    await expect.poll(waveOwnersWithoutSvg).toEqual([]);
    await expect(surface.locator("[data-role='wave-owner'][data-signal-id='sig_cycle_request'] svg")).toBeAttached();
    await expect.poll(annotationResolvedCount).toBeGreaterThan(0);
    await expect(surface.locator("[data-role='annotation-owner'][data-annotation-id='demo_ann_request']")).toBeAttached();

    await page.locator(".view-mode").getByRole("button", { name: "Combined", exact: true }).click();
    await expect(page.getByTestId("view-mode-status")).toHaveText("Mode: Combined");
    await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
    await expect(page.getByTestId("view-mode-status")).toHaveText("Mode: Cycle");
    await expect.poll(annotationResolvedCount).toBeGreaterThan(0);
    await expect(surface.locator("[data-role='annotation-owner'][data-annotation-id='demo_ann_request']")).toBeAttached();

    await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
    await page.getByTestId("ribbon").getByRole("button", { name: "Save", exact: true }).click();
    await expect.poll(() => page.evaluate(() => localStorage.getItem("timing-chart-v2.recent")?.length ?? 0)).toBeGreaterThan(0);
    await page.reload();
    await expect(host).toHaveAttribute("data-editor-idle", "true");
    await expect(page.getByTestId("view-mode-status")).toHaveText("Mode: Transaction");

    await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
    await page.getByTestId("ribbon").getByRole("button", { name: "Recent", exact: true }).click();
    await expect(host).toHaveAttribute("data-editor-idle", "true");
    await expect(page.locator(".editor-shell")).toHaveAttribute("data-signal-count", "8");
    await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
    await expect.poll(waveOwnersWithoutSvg).toEqual([]);
    await expect(surface.locator("[data-role='wave-owner'][data-signal-id='sig_cycle_request'] svg")).toBeAttached();
    await expect.poll(annotationResolvedCount).toBeGreaterThan(0);
    await expect(surface.locator("[data-role='annotation-owner'][data-annotation-id='demo_ann_request']")).toBeAttached();

    await expect(host).toHaveAttribute("data-canonical-revision", "0");
    await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
    await expect(page.getByTestId("dirty-status")).toHaveText("Clean");
  });
}
