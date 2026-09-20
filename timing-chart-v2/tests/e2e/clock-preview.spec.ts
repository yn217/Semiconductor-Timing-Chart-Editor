import { expect, test } from "@playwright/test";
import { startInCycleSample } from "./cycle-startup.js";

startInCycleSample(test);

// #332 item B: Clock "Preview" must actually render a transient draft
// waveform (Period/Duty/Phase, etc.), not just flip a boolean status
// label -- with zero Canonical/History/Dirty delta while previewing, and
// the preview must revert to the real canonical waveform on toggle-off,
// Cancel, or when selection moves away without an explicit Cancel.
test("Clock Preview renders the draft Period on the selected Clock's real waveform with zero Canonical delta, and reverts on Cancel", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_clock']").click();
  const editor = page.getByTestId("signal-editor");
  const mount = host.locator("[data-role='wave-owner'][data-signal-id='sig_cycle_clock']");

  const revisionBefore = await host.getAttribute("data-canonical-revision");
  const historyBefore = await host.getAttribute("data-history-depth");

  await editor.getByTestId("clock-preview").click();
  await editor.getByLabel("Clock period").fill("4");
  await expect(mount).toHaveAttribute("data-clock-preview", "true");
  const previewSvg = mount.locator("svg[data-clock-preview-svg]");
  await expect(previewSvg).toHaveCount(1);
  const canonicalSvg = mount.locator("svg:not([data-clock-preview-svg])");
  await expect(canonicalSvg).toHaveCSS("display", "none");
  // A period-4 draft repeats each clock/static token four times per half
  // cycle where the canonical period-2 generator repeats it only twice --
  // the actual rendered brick sequence must reflect that, not just a
  // status label.
  const previewHrefs = await previewSvg.locator("use").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("xlink:href")));
  expect(previewHrefs.slice(0, 8)).toEqual(["#pclk", "#111", "#111", "#111", "#nclk", "#000", "#000", "#000"]);

  await expect(host).toHaveAttribute("data-canonical-revision", revisionBefore!);
  await expect(host).toHaveAttribute("data-history-depth", historyBefore!);
  await expect(page.getByTestId("dirty-status")).toHaveText("Clean");

  await editor.getByTestId("cancel-bottom-draft").click();
  await expect(mount.locator("svg[data-clock-preview-svg]")).toHaveCount(0);
  await expect(mount.locator("svg")).toHaveCount(1);
  await expect(mount.locator("svg")).not.toHaveCSS("display", "none");
});

test("Clock Preview reverts when the toggle is switched off without Cancel", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_clock']").click();
  const editor = page.getByTestId("signal-editor");
  const mount = host.locator("[data-role='wave-owner'][data-signal-id='sig_cycle_clock']");

  await editor.getByTestId("clock-preview").click();
  await editor.getByLabel("Clock period").fill("4");
  await expect(mount).toHaveAttribute("data-clock-preview", "true");

  await editor.getByTestId("clock-preview").click();
  await expect(mount.locator("svg[data-clock-preview-svg]")).toHaveCount(0);
  await expect(mount.locator("svg")).not.toHaveCSS("display", "none");
});

test("Clock Preview reverts even without an explicit Cancel, when selection moves away", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_clock']").click();
  const editor = page.getByTestId("signal-editor");
  const mount = host.locator("[data-role='wave-owner'][data-signal-id='sig_cycle_clock']");

  await editor.getByTestId("clock-preview").click();
  await editor.getByLabel("Clock period").fill("4");
  await expect(mount).toHaveAttribute("data-clock-preview", "true");

  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  await expect(mount.locator("svg[data-clock-preview-svg]")).toHaveCount(0);
  await expect(mount.locator("svg")).not.toHaveCSS("display", "none");
});

test("Apply after Preview commits exactly the previewed draft as one real SemanticCommand", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_clock']").click();
  const editor = page.getByTestId("signal-editor");
  const mount = host.locator("[data-role='wave-owner'][data-signal-id='sig_cycle_clock']");

  await editor.getByTestId("clock-preview").click();
  await editor.getByLabel("Clock period").fill("4");
  await expect(mount).toHaveAttribute("data-clock-preview", "true");

  const revisionBefore = await host.getAttribute("data-canonical-revision");
  await editor.getByTestId("apply-clock-generator").click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(host).not.toHaveAttribute("data-canonical-revision", revisionBefore!);
  await expect(mount.locator("svg[data-clock-preview-svg]")).toHaveCount(0);
  await expect(mount.locator("svg")).toHaveCount(1);
  await expect(mount.locator("svg")).not.toHaveCSS("display", "none");
  const appliedHrefs = await mount.locator("svg use").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("xlink:href")));
  expect(appliedHrefs.slice(0, 8)).toEqual(["#pclk", "#111", "#111", "#111", "#nclk", "#000", "#000", "#000"]);
});
