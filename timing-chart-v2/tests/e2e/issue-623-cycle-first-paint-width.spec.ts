import { expect, test, type Page } from "@playwright/test";

async function captureCycleEntryWidths(page: Page, enterFrom: "Transaction" | "Combined"): Promise<void> {
  const modes = page.locator(".view-mode");
  if (enterFrom === "Combined") await modes.getByRole("button", { name: "Combined", exact: true }).click();
  else await modes.getByRole("button", { name: "Transaction", exact: true }).click();
  await expect(page.getByTestId("view-mode-status")).toHaveText(`Mode: ${enterFrom}`);

  await page.evaluate(() => {
    const target = window as Window & { __cycleEntryWidths?: Promise<readonly { readonly mode: string; readonly viewportWidth: number; readonly sharedWaveWidth: number; readonly maxVisibleOwnerWidth: number; readonly visibleSvgOwners: number }[]> };
    target.__cycleEntryWidths = new Promise((resolve) => {
      const samples: { mode: string; viewportWidth: number; sharedWaveWidth: number; maxVisibleOwnerWidth: number; visibleSvgOwners: number }[] = [];
      let frame = 0;
      const sample = () => {
        const panel = document.querySelector<HTMLElement>(".cycle-panel");
        const viewport = panel?.querySelector<HTMLElement>(".cycle-viewport");
        const owners = [...(panel?.querySelectorAll<HTMLElement>("[data-role='wave-owner']") ?? [])]
          .filter((owner) => owner.querySelector("svg") && getComputedStyle(owner).visibility !== "hidden");
        samples.push({
          mode: panel?.dataset.viewMode ?? "missing",
          viewportWidth: viewport?.clientWidth ?? 0,
          sharedWaveWidth: Number.parseFloat(viewport ? getComputedStyle(viewport).getPropertyValue("--wave-width") : "") || 0,
          maxVisibleOwnerWidth: Math.max(0, ...owners.map((owner) => owner.getBoundingClientRect().width)),
          visibleSvgOwners: owners.length,
        });
        frame += 1;
        if (frame >= 60) resolve(samples);
        else requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
  });
  await modes.getByRole("button", { name: "Cycle", exact: true }).click();
  await expect(page.getByTestId("view-mode-status")).toHaveText("Mode: Cycle");
  const samples = await page.evaluate(async () => {
    const target = window as Window & { __cycleEntryWidths?: Promise<readonly { readonly mode: string; readonly viewportWidth: number; readonly sharedWaveWidth: number; readonly maxVisibleOwnerWidth: number; readonly visibleSvgOwners: number }[]> };
    return await target.__cycleEntryWidths;
  });
  const cycleSamples = samples.filter((sample) => sample.mode === "Cycle" && sample.visibleSvgOwners > 0);
  expect(cycleSamples.length, `${enterFrom}→Cycle must be sampled after wave SVGs are visible`).toBeGreaterThan(0);
  const oversized = cycleSamples.filter((sample) => sample.sharedWaveWidth > 0 && sample.maxVisibleOwnerWidth >= sample.sharedWaveWidth * 0.8);
  expect(oversized, `${enterFrom}→Cycle exposed a full-document wave owner before bounded geometry settled: ${JSON.stringify(oversized.slice(0, 5))}`).toEqual([]);
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true");
}

for (const viewport of [{ width: 1672, height: 941 }, { width: 1280, height: 720 }]) {
  test(`Cycle entry never paints an oversized waveform before bounded geometry at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
    const stateBefore = {
      revision: await page.getByTestId("revision-status").textContent(),
      history: await page.getByTestId("history-status").textContent(),
      dirty: await page.getByTestId("dirty-status").textContent(),
    };
    await captureCycleEntryWidths(page, "Transaction");
    await expect(page.getByTestId("revision-status")).toHaveText(stateBefore.revision!);
    await expect(page.getByTestId("history-status")).toHaveText(stateBefore.history!);
    await expect(page.getByTestId("dirty-status")).toHaveText(stateBefore.dirty!);
    await captureCycleEntryWidths(page, "Combined");
    await expect(page.getByTestId("revision-status")).toHaveText(stateBefore.revision!);
    await expect(page.getByTestId("history-status")).toHaveText(stateBefore.history!);
    await expect(page.getByTestId("dirty-status")).toHaveText(stateBefore.dirty!);
  });
}
