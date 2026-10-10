import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

// Temporary measurement probe (not committed): #175 interaction matrix on perf_1000x1000 (production build, trace off).
const frame = (page: Page) => page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
const stats = (values: number[]) => { const s = [...values].sort((a, b) => a - b); const at = (p: number) => s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)]!; return { n: s.length, p50: Math.round(at(0.5)), p95: Math.round(at(0.95)), max: Math.round(s.at(-1)!) }; };

test("interaction matrix perf_1000x1000", async ({ page }) => {
  test.setTimeout(600_000);
  await page.setViewportSize({ width: 1_672, height: 941 });
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const file = readFileSync(resolve(process.cwd(), "samples/performance/perf_1000x1000_virtualized.tcd.json"));
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "perf_1000x1000_virtualized.tcd.json", mimeType: "application/json", buffer: file });
  await expect(host).toHaveAttribute("data-editor-idle", "true", { timeout: 90_000 });
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true", { timeout: 30_000 });
  await page.evaluate(() => { const w = window as unknown as { __lt: number[] }; w.__lt = []; new PerformanceObserver((l) => { for (const e of l.getEntries()) w.__lt.push(e.duration); }).observe({ entryTypes: ["longtask"] }); });
  const lt = () => page.evaluate(() => (window as unknown as { __lt: number[] }).__lt.length);
  const ltSince = (n: number) => page.evaluate((k) => (window as unknown as { __lt: number[] }).__lt.slice(k).map(Math.round), n);
  const result: Record<string, unknown> = {};
  const owner = page.getByTestId("cycle-viewport").locator("[data-role='timeline-viewport']");
  const vertical = page.getByTestId("cycle-viewport");

  const measureSteps = async (label: string, steps: number, act: (i: number) => Promise<void>) => {
    const before = await lt();
    const times: number[] = [];
    for (let i = 0; i < steps; i += 1) {
      const t0 = await page.evaluate(() => performance.now());
      await act(i);
      await frame(page);
      await expect(host).toHaveAttribute("data-editor-idle", "true", { timeout: 30_000 });
      times.push(await page.evaluate(() => performance.now()) - t0);
    }
    const longTasks = await ltSince(before);
    result[label] = { ...stats(times), longTasks: longTasks.length, maxLongTask: Math.max(0, ...longTasks) };
  };

  if (process.env.PROFILE_OP) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Profiler.enable");
    await cdp.send("Profiler.setSamplingInterval", { interval: 200 });
    await cdp.send("Profiler.start");
    const op = process.env.PROFILE_OP;
    for (let i = 0; i < 15; i += 1) {
      if (op === "vertical") await vertical.evaluate((el, k) => { el.scrollTop = (k + 1) * 400; }, i);
      else if (op === "horizontal") await owner.evaluate((el, k) => { el.scrollLeft = (k + 1) * 600; }, i);
      else await page.locator(".view-mode").getByRole("button", { name: ["Transaction", "Combined", "Cycle"][i % 3]!, exact: true }).click();
      await frame(page);
      await expect(host).toHaveAttribute("data-editor-idle", "true", { timeout: 30_000 });
    }
    const { profile } = await cdp.send("Profiler.stop") as { profile: { nodes: { id: number; callFrame: { functionName: string; url: string; lineNumber: number }; hitCount?: number; children?: number[] }[]; startTime: number; endTime: number; samples: number[] } };
    const byId = new Map(profile.nodes.map((n) => [n.id, n]));
    const total = profile.samples.length;
    const self = new Map<string, number>(); const incl = new Map<string, number>();
    const key = (n: { callFrame: { functionName: string; url: string; lineNumber: number } }) => `${n.callFrame.functionName || "(anon)"} ${n.callFrame.url.split("/").pop()?.split("?")[0] ?? ""}:${n.callFrame.lineNumber}`;
    const visit = (id: number, stack: Set<string>): number => {
      const n = byId.get(id)!; const k = key(n);
      let sum = n.hitCount ?? 0;
      self.set(k, (self.get(k) ?? 0) + (n.hitCount ?? 0));
      const added = !stack.has(k); if (added) stack.add(k);
      for (const c of n.children ?? []) sum += visit(c, stack);
      if (added) { incl.set(k, (incl.get(k) ?? 0) + sum); stack.delete(k); }
      return sum;
    };
    visit(profile.nodes[0]!.id, new Set());
    const top = (m: Map<string, number>) => [...m].filter(([k]) => !/^\((root|program|idle)\)/.test(k)).sort((a, b) => b[1] - a[1]).slice(0, 40).map(([k, v]) => `${(v / total * 100).toFixed(1)}% ${k}`);
    console.log(["PROF-SELF", ...top(self)].join("\n"));
    console.log(["PROF-INCL", ...top(incl)].join("\n"));
    console.log("PROF-IDLE", ((self.get("(idle) :-1") ?? 0) / total * 100).toFixed(1));
    return;
  }
  await measureSteps("verticalScroll", 30, (i) => vertical.evaluate((el, k) => { el.scrollTop = (k + 1) * 400; }, i));
  await vertical.evaluate((el) => { el.scrollTop = 0; });
  await measureSteps("horizontalScroll", 30, (i) => owner.evaluate((el, k) => { el.scrollLeft = (k + 1) * 600; }, i));
  await owner.evaluate((el) => { el.scrollLeft = 0; });
  await frame(page);
  const ribbon = page.getByTestId("ribbon");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
  await measureSteps("zoom", 6, (i) => ribbon.getByRole("button", { name: i % 2 === 0 ? "Zoom In" : "Zoom Out", exact: true }).click());
  await measureSteps("modeSwitch", 6, (i) => page.locator(".view-mode").getByRole("button", { name: ["Transaction", "Combined", "Cycle"][i % 3]!, exact: true }).click());

  // Cursor A drag: 30 pointer moves with a frame between moves.
  await page.getByTestId("cursor-set-a").click();
  const line = page.getByTestId("cycle-viewport").locator("[data-role='cursor-line'][data-cursor='a']").first();
  await expect(line).toBeVisible();
  const box = (await line.boundingBox())!;
  const before = await lt();
  await page.mouse.move(box.x + 1, box.y + 60);
  await page.mouse.down();
  const moveTimes: number[] = [];
  for (let i = 1; i <= 30; i += 1) {
    const t0 = await page.evaluate(() => performance.now());
    await page.mouse.move(box.x + 1 + i * 12, box.y + 60);
    await frame(page);
    moveTimes.push(await page.evaluate(() => performance.now()) - t0);
  }
  await page.mouse.up();
  const dragLt = await ltSince(before);
  result.cursorDragMove = { ...stats(moveTimes), longTasks: dragLt.length, maxLongTask: Math.max(0, ...dragLt) };
  console.log("E175-MATRIX", JSON.stringify(result));
});
