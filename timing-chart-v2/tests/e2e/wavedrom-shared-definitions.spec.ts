import { expect, test } from "@playwright/test";
import { PNG } from "pngjs";
import { startInCycleSample } from "./cycle-startup.js";

startInCycleSample(test);

test("shares pinned WaveDrom definitions without changing pixels or SVG geometry extraction", async ({ page }) => {
  await page.goto("/?geometrySource=svg");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  // Use a non-zero render index to cover the owner-specific ID rebinding path.
  const rendered = page.locator("[data-role='wave-owner'] svg").nth(1);
  await expect(rendered).toBeVisible();
  await expect(page.locator("svg[data-wavedrom-definition-sprite] defs")).toHaveCount(1);
  await expect(rendered.locator("defs")).toHaveCount(0);

  const setup = await rendered.evaluate((source) => {
    const sprite = document.querySelector<SVGSVGElement>("svg[data-wavedrom-definition-sprite]");
    const defs = sprite?.querySelector("defs");
    if (!sprite || !defs) throw new Error("Shared WaveDrom definition sprite is missing.");
    const fullSvg = source.cloneNode(true) as SVGSVGElement;
    fullSvg.insertBefore(defs.cloneNode(true), fullSvg.firstChild);
    fullSvg.classList.add("wave");
    fullSvg.style.width = "1200px";
    fullSvg.style.height = "140px";
    const sharedSvg = source.cloneNode(true) as SVGSVGElement;
    sharedSvg.classList.add("wave");
    sharedSvg.style.width = "1200px";
    sharedSvg.style.height = "140px";
    const makeFrame = (id: string, body: string) => {
      const frame = document.createElement("iframe");
      frame.id = id;
      frame.width = "1200";
      frame.height = "140";
      frame.style.cssText = "position:fixed;left:-2000px;top:0;border:0";
      frame.srcdoc = `<!doctype html><html><head><style>html,body{margin:0;width:1200px;height:140px;overflow:hidden;background:#fff}svg.wave{display:block;width:1200px;height:140px}</style></head><body>${body}</body></html>`;
      document.body.append(frame);
      return frame;
    };
    const localFrame = makeFrame("wave-local-defs-reference", `<div>${fullSvg.outerHTML}</div>`);
    const sharedFrame = makeFrame("wave-shared-defs-render", `${sprite.outerHTML}<div>${sharedSvg.outerHTML}</div>`);
    return { localFrameId: localFrame.id, sharedFrameId: sharedFrame.id };
  });
  const localFrame = page.locator(`#${setup.localFrameId}`);
  const sharedFrame = page.locator(`#${setup.sharedFrameId}`);
  await expect.poll(async () => localFrame.evaluate((frame) => frame.contentDocument?.readyState)).toBe("complete");
  await expect.poll(async () => sharedFrame.evaluate((frame) => frame.contentDocument?.readyState)).toBe("complete");
  await page.waitForTimeout(80);
  const localPng = PNG.sync.read(await localFrame.screenshot());
  const sharedPng = PNG.sync.read(await sharedFrame.screenshot());
  expect(sharedPng.width).toBe(localPng.width);
  expect(sharedPng.height).toBe(localPng.height);
  expect(Buffer.compare(sharedPng.data, localPng.data)).toBe(0);

  const counters = JSON.parse(await host.getAttribute("data-session-counters") ?? "{}") as { geometryExtraction?: { totalUsesVisited?: number } };
  expect(counters.geometryExtraction?.totalUsesVisited).toBeGreaterThan(0);
});
