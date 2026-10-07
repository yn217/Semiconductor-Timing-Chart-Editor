import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";

async function save(page: Page) {
  const download = page.waitForEvent("download");
  await page.getByTestId("ribbon").getByRole("button", { name: "Save", exact: true }).first().click();
  const file = await (await download).path();
  expect(file).not.toBeNull();
  return readFile(file!, "utf8");
}

for (const viewport of [{ width: 1280, height: 720 }, { width: 1672, height: 941 }]) {
  test(`release legacy migration round-trip at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    await page.setViewportSize(viewport);
    await page.goto("/");
    const host = page.getByTestId("cycle-surface");
    await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
    const legacy = {
      formatVersion: 1,
      document: { id: "release-legacy-v1", title: "Legacy release smoke" },
      timeline: { cycleCount: 10 },
      signals: [{ id: "legacy_data", name: "DATA", type: "binary", role: "input", values: [{ start: 0, value: 0 }, { start: 4, value: 1 }] }],
    };
    const input = page.locator("input[type='file'][accept='.json,.tcd']");
    await input.setInputFiles({ name: "legacy-v1.tcd", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(legacy)) });
    await expect(host).toHaveAttribute("data-editor-idle", "true");
    const first = await save(page);
    const document = JSON.parse(first);
    expect(document.formatVersion).toBe(2);
    expect(document.document.id).toBe(legacy.document.id);
    expect(document.signals[0].id).toBe("legacy_data");
    expect(document.signals[0].values.map((value: { start: number; value: number }) => [value.start, value.value])).toEqual([[0, 0], [4, 1]]);
    await page.getByTestId("ribbon").getByRole("button", { name: "New", exact: true }).first().click();
    await input.setInputFiles({ name: "migrated.tcd", mimeType: "application/json", buffer: Buffer.from(first) });
    await expect(host).toHaveAttribute("data-editor-idle", "true");
    expect(await save(page)).toBe(first);
    expect(errors).toEqual([]);
  });
}
