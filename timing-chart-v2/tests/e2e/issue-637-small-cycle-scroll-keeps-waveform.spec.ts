import { expect, test } from "@playwright/test";
import { cycleDocument } from "../../apps/editor/src/fixtures-cycle-reference-documents.js";

test("horizontal scrolling a small Cycle document keeps its complete waveform window mounted", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  await expect(page.locator("[data-view-mode]")).toHaveAttribute("data-view-mode", "Cycle");
  const waveOwners = host.locator("[data-role='wave-owner']");
  await expect.poll(async () => waveOwners.evaluateAll((owners) => {
    const state = owners.map((owner) => ({ signalId: (owner as HTMLElement).dataset.signalId, start: (owner as HTMLElement).dataset.renderedSourceWindowStart, end: (owner as HTMLElement).dataset.renderedSourceWindowEnd, graphics: owner.querySelectorAll("svg path, svg line, svg polyline, svg polygon, svg rect").length, error: (owner as HTMLElement).dataset.waveError }));
    return owners.length > 0 && state.every((owner) => owner.graphics > 0 || owner.error) ? "ready" : JSON.stringify(state);
  })).toBe("ready");
  const waveErrors = await waveOwners.evaluateAll((owners) => owners.filter((owner) => (owner as HTMLElement).dataset.waveError).map((owner) => ({ signalId: (owner as HTMLElement).dataset.signalId, error: (owner as HTMLElement).dataset.waveError })));
  expect(waveErrors, JSON.stringify(waveErrors)).toEqual([]);

  const viewport = page.getByTestId("cycle-viewport");
  for (let i = 0; i < 8; i += 1) {
    const metrics = await viewport.evaluate((element) => ({ clientWidth: element.clientWidth, scrollWidth: element.scrollWidth }));
    if (metrics.scrollWidth > metrics.clientWidth + 1) break;
    await page.getByTestId("ribbon").getByRole("button", { name: "Zoom in", exact: true }).click();
  }
  const beforeMetrics = await viewport.evaluate((element) => ({ clientWidth: element.clientWidth, scrollWidth: element.scrollWidth, scrollLeft: element.scrollLeft }));
  expect(beforeMetrics.scrollWidth).toBeGreaterThan(beforeMetrics.clientWidth + 1);
  await expect.poll(async () => waveOwners.evaluateAll((owners) => owners.length > 0 && owners.every((owner) => owner.querySelectorAll("svg path, svg line, svg polyline, svg polygon, svg rect").length > 0))).toBe(true);

  const surface = host.locator("[data-role='timing-chart-surface']");
  const beforeCounters = JSON.parse((await surface.getAttribute("data-render-counters"))!) as { waveDromRenders: number; localGeometryBuilds: number };
  const before = {
    revision: await host.getAttribute("data-canonical-revision"),
    history: await page.getByTestId("history-status").textContent(),
    dirty: await page.getByTestId("dirty-status").textContent(),
  };
  const ownersBefore = await host.locator("[data-role='wave-owner']").evaluateAll((owners) => owners.map((owner) => ({
    signalId: (owner as HTMLElement).dataset.signalId,
    start: (owner as HTMLElement).dataset.renderedSourceWindowStart,
    end: (owner as HTMLElement).dataset.renderedSourceWindowEnd,
    svgNodes: owner.querySelectorAll("svg").length,
    graphicNodes: owner.querySelectorAll("svg path, svg line, svg polyline, svg polygon, svg rect").length,
  })));
  expect(ownersBefore.length).toBeGreaterThan(0);
  expect(ownersBefore.every((owner) => owner.start === "0" && owner.end === "160" && owner.svgNodes > 0 && owner.graphicNodes > 0), JSON.stringify(ownersBefore)).toBe(true);

  const box = await viewport.boundingBox();
  expect(box).not.toBeNull();
  const scrollTopBefore = await viewport.evaluate((element) => element.scrollTop);
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.wheel(700, 0);
  await expect.poll(() => viewport.evaluate((element) => element.scrollLeft)).toBeGreaterThan(beforeMetrics.scrollLeft);
  expect(await viewport.evaluate((element) => element.scrollTop)).toBe(scrollTopBefore);

  const afterCounters = JSON.parse((await surface.getAttribute("data-render-counters"))!) as { waveDromRenders: number; localGeometryBuilds: number };
  const ownersAfter = await host.locator("[data-role='wave-owner']").evaluateAll((owners) => owners.map((owner) => ({
    signalId: (owner as HTMLElement).dataset.signalId,
    start: (owner as HTMLElement).dataset.renderedSourceWindowStart,
    end: (owner as HTMLElement).dataset.renderedSourceWindowEnd,
    svgNodes: owner.querySelectorAll("svg").length,
    graphicNodes: owner.querySelectorAll("svg path, svg line, svg polyline, svg polygon, svg rect").length,
  })));
  const afterById = new Map(ownersAfter.map((owner) => [owner.signalId, owner]));
  for (const owner of ownersBefore) expect(afterById.get(owner.signalId)).toEqual(owner);
  const newlyMountedOwners = ownersAfter.length - ownersBefore.length;
  expect(afterCounters.waveDromRenders - beforeCounters.waveDromRenders).toBeLessThanOrEqual(newlyMountedOwners);
  expect(afterCounters.localGeometryBuilds - beforeCounters.localGeometryBuilds).toBeLessThanOrEqual(newlyMountedOwners);
  await expect(host).toHaveAttribute("data-canonical-revision", before.revision!);
  await expect(page.getByTestId("history-status")).toHaveText(before.history!);
  await expect(page.getByTestId("dirty-status")).toHaveText(before.dirty!);
});

test("last-good WaveDrom stays populated while a large Cycle source window is re-rendered during native thumb drag", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const largeDocument = {
    ...cycleDocument,
    document: { ...cycleDocument.document, id: "issue-637-large-waveform", title: "#637 large waveform" },
    timeline: { ...cycleDocument.timeline, end: 10_000, cycleCount: 10_000 },
  };
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "issue-637-large-waveform.tcd.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(largeDocument)) });
  const discard = page.getByTestId("unsaved-discard");
  if (await discard.isVisible().catch(() => false)) await discard.click();
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  const viewport = page.getByTestId("cycle-viewport");
  const waveOwners = viewport.locator("[data-role='wave-owner'][data-signal-id]");
  await expect.poll(() => waveOwners.count()).toBeGreaterThanOrEqual(7);
  await expect.poll(() => waveOwners.evaluateAll((owners) => owners.every((owner) => owner.querySelector("svg path") !== null))).toBe(true);
  const initial = await viewport.evaluate((element) => {
    const node = element as HTMLElement;
    const box = node.getBoundingClientRect();
    return { left: box.left, bottom: box.bottom, clientWidth: node.clientWidth, scrollWidth: node.scrollWidth, scrollbarHeight: node.offsetHeight - node.clientHeight };
  });
  expect(initial.scrollWidth).toBeGreaterThan(initial.clientWidth);
  test.skip(initial.scrollbarHeight === 0, "Native thumb interaction requires a headed browser; use the explicit --headed focused run.");
  const thumbWidth = Math.max(24, initial.clientWidth * initial.clientWidth / initial.scrollWidth);
  const trackWidth = initial.clientWidth - thumbWidth;
  const startX = initial.left + thumbWidth / 2;
  const endX = initial.left + trackWidth * 0.8 + thumbWidth / 2;
  const y = initial.bottom - initial.scrollbarHeight / 2;
  const before = {
    revision: await host.getAttribute("data-canonical-revision"),
    history: await page.getByTestId("history-status").innerText(),
    dirty: await page.getByTestId("dirty-status").innerText(),
  };
  const samples: Array<{ scrollLeft: number; owners: Array<{ id: string | undefined; pathCount: number; range: string }> }> = [];
  await page.mouse.move(startX, y);
  await page.mouse.down();
  for (let step = 1; step <= 12; step += 1) {
    await page.mouse.move(startX + (endX - startX) * step / 12, y);
    await page.waitForTimeout(120);
    samples.push(await viewport.evaluate((element) => ({
      scrollLeft: (element as HTMLElement).scrollLeft,
      owners: Array.from(element.querySelectorAll<HTMLElement>("[data-role='wave-owner'][data-signal-id]"), (owner) => ({
        id: owner.dataset.signalId,
        pathCount: owner.querySelectorAll("svg path").length,
        range: `${owner.dataset.renderedSourceWindowStart ?? "?"}..${owner.dataset.renderedSourceWindowEnd ?? "?"}`,
      })),
    })));
  }
  await page.mouse.up();
  expect(samples.some((sample) => sample.scrollLeft > 0)).toBe(true);
  expect(samples.every((sample) => sample.owners.length >= 7 && sample.owners.every((owner) => owner.pathCount > 0))).toBe(true);
  expect(samples.every((sample) => sample.owners.every((owner) => owner.range === sample.owners[0]?.range))).toBe(true);
  await expect(host).toHaveAttribute("data-canonical-revision", before.revision!);
  await expect(page.getByTestId("history-status")).toHaveText(before.history);
  await expect(page.getByTestId("dirty-status")).toHaveText(before.dirty);
});
