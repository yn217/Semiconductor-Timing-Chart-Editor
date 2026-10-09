import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { canonicalFixture } from "../fixtures/canonical.js";
import type { SignalId, TransactionId } from "@timing-chart-v2/schema";
import { startInCycleSample } from "./cycle-startup.js";
import { generatePerformanceDocument } from "@timing-chart-v2/testing";

startInCycleSample(test);

async function saveCanonicalDocument(page: Page) {
  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByTestId("ribbon").getByRole("button", { name: "Save", exact: true }).click();
  const path = await (await downloadPromise).path();
  if (!path) throw new Error("Save did not produce a document file.");
  const value = JSON.parse(await readFile(path, "utf8"));
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Home", exact: true }).click();
  return value as { signalGroups: Array<{ id: string; name: string; rows: string[] }>; signals: Array<Record<string, any>> };
}

function signalChanges(signal: Record<string, any>) {
  return signal.type === "clock" ? signal.enable ?? [] : signal.type === "commentRow" ? [] : signal.values ?? [];
}

test("duplicates a 2000-row Group with fresh identities and exact one-step Undo/Redo", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const fixture = generatePerformanceDocument({ signalCount: 2000, cycleCount: 40, profile: "standard" });
  const group = { ...fixture.signalGroups[0]!, rows: fixture.signals.map((signal) => signal.id), spacers: [] };
  const document = { ...fixture, signalGroups: [group] };
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "group-2000.tcd.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(document)) });
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(page.locator(".editor-shell")).toHaveAttribute("data-signal-count", "2000");
  const ribbon = page.getByTestId("ribbon");
  const save = async () => {
    const download = page.waitForEvent("download");
    await ribbon.getByRole("button", { name: "Save", exact: true }).click();
    return JSON.parse(await readFile((await (await download).path())!, "utf8"));
  };
  const before = await save();
  await host.locator(`[data-role='left-group-header'][data-group-id='${group.id}'] [data-role='tree-branch']`).first().click();
  await ribbon.getByRole("button", { name: "Duplicate", exact: true }).first().click();
  await expect(page.locator(".editor-shell")).toHaveAttribute("data-signal-count", "4000");
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  const after = await save();
  const copied = after.signalGroups.find((item: { id: string }) => item.id !== group.id);
  expect(copied.rows).toHaveLength(2000);
  const originalIds = new Set(group.rows);
  expect(copied.rows.every((id: SignalId) => !originalIds.has(id))).toBe(true);
  expect(new Set(after.signals.map((signal: { id: string }) => signal.id)).size).toBe(4000);
  const byId = new Map(after.signals.map((signal: { id: string }) => [signal.id, signal]));
  copied.rows.forEach((id: string, index: number) => {
    const { id: _originalId, ...original } = before.signals[index];
    const { id: _copiedId, ...copy } = byId.get(id) as Record<string, unknown>;
    expect(copy).toEqual(original);
  });
  await ribbon.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 1");
  expect(await save()).toEqual(before);
  await ribbon.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  expect(await save()).toEqual(after);
});

test("copies, pastes, and duplicates a group as one semantic batch", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await expect(host).toHaveAttribute("data-canonical-revision", /^\d+$/); // published after the first render
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
  const savedFile = await download;
  await expect(page.getByTestId("history-status")).toHaveText("History 2 / Redo 0");
  const savedDocument = JSON.parse(await readFile((await savedFile.path())!, "utf8"));
  expect(savedDocument.signalGroups).toHaveLength(5);
  const originalGroup = savedDocument.signalGroups.find((group: { id: string }) => group.id === "grp_cycle_control");
  const copiedGroups = savedDocument.signalGroups.filter((group: { name: string }) => group.name === originalGroup.name);
  expect(copiedGroups).toHaveLength(3);
  const copiedGroup = copiedGroups.find((group: { id: string }) => group.id !== originalGroup.id);
  expect(copiedGroup.id).not.toBe(originalGroup.id);
  expect(copiedGroup.rows).toHaveLength(originalGroup.rows.length);
  expect(new Set(copiedGroup.rows)).not.toEqual(new Set(originalGroup.rows));
  const originalSignals = new Map(savedDocument.signals.filter((signal: { id: string }) => originalGroup.rows.includes(signal.id)).map((signal: { id: string; source: unknown }) => [signal.id, signal]));
  const originalNestedIds = new Set([...originalSignals.values()].flatMap((signal: Record<string, any>) => signalChanges(signal).flatMap((change: Record<string, unknown>) => typeof change.id === "string" ? [change.id] : [])));
  const copiedNestedIds: string[] = [];
  for (const copiedGroup of copiedGroups.filter((group: { id: string }) => group.id !== originalGroup.id)) {
    for (let index = 0; index < copiedGroup.rows.length; index += 1) {
      const copiedSignal = savedDocument.signals.find((signal: { id: string }) => signal.id === copiedGroup.rows[index]);
      const originalSignal = savedDocument.signals.find((signal: { id: string }) => signal.id === originalGroup.rows[index]);
      expect(copiedSignal).toBeTruthy();
      expect(originalSignal).toBeTruthy();
      expect(copiedSignal!.id).not.toBe(originalSignal!.id);
      expect(signalChanges(copiedSignal!).map(({ id: _id, ...change }: Record<string, unknown>) => change)).toEqual(signalChanges(originalSignal!).map(({ id: _id, ...change }: Record<string, unknown>) => change));
      const sourceIds = signalChanges(originalSignal!).flatMap((change: Record<string, unknown>) => typeof change.id === "string" ? [change.id] : []);
      const copiedIds = signalChanges(copiedSignal!).flatMap((change: Record<string, unknown>) => typeof change.id === "string" ? [change.id] : []);
      expect(copiedIds).toHaveLength(sourceIds.length);
      expect(copiedIds.some((id: string) => sourceIds.includes(id))).toBe(false);
      copiedNestedIds.push(...copiedIds);
    }
  }
  expect(new Set([...originalNestedIds, ...copiedNestedIds]).size).toBe(originalNestedIds.size + copiedNestedIds.length);

  const savedPath = await (await download).path();
  expect(savedPath).toBeTruthy();
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(savedPath!);
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
  expect(await saveCanonicalDocument(page)).toEqual(savedDocument);
});

test("cuts and pastes a group with its rows as one semantic batch", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  const surface = host.locator("[data-role='timing-chart-surface']");
  const ribbon = page.getByTestId("ribbon");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const before = await saveCanonicalDocument(page);
  const originalGroup = before.signalGroups.find((group) => group.id === "grp_cycle_payload")!;
  const originalSignals = new Map(before.signals.filter((signal) => originalGroup.rows.includes(signal.id)).map((signal) => [signal.id, signal]));
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
  const savedFile = await download;
  const savedDocument = JSON.parse(await readFile((await savedFile.path())!, "utf8"));
  const groups = savedDocument.signalGroups.filter((group: { name: string }) => group.name === "Payload");
  expect(groups).toHaveLength(1);
  expect(groups[0].id).not.toBe("grp_cycle_payload");
  expect(groups[0].rows).toHaveLength(3);
  expect(groups[0].rows).toEqual(originalGroup.rows);
  for (const rowId of groups[0].rows as string[]) {
    const beforeSignal = originalSignals.get(rowId)!;
    const afterSignal = savedDocument.signals.find((signal: { id: string }) => signal.id === rowId)!;
    expect(signalChanges(afterSignal).map(({ id: _id, ...change }: Record<string, unknown>) => change)).toEqual(signalChanges(beforeSignal).map(({ id: _id, ...change }: Record<string, unknown>) => change));
    expect(signalChanges(afterSignal).map((change: Record<string, unknown>) => change.id)).toEqual(signalChanges(beforeSignal).map((change: Record<string, unknown>) => change.id));
  }
});

test("Group Cut → Paste preserves external Transaction links through the production clipboard route", async ({ page }) => {
  const source = canonicalFixture();
  const clockId = source.signals[0]!.id;
  const linkedSignal = source.signals[1]!;
  const document = {
    ...source,
    signalGroups: [
      { ...source.signalGroups[0]!, rows: [clockId] },
      { id: "grp_linked_payload", name: "Linked Payload", rows: [linkedSignal.id] },
    ],
    transactions: [{ id: "txn_linked_payload" as TransactionId, name: "Read", start: 1, end: 5, laneId: "lane_0", linkedSignals: [linkedSignal.id, clockId] }],
  };

  await page.goto("/");
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({
    name: "group-cut-links.tcd.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(document)),
  });
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const before = await saveCanonicalDocument(page);
  const originalSignal = before.signals.find((signal) => signal.id === linkedSignal.id)!;
  const ribbon = page.getByTestId("ribbon");
  const groupHeader = host.locator("[data-role='left-group-header'][data-group-id='grp_linked_payload']");
  await groupHeader.locator("[data-role='tree-branch']").click();
  await ribbon.getByRole("button", { name: "Cut", exact: true }).click();
  await expect(page.getByTestId("clipboard-status")).toHaveText("Cut Linked Payload group");
  await ribbon.getByRole("button", { name: "Paste", exact: true }).click();
  await expect(page.getByTestId("history-status")).toHaveText("History 2 / Redo 0");

  const download = page.waitForEvent("download");
  await ribbon.getByRole("button", { name: "Save", exact: true }).click();
  const saved = JSON.parse(await readFile((await (await download).path())!, "utf8")) as {
    signalGroups: readonly { id: string; name: string; rows: readonly string[] }[];
    transactions: readonly { id: string; linkedSignals?: readonly string[] }[];
  };
  const pastedGroup = saved.signalGroups.find((group) => group.name === "Linked Payload");
  expect(pastedGroup).toBeTruthy();
  expect(pastedGroup!.id).not.toBe("grp_linked_payload");
  expect(pastedGroup!.rows).toHaveLength(1);
  expect(pastedGroup!.rows[0]).toBe(linkedSignal.id);
  const restoredSignal = saved.signals.find((signal) => signal.id === linkedSignal.id)!;
  expect(signalChanges(restoredSignal).map(({ id: _id, ...change }: Record<string, unknown>) => change)).toEqual(signalChanges(originalSignal).map(({ id: _id, ...change }: Record<string, unknown>) => change));
  expect(signalChanges(restoredSignal).map((change: Record<string, unknown>) => change.id)).toEqual(signalChanges(originalSignal).map((change: Record<string, unknown>) => change.id));
  expect(saved.transactions.find((transaction) => transaction.id === "txn_linked_payload")?.linkedSignals)
    .toEqual([clockId, pastedGroup!.rows[0] as SignalId]);
});
