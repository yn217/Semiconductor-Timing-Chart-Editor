import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import type { CanonicalDocument } from "@timing-chart-v2/schema";
import { canonicalFixture } from "../fixtures/canonical.js";
import { startInCycleMode } from "./cycle-startup.js";

startInCycleMode(test);

test("uses HDL sized-literal truncation consistently through edit, Undo/Redo and Save/Open", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");

  const source = structuredClone(canonicalFixture()) as CanonicalDocument;
  const data = source.signals.find((signal) => signal.id === "sig_data");
  if (!data || data.type !== "bus") throw new Error("Canonical fixture must contain its Bus Signal.");
  source.signals = source.signals.map((signal) => signal.id === data.id
    ? { ...data, width: 4, displayFormat: "hex", values: [{ start: 0, value: "4'hF" }, { start: 4, value: "4'b1111" }] }
    : signal);
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({
    name: "sized-bus-literal.tcd",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(source)),
  });
  await expect(host).toHaveAttribute("data-editor-idle", "true");

  await host.locator("[data-role='frozen-row'][data-row-id='sig_data']").click();
  await page.getByTestId("bottom-tabs").locator("[data-bottom-tab='Signal']").click();
  const value0 = page.getByTestId("event-row-value-0");
  await expect(value0).toHaveText("0xF");
  await expect(page.getByTestId("event-row-value-4")).toHaveText("0xF");
  const dataOwner = host.locator("[data-role='wave-owner'][data-signal-id='sig_data']");
  await expect.poll(async () => dataOwner.locator("image[data-wave-svg-image]").evaluate(async (image) => {
    const source = image.getAttribute("data-wave-svg-source");
    const markup = source ? await (await fetch(source)).text() : "";
    return (markup.match(/>0xF</g) ?? []).length;
  })).toBe(2);

  const eventRow = page.locator("form.event-row[data-event-start='0']");
  await eventRow.getByRole("button", { name: "Edit transition at cycle 0" }).click();
  await eventRow.getByLabel("Value 0").fill("4'hFF");
  await eventRow.getByRole("button", { name: "Save", exact: true }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(value0).toHaveText("0xF");
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");

  await page.getByTestId("ribbon").getByRole("button", { name: "Undo", exact: true }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(value0).toHaveText("0xF");
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 1");
  await page.getByTestId("ribbon").getByRole("button", { name: "Redo", exact: true }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(value0).toHaveText("0xF");
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");

  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  const savePromise = page.waitForEvent("download");
  await page.getByTestId("ribbon").getByRole("button", { name: "Save", exact: true }).click();
  const savedPath = await (await savePromise).path();
  expect(savedPath).toBeTruthy();
  const saved = JSON.parse(await readFile(savedPath!, "utf8")) as CanonicalDocument;
  const savedData = saved.signals.find((signal) => signal.id === "sig_data");
  expect(savedData).toMatchObject({ type: "bus", width: 4, values: [{ start: 0, value: "4'hFF" }, { start: 4, value: "4'b1111" }] });

  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(savedPath!);
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_data']").click();
  await page.getByTestId("bottom-tabs").locator("[data-bottom-tab='Signal']").click();
  await expect(page.getByTestId("event-row-value-0")).toHaveText("0xF");
  await expect(page.getByTestId("event-row-value-4")).toHaveText("0xF");
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
});
