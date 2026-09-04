import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });

test("Inspector keeps multiple sections open and collapses content without document mutation", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("cycle-surface").locator("[data-role='frozen-row'][data-row-id='sig_cycle_clock']").click();
  const inspector = page.getByTestId("inspector");
  const surface = page.locator("[data-role='timing-chart-surface']");
  const before = {
    revision: await surface.getAttribute("data-canonical-revision"),
    history: await surface.getAttribute("data-history-depth"),
    dirty: await page.locator(".editor-shell").getAttribute("data-workspace-preset"),
    counters: await surface.getAttribute("data-render-counters"),
  };
  const label = inspector.getByRole("button", { name: "Label Style", exact: true });
  const waveform = inspector.locator("[data-section-id='waveform']");
  await expect(label).toHaveAttribute("aria-expanded", "false");
  await expect(waveform).toBeVisible();

  await label.click();
  await expect(label).toHaveAttribute("aria-expanded", "true");
  await expect(inspector.getByLabel("Inspector text color")).toBeVisible();
  await expect(waveform).toBeVisible();
  await expect(inspector.getByRole("button", { name: "Signal Properties", exact: true })).toHaveAttribute("aria-expanded", "true");
  await expect(inspector.getByRole("button", { name: "Waveform / Timing", exact: true })).toHaveAttribute("aria-expanded", "true");

  await label.focus();
  await page.keyboard.press("Space");
  await expect(label).toHaveAttribute("aria-expanded", "false");
  await expect(inspector.getByLabel("Inspector text color")).toBeHidden();
  await expect(inspector.getByRole("button", { name: "Signal Properties", exact: true })).toHaveAttribute("aria-expanded", "true");
  await expect(inspector.getByRole("button", { name: "Waveform / Timing", exact: true })).toHaveAttribute("aria-expanded", "true");
  expect(await surface.getAttribute("data-canonical-revision")).toBe(before.revision);
  expect(await surface.getAttribute("data-history-depth")).toBe(before.history);
  expect(await page.locator(".editor-shell").getAttribute("data-workspace-preset")).toBe(before.dirty);
  expect(await surface.getAttribute("data-render-counters")).toBe(before.counters);
});

test("Inspector accordion state survives a clock property Apply", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("cycle-surface").locator("[data-role='frozen-row'][data-row-id='sig_cycle_clock']").click();
  const inspector = page.getByTestId("inspector");
  const label = inspector.getByRole("button", { name: "Label Style", exact: true });
  const signalProperties = inspector.getByRole("button", { name: "Signal Properties", exact: true });
  if (await label.getAttribute("aria-expanded") !== "true") await label.click();
  if (await signalProperties.getAttribute("aria-expanded") !== "true") await signalProperties.click();
  await expect(label).toHaveAttribute("aria-expanded", "true");
  await inspector.getByLabel("Inspector signal name", { exact: true }).fill("clk_main_updated");
  const apply = inspector.getByTestId("apply-inspector-clock-properties");
  await expect(apply).toBeAttached();
  await apply.evaluate((element) => (element as HTMLButtonElement).click());
  await expect(page.getByTestId("inspector").getByRole("button", { name: "Label Style", exact: true })).toHaveAttribute("aria-expanded", "true");
});
