import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

test("multiple TimeGroups keep stable IDs, axis-break markers, history, and Save/Open semantics", async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto("/");
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const timeline = page.getByTestId("timeline-editor");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Timeline", exact: true }).click();
  const before = {
    revision: await host.getAttribute("data-canonical-revision"),
    history: await page.getByTestId("history-status").textContent(),
    dirty: await page.getByTestId("dirty-status").textContent(),
  };
  const expectHistory = async (undoDepth: number, redoDepth = 0) => expect(page.getByTestId("history-status")).toHaveText(`History ${undoDepth} / Redo ${redoDepth}`);
  const setRange = async (start: number, end: number) => {
    await timeline.getByLabel("Timeline range end").fill(String(end));
    await timeline.getByLabel("Timeline range start").fill(String(start));
    await expect(timeline.getByLabel("Timeline range start")).toHaveValue(String(start));
    await expect(timeline.getByLabel("Timeline range end")).toHaveValue(String(end));
  };
  const groupIds = () => timeline.locator("[data-time-group-id]");
  const markerIds = async () => page.locator(".cycle-ruler [data-time-group-id]").evaluateAll((items) => items.map((item) => item.getAttribute("data-time-group-id")));

  await setRange(2, 4);
  await timeline.getByTestId("time-group-create").click();
  await expect(groupIds()).toHaveCount(1);
  const firstId = (await groupIds().first().getAttribute("data-time-group-id"))!;
  await expectHistory(1);

  await setRange(6, 8);
  await timeline.getByTestId("time-group-create").click();
  await expect(groupIds()).toHaveCount(2);
  const secondId = (await groupIds().nth(1).getAttribute("data-time-group-id"))!;
  expect(secondId).not.toBe(firstId);
  await expectHistory(2);

  await timeline.getByTestId(`time-group-edit-${firstId}`).click();
  await page.getByLabel("Time Group name").fill("Boot Window");
  await page.getByLabel("Time Group comment").fill("edited through the production editor");
  await page.getByLabel("Time Group fold label").fill("BOOT");
  await page.getByTestId("apply-time-group").click();
  await expect(groupIds()).toHaveCount(2);
  await expect(timeline.getByTestId(`time-group-edit-${firstId}`)).toContainText("Boot Window");
  await expectHistory(3);

  await timeline.getByTestId(`time-group-collapse-${firstId}`).click();
  await expect(page.locator(`.cycle-ruler [data-time-group-id='${firstId}']`)).toHaveCount(1);
  await expect(page.locator(".cycle-ruler [data-time-group-id]")).toHaveCount(1);
  await expectHistory(4);
  await timeline.getByTestId(`time-group-collapse-${secondId}`).click();
  await expect(page.locator(".cycle-ruler [data-time-group-id]")).toHaveCount(2);
  await expect.poll(markerIds).toEqual([firstId, secondId]);
  await expectHistory(5);

  await timeline.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator(".cycle-ruler [data-time-group-id]")).toHaveCount(1);
  await expect(page.locator(`.cycle-ruler [data-time-group-id='${firstId}']`)).toHaveCount(1);
  await expectHistory(4, 1);
  await timeline.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(page.locator(".cycle-ruler [data-time-group-id]")).toHaveCount(2);
  await expect.poll(markerIds).toEqual([firstId, secondId]);
  await expectHistory(5);

  const saveDownload = page.waitForEvent("download");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Save", exact: true }).click();
  const savedPath = await (await saveDownload).path();
  expect(savedPath).toBeTruthy();
  const saved = JSON.parse(await readFile(savedPath!, "utf8")) as { timeGroups: readonly { id: string; name: string; start: number; end: number; comment?: string; presentation?: { collapsed?: boolean; foldStyle?: string; foldLabel?: string } }[] };
  expect(saved.timeGroups).toHaveLength(2);
  expect(saved.timeGroups.map((group) => group.id)).toEqual([firstId, secondId]);
  expect(saved.timeGroups).toEqual([
    expect.objectContaining({ id: firstId, name: "Boot Window", start: 2, end: 4, comment: "edited through the production editor", presentation: expect.objectContaining({ collapsed: true, foldStyle: "axis-break", foldLabel: "BOOT" }) }),
    expect.objectContaining({ id: secondId, start: 6, end: 8, presentation: expect.objectContaining({ collapsed: true, foldStyle: "axis-break" }) }),
  ]);
  await expectHistory(5);
  await expect(page.getByTestId("dirty-status")).toHaveText("Clean");

  await page.locator(".ribbon-tabs").getByRole("button", { name: "Timeline", exact: true }).click();
  await timeline.getByTestId(`time-group-ungroup-${secondId}`).click();
  await expect(groupIds()).toHaveCount(1);
  await expect(page.locator(".cycle-ruler [data-time-group-id]")).toHaveCount(1);
  await expectHistory(6);
  await timeline.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(groupIds()).toHaveCount(2);
  await expect(page.locator(".cycle-ruler [data-time-group-id]")).toHaveCount(2);
  await expectHistory(5, 1);
  await timeline.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(groupIds()).toHaveCount(1);
  await expect(page.locator(".cycle-ruler [data-time-group-id]")).toHaveCount(1);
  await expectHistory(6);

  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(savedPath!);
  await expect(page.getByTestId("unsaved-file-dialog")).toBeVisible();
  await page.getByTestId("unsaved-discard").click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(groupIds()).toHaveCount(2);
  await expect.poll(markerIds).toEqual([firstId, secondId]);
  await expect(timeline.getByTestId(`time-group-edit-${firstId}`)).toContainText("Boot Window");
  await expect(page.locator(`.cycle-ruler [data-time-group-id='${firstId}']`)).toHaveCount(1);
  await expect(page.locator(`.cycle-ruler [data-time-group-id='${secondId}']`)).toHaveCount(1);
  await expectHistory(0);
  await expect(page.getByTestId("dirty-status")).toHaveText("Clean");
  await expect(host).toHaveAttribute("data-canonical-revision", "0");
  expect(before.revision).toBe("0");
  expect(before.history).toBe("History 0 / Redo 0");
  expect(before.dirty).toBe("Clean");
});
