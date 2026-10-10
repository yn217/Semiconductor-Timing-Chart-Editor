import { expect, test } from "@playwright/test";
import { startInCycleSample } from "./cycle-startup.js";

startInCycleSample(test);

async function openClockEditor(page: import("@playwright/test").Page) {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_clock']").click({ position: { x: 30, y: 10 } });
  return page.getByTestId("signal-editor");
}

// Review finding 3: applying one Clock section must not discard the other
// section's unapplied draft.
test("applying Edge Counter keeps an unapplied Generator draft", async ({ page }) => {
  const editor = await openClockEditor(page);
  await editor.getByLabel("Clock period").fill("6");
  await editor.getByLabel("Clock edge counter start").fill("7");
  await editor.getByRole("button", { name: "Apply edge counter" }).click();
  await expect(editor.getByLabel("Clock period")).toHaveValue("6");
  await expect(editor.getByTestId("clock-generator-unapplied")).toBeVisible();
});

test("applying the Generator keeps an unapplied Edge Counter draft", async ({ page }) => {
  const editor = await openClockEditor(page);
  await editor.getByLabel("Clock edge counter start").fill("7");
  await editor.getByLabel("Clock period").fill("6");
  await editor.getByRole("button", { name: "Apply generator" }).click();
  await expect(editor.getByLabel("Clock edge counter start")).toHaveValue("7");
  await expect(editor.getByTestId("clock-edge-counter-unapplied")).toBeVisible();
});

// Review finding 4: importing clock settings must update the Suppressed
// periods text field, not leave the stale text behind.
test("importing clock settings updates the Suppressed periods field", async ({ page }) => {
  const editor = await openClockEditor(page);
  const settings = {
    signalId: "sig_cycle_clock",
    name: "clock",
    generator: { start: 0, period: 4, duty: 0.5, phase: 0, initial: 0, polarity: "positive", suppressedPeriods: [2, 5] },
    edgeCounter: { show: false, mode: "rising", startNumber: 0, countFrom: "signal-start", labelEvery: 1, position: "above", offset: { x: 0, y: 0 } },
  };
  await editor.getByLabel("Import clock settings").setInputFiles({ name: "clock.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(settings)) });
  await expect(editor.getByLabel("Clock suppressed periods")).toHaveValue("2, 5");
  await expect(editor.getByLabel("Clock period")).toHaveValue("4");
});
