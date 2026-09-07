import { expect, test } from "@playwright/test";

// #472: Signal Inspector's "Waveform Color" was stored in Canonical
// (Signal.display.style.waveformColor) and survived Save/Open, but nothing
// in the render pipeline ever read it -- the WaveDrom-generated SVG's own
// embedded <style> hardcodes its wave stroke at the unstyled default
// (#000) independent of Canonical presentation. Applying a new color never
// reached the actual Canvas. Fixed as a presentation-only repaint on the
// already-rendered SVG subtree (packages/renderer/src/stable-surface.ts),
// scoped per-Signal by inspecting each owner's own embedded style for
// classes currently drawn at the default stroke -- never by regenerating
// WaveDrom semantics/geometry, and never a second style-truth owner.

async function ready(page: import("@playwright/test").Page) {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
}

function waveformStroke(page: import("@playwright/test").Page, signalId: string) {
  return page.locator(`[data-role='wave-owner'][data-signal-id='${signalId}'] path`).first().evaluate((el) => getComputedStyle(el).stroke);
}

test("Waveform Color Apply repaints the actual rendered waveform stroke, leaves unrelated Signals alone, and stays exact through Undo/Redo/reselection", async ({ page }) => {
  await ready(page);
  const host = page.getByTestId("cycle-surface");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_reset_n']").click();

  expect(await waveformStroke(page, "sig_cycle_reset_n")).toBe("rgb(0, 0, 0)");
  const colorInput = page.getByLabel("Inspector waveform color");
  await colorInput.fill("#ff0000");
  // Draft: pre-Apply, the Canvas is unchanged.
  expect(await waveformStroke(page, "sig_cycle_reset_n")).toBe("rgb(0, 0, 0)");
  expect(await waveformStroke(page, "sig_cycle_request")).toBe("rgb(0, 0, 0)");

  await page.getByTestId("inspector").getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  expect(await waveformStroke(page, "sig_cycle_reset_n")).toBe("rgb(255, 0, 0)");
  // Unrelated Signal untouched.
  expect(await waveformStroke(page, "sig_cycle_request")).toBe("rgb(0, 0, 0)");

  // Reselection: Inspector value and Canvas stay synchronized.
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_reset_n']").click();
  await expect(colorInput).toHaveValue("#ff0000");
  expect(await waveformStroke(page, "sig_cycle_reset_n")).toBe("rgb(255, 0, 0)");

  // Undo/Redo exact.
  await page.getByTestId("ribbon").getByRole("button", { name: "Undo", exact: true }).click();
  expect(await waveformStroke(page, "sig_cycle_reset_n")).toBe("rgb(0, 0, 0)");
  await page.getByTestId("ribbon").getByRole("button", { name: "Redo", exact: true }).click();
  expect(await waveformStroke(page, "sig_cycle_reset_n")).toBe("rgb(255, 0, 0)");
});

test("Waveform Color survives Save/Open and re-renders visibly, and applies correctly to a Bus Signal", async ({ page }) => {
  await ready(page);
  const host = page.getByTestId("cycle-surface");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_data']").click();
  await page.getByLabel("Inspector waveform color").fill("#0000ff");
  await page.getByTestId("inspector").getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  expect(await waveformStroke(page, "sig_cycle_data")).toBe("rgb(0, 0, 255)");

  const downloadPromise = page.waitForEvent("download");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Save", exact: true }).click();
  const savedPath = await (await downloadPromise).path();
  expect(savedPath).toBeTruthy();
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(savedPath!);
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
  expect(await waveformStroke(page, "sig_cycle_data")).toBe("rgb(0, 0, 255)");
});
