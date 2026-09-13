import { expect, test } from "@playwright/test";
import { canonicalFixture } from "../fixtures/canonical";

// Ruler/grid ticks used to thin at a fixed 80-cycle cap regardless of zoom
// (`presentation-cycles.ts`'s old `MAX_PRESENTATION_CYCLES`), so a document
// longer than 80 cycles always showed only every-other cycle number even at
// 100% zoom with plenty of screen space per cycle -- misread as "cycle
// numbers aren't incrementing by 1". Thinning must depend on actual on-
// screen pixel pitch, not a fixed cycle-count cap.
//
// This only asserts the ticks that ARE rendered stay contiguous (no skipped
// integers) at a pitch wide enough to show every one, rather than a fixed
// total tick count: the initially-rendered geometry window is a separate,
// pre-existing concern (unrelated to this fix -- confirmed identical before
// and after it) independent of the ruler's own thinning decision.

test("Cycle ruler labels increment by 1 at 100% zoom on a document with more than 80 cycles", async ({ page }) => {
  const source = canonicalFixture();
  const longDocument = { ...source, timeline: { ...source.timeline, end: 160, cycleCount: 160 } };
  await page.goto("/");
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "long-document.tcd", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(longDocument)) });
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();

  const ticks = page.locator(".cycle-tick");
  await expect(ticks).not.toHaveCount(0);
  const texts = await ticks.evaluateAll((elements) => elements.map((element) => Number(element.textContent)));
  expect(texts.length).toBeGreaterThan(5);
  for (let index = 1; index < texts.length; index += 1) expect(texts[index] - texts[index - 1], `gap between tick ${index - 1} and ${index}`).toBe(1);
});
