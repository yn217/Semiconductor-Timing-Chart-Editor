import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { startInCycleMode } from "./cycle-startup.js";

startInCycleMode(test);

/**
 * #208: File -> Open must publish ONE document epoch per painted frame. A requestAnimationFrame sampler records, for every
 * frame during the replacement, the document identity each visible surface reports (title bar, shell signal count / doc id,
 * Signal Tree rows, StatusBar signal count). A frame whose surfaces disagree is an old/new mixed frame.
 */
test("Open replacement never paints old-document chrome next to new-document rows", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const oldTitle = (await page.locator(".app-titlebar h1").textContent()) ?? "";
  const oldCount = (await page.locator(".editor-shell").getAttribute("data-signal-count")) ?? "";

  await expect(host).toHaveAttribute("data-editor-idle", "true", { timeout: 30_000 });
  await expect.poll(() => page.locator("[data-role='tree-signal-name']").count()).toBeGreaterThan(0);
  const oldTree = await page.locator("[data-role='tree-signal-name']").count();
  await page.evaluate(() => {
    const frames: Array<{ t: number; title: string; count: string; treeNames: string; status: string }> = [];
    (window as unknown as { __frames: typeof frames }).__frames = frames;
    let running = true;
    (window as unknown as { __stopFrames: () => void }).__stopFrames = () => { running = false; };
    const sample = () => {
      const names = String(document.querySelectorAll("[data-role='tree-signal-name']").length);
      frames.push({
        t: performance.now(),
        title: document.querySelector(".app-titlebar h1")?.textContent ?? "",
        count: document.querySelector(".editor-shell")?.getAttribute("data-signal-count") ?? "",
        treeNames: names,
        status: document.querySelector("[data-testid='signal-count-status'], [data-testid='status-signals']")?.textContent ?? "",
      });
      if (running) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });

  const fixture = await readFile(new URL("../../samples/showcase/21_large_feature_showcase.tcd.json", import.meta.url));
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "21_large_feature_showcase.tcd.json", mimeType: "application/json", buffer: fixture });
  await expect(page.getByRole("heading", { name: "Large Feature Showcase — 128 cycles / 48 signals" })).toBeVisible();
  await expect(host).toHaveAttribute("data-editor-idle", "true", { timeout: 30_000 });
  await page.evaluate(() => (window as unknown as { __stopFrames: () => void }).__stopFrames());

  const frames = await page.evaluate(() => (window as unknown as { __frames: Array<{ t: number; title: string; count: string; treeNames: string; status: string }> }).__frames);
  const newTitle = "Large Feature Showcase — 128 cycles / 48 signals";
  // Frame classification: title identity is the reference; the shell signal count and the tree rows must agree with it.
  const mixed = frames.filter((frame) => {
    const titleIsNew = frame.title === newTitle;
    const titleIsOld = frame.title === oldTitle;
    const countIsNew = frame.count === "48";
    const countIsOld = frame.count === oldCount;
    const treeIsNew = Number(frame.treeNames) !== oldTree;
    return (titleIsOld && (countIsNew || treeIsNew)) || (titleIsNew && (countIsOld || (!treeIsNew && Number(frame.treeNames) > 0)));
  });
  console.log(`EPOCH frames=${frames.length} mixed=${mixed.length}`, JSON.stringify(mixed.slice(0, 3)));
  expect(mixed, "frames that mix old/new document identity").toEqual([]);
});
