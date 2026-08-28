import { expect, test } from "@playwright/test";

test("copies, pastes, and duplicates a group as one semantic batch", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const surface = host.locator("[data-role='timing-chart-surface']");
  const ribbon = page.getByTestId("ribbon");
  const sourceRows = surface.locator("[data-role='left-row'][data-group-id='grp_cycle_control'][data-row-id]");
  await expect(sourceRows).toHaveCount(5);

  const beforeCopy = {
    revision: await host.getAttribute("data-canonical-revision"),
    history: await page.getByTestId("history-status").textContent(),
    counters: await surface.getAttribute("data-render-counters"),
  };
  await host.locator("[data-role='left-group-header'][data-group-id='grp_cycle_control'] [data-role='tree-branch']").first().click();
  await expect(page.getByTestId("selection-status")).toHaveText("Control");
  await ribbon.getByRole("button", { name: "Copy", exact: true }).click();
  expect(await host.getAttribute("data-canonical-revision")).toBe(beforeCopy.revision);
  expect(await page.getByTestId("history-status").textContent()).toBe(beforeCopy.history);
  expect(await surface.getAttribute("data-render-counters")).toBe(beforeCopy.counters);
  await expect(page.getByTestId("clipboard-status")).toHaveText("Copied Control group");

  await ribbon.getByRole("button", { name: "Paste", exact: true }).click();
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await expect(page.getByTestId("selection-status")).toHaveText("Control");
  const afterPasteCounters = JSON.parse((await surface.getAttribute("data-render-counters"))!);
  const beforeCounters = JSON.parse(beforeCopy.counters!);
  expect(afterPasteCounters.waveDromRenders).toBeGreaterThan(beforeCounters.waveDromRenders);
  expect(afterPasteCounters.localGeometryBuilds).toBeGreaterThan(beforeCounters.localGeometryBuilds);

  const pastedDocument = await page.evaluate(() => JSON.parse(localStorage.getItem("timing-chart-v2.recent") ?? "null"));
  expect(pastedDocument).toBeNull();
  await ribbon.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 1");
  await ribbon.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await ribbon.getByRole("button", { name: "Duplicate", exact: true }).first().click();
  await expect(page.getByTestId("history-status")).toHaveText("History 2 / Redo 0");

  const download = page.waitForEvent("download");
  await ribbon.getByRole("button", { name: "Save", exact: true }).click();
  await download;
  await expect(page.getByTestId("history-status")).toHaveText("History 2 / Redo 0");
  const savedDocument = await page.evaluate(() => JSON.parse(localStorage.getItem("timing-chart-v2.recent") ?? "null"));
  expect(savedDocument.signalGroups).toHaveLength(5);
  const originalGroup = savedDocument.signalGroups.find((group: { id: string }) => group.id === "grp_cycle_control");
  const copiedGroups = savedDocument.signalGroups.filter((group: { name: string }) => group.name === originalGroup.name);
  expect(copiedGroups).toHaveLength(3);
  const copiedGroup = copiedGroups.find((group: { id: string }) => group.id !== originalGroup.id);
  expect(copiedGroup.id).not.toBe(originalGroup.id);
  expect(copiedGroup.rows).toHaveLength(originalGroup.rows.length);
  expect(new Set(copiedGroup.rows)).not.toEqual(new Set(originalGroup.rows));
  const originalSignals = new Map(savedDocument.signals.filter((signal: { id: string }) => originalGroup.rows.includes(signal.id)).map((signal: { id: string; source: unknown }) => [signal.id, signal]));
  for (const rowId of copiedGroup.rows) {
    const copiedSignal = savedDocument.signals.find((signal: { id: string }) => signal.id === rowId);
    const originalSignal = [...originalSignals.values()].find((signal: { source: unknown }) => JSON.stringify(signal.source) === JSON.stringify(copiedSignal.source));
    expect(copiedSignal).toBeTruthy();
    expect(originalSignal).toBeTruthy();
    expect(copiedSignal.id).not.toBe(originalSignal.id);
  }

  const savedPath = await (await download).path();
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(savedPath!);
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
});

test("cuts and pastes a group with its rows as one semantic batch", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  const surface = host.locator("[data-role='timing-chart-surface']");
  const ribbon = page.getByTestId("ribbon");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await host.locator("[data-role='left-group-header'][data-group-id='grp_cycle_payload'] [data-role='tree-branch']").click();
  await ribbon.getByRole("button", { name: "Cut", exact: true }).click();
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await expect(page.getByTestId("clipboard-status")).toHaveText("Cut Payload group");
  await expect(surface.locator("[data-role='left-row'][data-group-id='grp_cycle_payload'][data-row-id]")).toHaveCount(0);
  await ribbon.getByRole("button", { name: "Paste", exact: true }).click();
  await expect(page.getByTestId("history-status")).toHaveText("History 2 / Redo 0");
  await expect(page.getByTestId("selection-status")).toHaveText("Payload");
  const download = page.waitForEvent("download");
  await ribbon.getByRole("button", { name: "Save", exact: true }).click();
  await download;
  const savedDocument = await page.evaluate(() => JSON.parse(localStorage.getItem("timing-chart-v2.recent") ?? "null"));
  const groups = savedDocument.signalGroups.filter((group: { name: string }) => group.name === "Payload");
  expect(groups).toHaveLength(1);
  expect(groups[0].id).not.toBe("grp_cycle_payload");
  expect(groups[0].rows).toHaveLength(3);
});
