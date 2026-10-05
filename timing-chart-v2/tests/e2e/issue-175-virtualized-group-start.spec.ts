import { expect, test } from "@playwright/test";
import { generatePerformanceDocument } from "@timing-chart-v2/testing";

test("virtualized rows keep canonical group-start identity while scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 1_672, height: 941 });
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");

  const generated = generatePerformanceDocument({ signalCount: 1_000, cycleCount: 32, profile: "standard" });
  const signals = generated.signals.map((signal, index) => index === 0
    ? { ...generated.signals[1]!, id: signal.id, name: "SIG_0", source: { ...signal.source, signalName: "signal_0" }, display: { ...signal.display, name: "SIG_0" } }
    : signal);
  const { referenceClock: _referenceClock, ...timeline } = generated.timeline;
  const document = {
    ...generated,
    timeline,
    signals,
    signalGroups: [{ ...generated.signalGroups[0]!, rows: signals.map((signal) => signal.id) }],
  };
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({
    name: document.document.id + ".tcd",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(document)),
  });
  await expect(page.locator(".app-titlebar h1")).toHaveText(document.document.title, { timeout: 90_000 });
  await expect(host).toHaveAttribute("data-editor-idle", "true", { timeout: 90_000 });
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");

  const surface = host.locator("[data-role='timing-chart-surface']");
  await expect.poll(() => surface.locator("[data-role='wave-owner']").evaluateAll((owners) => owners.length > 0 && owners.every((owner) => (owner as HTMLElement).dataset.waveState === "ready"))).toBe(true);
  const viewport = page.getByTestId("cycle-viewport");
  const tree = surface.locator("[data-role='left-tree-rows']");
  const rows = () => tree.locator("[data-role='left-row'][data-row-kind='timing']");
  const state = () => rows().evaluateAll((items) => items
    .filter((item) => (item as HTMLElement).dataset.groupStart === "true")
    .map((item) => (item as HTMLElement).dataset.rowId));
  const revision = await host.getAttribute("data-canonical-revision");
  const history = await page.getByTestId("history-status").textContent();
  const dirty = await page.getByTestId("dirty-status").textContent();
  const initialStarts = await state();
  expect(initialStarts).toHaveLength(1);
  const canonicalGroupStart = initialStarts[0]!;

  for (let step = 0; step < 12; step += 1) {
    const starts = await state();
    expect(starts.every((id) => id === canonicalGroupStart), "viewport entry must not become a semantic group start: " + JSON.stringify({ starts, canonicalGroupStart })).toBe(true);
    for (const id of starts) {
      const row = tree.locator("[data-role='left-row'][data-row-id='" + id + "']");
      await expect(row.locator("[data-role='tree-branch']")).toHaveAttribute("draggable", "true");
    }
    const beforeScroll = await viewport.evaluate((element) => element.scrollTop);
    const box = (await viewport.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, 120);
    await expect.poll(() => viewport.evaluate((element) => element.scrollTop)).toBeGreaterThan(beforeScroll);
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  }

  const starts = await state();
  expect(starts.every((id) => id === canonicalGroupStart), "group-start remains tied to the canonical first row after virtualization").toBe(true);
  await expect(host).toHaveAttribute("data-canonical-revision", revision!);
  await expect(page.getByTestId("history-status")).toHaveText(history!);
  await expect(page.getByTestId("dirty-status")).toHaveText(dirty!);
});
