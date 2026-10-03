import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { generatePerformanceDocument } from "@timing-chart-v2/testing";
import { readWave } from "./wave-probe.js";
import { documentState, expectViewOnly } from "./view-only.js";

/**
 * #431 section 11 (Enum / State): a State Signal with an Enum definition keeps numeric source values, the symbolic mapping, the Signal's
 * enum binding and the rendered symbolic labels through Save -> Open, with no spurious History/Dirty. Values outside the mapping keep
 * their raw form. Verified through the production File input and the Save download.
 */
const sizes = [{ width: 1280, height: 720 }, { width: 1672, height: 941 }] as const;
const fileInput = (page: Page) => page.locator("input[type='file'][accept='.json,.tcd']");

function enumDocument() {
  const base = generatePerformanceDocument({ signalCount: 4, cycleCount: 24, profile: "standard" });
  const state = { ...base.signals[1]!, type: "state", enumId: "enum_fsm", values: [{ start: 0, value: 0 }, { start: 4, value: 1 }, { start: 8, value: 2 }, { start: 12, value: 7 }] } as unknown as (typeof base.signals)[number];
  return { document: { ...base, signals: [base.signals[0]!, state, ...base.signals.slice(2)], enumDefinitions: [{ id: "enum_fsm", name: "FSM", entries: [{ value: 0, label: "IDLE" }, { value: 1, label: "RUN" }, { value: 2, label: "DONE" }] }] }, stateId: state.id as string };
}

for (const size of sizes) {
  test(`State/Enum keeps values, mapping, binding and symbolic labels through Save -> Open at ${size.width}x${size.height}`, async ({ page }) => {
    test.setTimeout(180_000);
    await page.addInitScript(() => { try { window.localStorage.setItem("timing-chart-v2.view-mode", "Cycle"); } catch { /* best effort */ } });
    await page.setViewportSize(size);
    await page.goto("/");
    const surface = page.getByTestId("cycle-surface");
    await expect(surface).toHaveAttribute("data-cycle-view-ready", "true");
    const { document, stateId } = enumDocument();
    await fileInput(page).setInputFiles({ name: "enum431.tcd.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(document)) });
    await expect(page.locator(".editor-shell")).toHaveAttribute("data-signal-count", "4", { timeout: 60_000 });
    await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 60_000 });

    const symbolicLabels = async () => {
      await expect.poll(async () => (await readWave(page, stateId)).present, { timeout: 30_000 }).toBe(true);
      return (await readWave(page, stateId)).labels.map((label) => label.shownText);
    };
    const first = await symbolicLabels();
    expect(first.join("|"), "symbolic labels rendered for mapped values").toContain("IDLE");
    expect(first.join("|")).toContain("RUN");
    expect(first.join("|")).toContain("DONE");
    expect(first.join("|"), "an unmapped value keeps its raw form").toContain("7");

    // Inspector shows the binding.
    await surface.locator(`[data-role='frozen-row'][data-row-id='${stateId}']`).click();
    await expect(page.getByLabel("Inspector State enum")).toHaveValue("enum_fsm");
    const before = await documentState(page);

    // Save -> canonical content is exact.
    const download = page.waitForEvent("download");
    await page.getByTestId("ribbon").getByRole("button", { name: "Save", exact: true }).first().click();
    const saved = await readFile((await (await download).path())!);
    const savedDocument = JSON.parse(saved.toString("utf8"));
    expect(savedDocument.enumDefinitions).toEqual(document.enumDefinitions);
    const savedState = savedDocument.signals.find((signal: { id: string }) => signal.id === stateId);
    expect(savedState.enumId).toBe("enum_fsm");
    expect(savedState.values.map((change: { start: number; value: unknown }) => [change.start, change.value])).toEqual([[0, 0], [4, 1], [8, 2], [12, 7]]);
    await expectViewOnly(page, before, "Save is not a document mutation");

    // New -> Open the saved bytes: identical semantics and identical rendered labels.
    await page.getByTestId("ribbon").getByRole("button", { name: "New", exact: true }).first().click();
    await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 60_000 });
    await fileInput(page).setInputFiles({ name: "saved-enum431.tcd.json", mimeType: "application/json", buffer: saved });
    await expect(page.locator(".editor-shell")).toHaveAttribute("data-signal-count", "4", { timeout: 60_000 });
    await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 60_000 });
    expect(await symbolicLabels()).toEqual(first);
    await surface.locator(`[data-role='frozen-row'][data-row-id='${stateId}']`).click();
    await expect(page.getByLabel("Inspector State enum")).toHaveValue("enum_fsm");
    await expect(page.getByTestId("dirty-status")).toHaveText("Clean");
    await expect(page.getByTestId("history-status")).toHaveText(/History 0/);
  });
}
