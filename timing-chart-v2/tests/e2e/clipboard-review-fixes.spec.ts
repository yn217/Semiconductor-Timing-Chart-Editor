import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { startInCycleSample } from "./cycle-startup.js";

startInCycleSample(test);

function signal(id: string, name = id.toUpperCase()) {
  return { id, name, type: "binary", role: "internal", source: { instancePath: [], signalName: name.toLowerCase() }, display: { name }, values: [{ start: 0, value: 0 }, { start: 4, value: 1 }] };
}

function clipboardDocument(id: string, overrides: Record<string, unknown>) {
  return {
    formatVersion: 2,
    document: { id, title: id, header: { subtitle: "", description: "", notes: "", preconditions: [], constraints: [], exceptions: [] }, footer: { figureNumber: "", revision: "V2", text: "" } },
    timeline: { start: 0, end: 8, cycleCount: 8, timeBase: "cycle", edge: "rising", labelAnchors: [] },
    signalGroups: [],
    signals: [],
    bookmarks: [], timeGroups: [], annotations: [], transactions: [], constraints: [],
    legend: { show: false, orientation: "horizontal", usedRolesOnly: true, position: { x: 0, y: 0 } },
    layout: { roleColumnWidth: 62, signalNameWidth: 178, signalNameAlign: "left", rowHeight: 30, signalSpacing: 4, overflow: "ellipsis" },
    checkSettings: {},
    ...overrides,
  };
}

const fourGroups = clipboardDocument("doc_groups", {
  signalGroups: [
    { id: "grp_a", name: "A", rows: ["sig_a"] },
    { id: "grp_g", name: "G", rows: ["sig_g"] },
    { id: "grp_b", name: "B", rows: ["sig_b"] },
    { id: "grp_c", name: "C", rows: ["sig_c"] },
  ],
  signals: [signal("sig_a"), signal("sig_g"), signal("sig_b"), signal("sig_c")],
});

async function openJson(page: Page, value: unknown) {
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "clipboard-review.tcd.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(value)) });
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true");
}

async function saveDocument(page: Page) {
  const download = page.waitForEvent("download");
  await page.getByTestId("ribbon").getByRole("button", { name: "Save", exact: true }).click();
  return JSON.parse(await readFile((await (await download).path())!, "utf8"));
}

test("paste after reopening the same document is accepted", async ({ page }) => {
  const document = clipboardDocument("doc_same", { signalGroups: [{ id: "grp_main", name: "Main", rows: ["sig_shared"] }], signals: [signal("sig_shared", "SHARED")] });
  await page.goto("/");
  await openJson(page, document);
  const host = page.getByTestId("cycle-surface");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_shared']").click();
  const ribbon = page.getByTestId("ribbon");
  await ribbon.getByRole("button", { name: "Copy", exact: true }).click();
  await expect(page.getByTestId("clipboard-status")).toHaveText("Copied SHARED");

  // Re-opening the same file is the same document: the clipboard stays valid.
  await openJson(page, document);
  await ribbon.getByRole("button", { name: "Paste", exact: true }).click();
  await expect(page.getByTestId("clipboard-status")).toHaveText("Pasted 1 signal");
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
});

test("cut Group paste returns to its original slot", async ({ page }) => {
  await page.goto("/");
  await openJson(page, fourGroups);
  const host = page.getByTestId("cycle-surface");
  await host.locator("[data-role='left-group-header'][data-group-id='grp_g'] [data-role='tree-branch']").first().click();
  const ribbon = page.getByTestId("ribbon");
  await ribbon.getByRole("button", { name: "Cut", exact: true }).click();
  await expect(page.getByTestId("clipboard-status")).toHaveText("Cut G group");
  await ribbon.getByRole("button", { name: "Paste", exact: true }).click();
  await expect(page.getByTestId("clipboard-status")).toHaveText("Pasted G group");

  const saved = await saveDocument(page);
  expect(saved.signalGroups.map((group: { name: string }) => group.name)).toEqual(["A", "G", "B", "C"]);
});

test("pasted Group rows uniquify clashing Signal names and keep the Group name", async ({ page }) => {
  await page.goto("/");
  await openJson(page, fourGroups);
  const host = page.getByTestId("cycle-surface");
  await host.locator("[data-role='left-group-header'][data-group-id='grp_g'] [data-role='tree-branch']").first().click();
  const ribbon = page.getByTestId("ribbon");
  await ribbon.getByRole("button", { name: "Copy", exact: true }).click();
  await expect(page.getByTestId("clipboard-status")).toHaveText("Copied G group");
  await ribbon.getByRole("button", { name: "Paste", exact: true }).click();
  await expect(page.getByTestId("clipboard-status")).toHaveText("Pasted G group");

  const saved = await saveDocument(page);
  const copies = saved.signalGroups.filter((group: { name: string }) => group.name === "G");
  expect(copies).toHaveLength(2);
  const copy = copies.find((group: { id: string }) => group.id !== "grp_g");
  const [copiedSignal] = saved.signals.filter((item: { id: string }) => item.id === copy.rows[0]);
  expect(copiedSignal.name).toBe("SIG_G_copy");
  expect(copiedSignal.display.name).toBe("SIG_G_copy");
  const names = saved.signals.map((item: { name: string }) => item.name);
  expect(new Set(names).size).toBe(names.length);
});

test("pasted annotation whose anchor Signal was deleted is rejected and reported", async ({ page }) => {
  const annotation = { id: "ann_note", type: "text", label: "Note", visible: true, anchor: { signalId: "sig_a", cycle: 2, point: "cycle-start" } };
  await page.goto("/");
  await openJson(page, clipboardDocument("doc_annotation", { signalGroups: [{ id: "grp_main", name: "Main", rows: ["sig_a", "sig_b"] }], signals: [signal("sig_a"), signal("sig_b")], annotations: [annotation] }));
  await page.getByLabel("Ribbon tabs").getByRole("button", { name: "Annotation", exact: true }).click();
  await page.locator(".bottom-tabs").getByRole("tab", { name: "Annotation", exact: true }).click();
  await page.getByTestId("annotation-list").locator("[data-annotation-list-id='ann_note']").click();
  await page.getByLabel("Ribbon tabs").getByRole("button", { name: "Home", exact: true }).click();
  const ribbon = page.getByTestId("ribbon");
  const edit = ribbon.locator(".home-edit-group");
  await edit.getByRole("button", { name: "Cut", exact: true }).click();
  await expect(ribbon.getByTestId("clipboard-status")).toHaveText(/Cut .* annotation/);

  // Delete the Signal the cut annotation was anchored to, then paste the annotation back.
  await page.locator("[data-role='frozen-row'][data-row-id='sig_a']").first().click();
  await ribbon.getByRole("button", { name: "Delete", exact: true }).first().click();
  await expect(page.getByTestId("history-status")).toHaveText("History 2 / Redo 0");
  await page.getByLabel("Ribbon tabs").getByRole("button", { name: "Home", exact: true }).click();
  await edit.getByRole("button", { name: "Paste", exact: true }).click();

  await expect(ribbon.getByTestId("clipboard-status")).toHaveText(/^Paste rejected: .*(sig_a|Signal)/);
  await expect(page.getByTestId("annotation-count-status")).toHaveText("Annotations: 0");
  await expect(page.getByTestId("history-status")).toHaveText("History 2 / Redo 0");
});

test("pasting a cut Signal after reopening the document reports the rejection", async ({ page }) => {
  const document = clipboardDocument("doc_move", { signalGroups: [{ id: "grp_main", name: "Main", rows: ["sig_a", "sig_b"] }], signals: [signal("sig_a"), signal("sig_b")] });
  await page.goto("/");
  await openJson(page, document);
  const host = page.getByTestId("cycle-surface");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_a']").click();
  const ribbon = page.getByTestId("ribbon");
  await ribbon.getByRole("button", { name: "Cut", exact: true }).click();
  await expect(page.getByTestId("clipboard-status")).toHaveText("Cut SIG_A");

  // Re-opening the same file restores sig_a, so moving the cut Signal back collides with its own ID.
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "clipboard-review.tcd.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(document)) });
  await page.getByTestId("unsaved-discard").click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await ribbon.getByRole("button", { name: "Paste", exact: true }).click();
  await expect(page.getByTestId("clipboard-status")).toHaveText(/^Paste rejected: /);
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
});
