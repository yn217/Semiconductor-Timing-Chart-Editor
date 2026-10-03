import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { generatePerformanceDocument } from "@timing-chart-v2/testing";
import { readWave } from "./wave-probe.js";

/**
 * #431 section 10 (Bus radix): the per-Signal Bus format is one setting that the rendered waveform labels, the Bottom event table and
 * the saved document all agree on, and it survives Save -> Open. Verified through the Inspector's Bus format control.
 */
const sizes = [{ width: 1280, height: 720 }, { width: 1672, height: 941 }] as const;
const fileInput = (page: Page) => page.locator("input[type='file'][accept='.json,.tcd']");

function busDocument() {
  const base = generatePerformanceDocument({ signalCount: 3, cycleCount: 24, profile: "standard" });
  const bus = { ...base.signals[1]!, id: "sig_bus_radix", name: "BUS_R", type: "bus", width: 8, displayFormat: "hex", values: [{ start: 0, value: "00" }, { start: 4, value: "A5" }, { start: 8, value: "0F" }] } as unknown as (typeof base.signals)[number];
  return { document: { ...base, signals: [base.signals[0]!, bus, base.signals[2]!], signalGroups: [{ ...base.signalGroups[0]!, rows: [base.signals[0]!.id, bus.id, base.signals[2]!.id] }] }, id: "sig_bus_radix" };
}

const expectedLabels = { hex: ["0x00", "0xA5", "0x0F"], decimal: ["0", "165", "15"], binary: ["0b00000000", "0b10100101", "0b00001111"] } as const;

for (const size of sizes) {
  test(`Bus format agrees across waveform labels, Bottom event table and Save/Open at ${size.width}x${size.height}`, async ({ page }) => {
    test.setTimeout(180_000);
    await page.addInitScript(() => { try { window.localStorage.setItem("timing-chart-v2.view-mode", "Cycle"); } catch { /* best effort */ } });
    await page.setViewportSize(size);
    await page.goto("/");
    const surface = page.getByTestId("cycle-surface");
    await expect(surface).toHaveAttribute("data-cycle-view-ready", "true");
    const { document, id } = busDocument();
    await fileInput(page).setInputFiles({ name: "radix431.tcd.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(document)) });
    await expect(page.locator(".editor-shell")).toHaveAttribute("data-signal-count", "3", { timeout: 60_000 });
    await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 60_000 });

    const waveLabels = async () => {
      await expect.poll(async () => (await readWave(page, id)).present, { timeout: 30_000 }).toBe(true);
      return (await readWave(page, id)).labels.map((label) => label.shownText).filter((text) => text !== "");
    };
    const tableCells = async () => (await page.getByTestId("signal-editor").innerText()).replace(/\s+/g, " ");
    const same = (actual: readonly string[], expected: readonly string[]) => expected.every((value) => actual.includes(value));

    await surface.locator(`[data-role='frozen-row'][data-row-id='${id}']`).click();
    await expect.poll(waveLabels).toEqual(expect.arrayContaining([...expectedLabels.hex]));
    const inspector = page.getByTestId("inspector");
    const inspectorValue = inspector.getByTestId("inspector-bus-current-value");
    await page.getByTestId("cycle-ruler").locator("[data-cycle='4']").click();
    await expect(inspectorValue).toHaveText("0xA5");

    for (const format of ["decimal", "binary"] as const) {
      await inspector.getByLabel("Inspector bus format").selectOption(format);
      await inspector.getByRole("button", { name: /Apply/ }).first().click();
      await expect.poll(async () => same(await waveLabels(), expectedLabels[format]), { message: `waveform labels follow ${format}` }).toBe(true);
      await expect(inspectorValue).toHaveText(expectedLabels[format][1]);
      const cells = await tableCells();
      for (const value of expectedLabels[format]) expect(cells, `Bottom event table shows ${value}`).toContain(value);
    }

    // Save: the canonical field is the single source of the display format; then Open restores identical labels.
    const download = page.waitForEvent("download");
    await page.getByTestId("ribbon").getByRole("button", { name: "Save", exact: true }).first().click();
    const saved = await readFile((await (await download).path())!);
    const savedSignal = JSON.parse(saved.toString("utf8")).signals.find((signal: { id: string }) => signal.id === id);
    expect(savedSignal.displayFormat).toBe("binary");
    expect(savedSignal.values.map((change: { value: string }) => change.value)).toEqual(["00", "A5", "0F"]);
    await page.getByTestId("ribbon").getByRole("button", { name: "New", exact: true }).first().click();
    await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 60_000 });
    await fileInput(page).setInputFiles({ name: "saved-radix431.tcd.json", mimeType: "application/json", buffer: saved });
    await expect(page.locator(".editor-shell")).toHaveAttribute("data-signal-count", "3", { timeout: 60_000 });
    await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 60_000 });
    await expect.poll(async () => same(await waveLabels(), expectedLabels.binary)).toBe(true);
    await surface.locator(`[data-role='frozen-row'][data-row-id='${id}']`).click();
    await expect(page.getByTestId("inspector").getByLabel("Inspector bus format")).toHaveValue("binary");
    await expect(page.getByTestId("dirty-status")).toHaveText("Clean");
  });
}
