import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

/**
 * #786 closure evidence (real browser, PRODUCTION build): first annotation endpoint drag on 10k+ cycle and 1k x 1k documents. Measures
 * pointer-down -> first snap candidate drawn (the first interaction builds the snap service) and the Long Tasks inside that window.
 */
const workloads = [
  { file: "perf_100x100000_sparse_timeline.tcd.json", label: "100 signals x 100,000 cycles" },
  { file: "perf_1000x1000_virtualized.tcd.json", label: "1,000 signals x 1,000 cycles" },
] as const;

for (const workload of workloads) test(`production first snap interaction: ${workload.label}`, async ({ page }) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 1_672, height: 941 });
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: workload.file, mimeType: "application/json", buffer: readFileSync(resolve(process.cwd(), `samples/performance/${workload.file}`)) });
  await expect(host).toHaveAttribute("data-editor-idle", "true", { timeout: 90_000 });
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  await host.locator("[data-role='frozen-row']:not([data-kind='comment'])").nth(1).click();
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Annotation", exact: true }).click();
  await page.getByLabel("Annotation type").selectOption("arrow");
  const owners = host.locator("[data-role='annotation-owner'][data-annotation-id]");
  const before = new Set(await owners.evaluateAll((items) => items.map((item) => item.getAttribute("data-annotation-id"))));
  await page.getByTestId("annotation-toolbar").getByRole("button", { name: "Add annotation" }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  const findNew = () => owners.evaluateAll((items, previous) => items.map((item) => item.getAttribute("data-annotation-id")).find((id) => id !== null && !(previous as string[]).includes(id)), [...before]);
  await expect.poll(findNew).toBeTruthy();
  const owner = host.locator(`[data-role='annotation-owner'][data-annotation-id='${await findNew()}']`);
  const handle = owner.locator("[data-role='annotation-handle'][data-annotation-field='from']");
  const box = (await handle.boundingBox())!;
  await page.evaluate(() => { const w = window as unknown as { __lt: number[] }; w.__lt = []; new PerformanceObserver((list) => { for (const entry of list.getEntries()) w.__lt.push(entry.duration); }).observe({ entryTypes: ["longtask"] }); });
  await page.mouse.move(box.x + 4, box.y + 4);
  const started = await page.evaluate(() => performance.now());
  await page.mouse.down();
  await page.mouse.move(box.x + 44, box.y + 4);
  await expect(host.locator("[data-role='snap-point']")).toHaveCount(1, { timeout: 10_000 });
  const firstSnapMs = Math.round((await page.evaluate(() => performance.now())) - started);
  await page.mouse.up();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  const longTasks = await page.evaluate(() => (window as unknown as { __lt: number[] }).__lt);
  const maxLongTaskMs = Math.max(0, ...longTasks);
  console.log(`[snap-first-interaction-production] ${JSON.stringify({ workload: workload.label, firstSnapMs, longTasks: { count: longTasks.length, maxMs: Math.round(maxLongTaskMs * 100) / 100 } })}`);
  expect(firstSnapMs, "first snap candidate drawn").toBeLessThan(1_000);
  expect(maxLongTaskMs, "ordinary first snap interaction has no >50ms main-thread Long Task").toBeLessThanOrEqual(50);
});
