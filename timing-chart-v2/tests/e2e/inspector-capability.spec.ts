import { expect, test } from "@playwright/test";

test("Signal Inspector exposes parity fields and applies one transient draft command", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_data']").click();

  const inspector = page.getByTestId("inspector");
  await expect(inspector).toHaveAttribute("data-inspector-context", "signal");
  for (const label of [
    "Inspector signal name", "Inspector signal role", "Inspector signal type",
    "Inspector signal width", "Inspector signal visible", "Inspector text color",
    "Inspector label background", "Inspector label font", "Inspector label size",
    "Inspector label bold", "Inspector label align", "Inspector label overflow",
    "Inspector waveform color", "Inspector waveform background", "Inspector waveform row style",
  ]) await expect(inspector.getByLabel(label)).toBeVisible();
  await expect(inspector.getByText("Instance Path")).toBeVisible();
  await expect(inspector.getByText("Full Path")).toBeVisible();

  const surface = host.locator("[data-role='timing-chart-surface']");
  const before = {
    revision: await host.getAttribute("data-canonical-revision"),
    history: await page.getByTestId("history-status").textContent(),
    dirty: await page.getByTestId("dirty-status").textContent(),
    counters: await surface.getAttribute("data-render-counters"),
    session: await host.getAttribute("data-session-counters"),
  };
  const unrelatedClockSvg = await surface.locator("[data-signal-id='sig_cycle_clock'] > svg").elementHandle();

  await inspector.getByLabel("Inspector signal name").fill("DATA_RENAMED");
  await inspector.getByLabel("Inspector signal role").selectOption("output");
  await inspector.getByLabel("Inspector signal width").fill("16");
  await inspector.getByLabel("Inspector label font").fill("Arial");
  await inspector.getByLabel("Inspector label size").fill("14");
  await inspector.getByLabel("Inspector label bold").check();
  await inspector.getByLabel("Inspector waveform row style").fill("{}");

  // Draft typing is transient and must not enter the canonical session.
  expect(await host.getAttribute("data-canonical-revision")).toBe(before.revision);
  expect(await page.getByTestId("history-status").textContent()).toBe(before.history);
  expect(await page.getByTestId("dirty-status").textContent()).toBe(before.dirty);
  expect(await surface.getAttribute("data-render-counters")).toBe(before.counters);
  expect(await host.getAttribute("data-session-counters")).toBe(before.session);

  await inspector.getByTestId("apply-inspector-signal").click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(page.getByTestId("revision-status")).toHaveText("Canonical revision 1");
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await expect(page.getByTestId("dirty-status")).toHaveText("Modified");
  await expect(host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_data']")).toContainText("DATA_RENAMED");
  await expect(inspector.getByLabel("Inspector signal width")).toHaveValue("16");
  const after = JSON.parse(await surface.getAttribute("data-render-counters") ?? "null") as Record<string, number>;
  const beforeCounters = JSON.parse(before.counters ?? "null") as Record<string, number>;
  // Width is a semantic waveform property: only the edited target may
  // invalidate its WaveDrom/local geometry owner, once.
  expect(after.waveDromRenders).toBe(beforeCounters.waveDromRenders + 1);
  expect(after.localGeometryBuilds).toBe(beforeCounters.localGeometryBuilds + 1);
  const currentClockSvg = await surface.locator("[data-signal-id='sig_cycle_clock'] > svg").elementHandle();
  expect(await unrelatedClockSvg!.evaluate((beforeNode, afterNode) => beforeNode === afterNode, currentClockSvg)).toBe(true);

  await page.getByTestId("editor-undo").click();
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 1");
  await expect(host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_data']")).toContainText("DATA[7:0]");
  await expect(inspector.getByLabel("Inspector signal width")).toHaveValue("8");
});
