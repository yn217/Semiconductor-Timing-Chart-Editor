import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

const viewports = [{ width: 1280, height: 720 }, { width: 1672, height: 941 }] as const;

for (const viewport of viewports) {
  test(`New -> author a Cycle Signal and Transition -> Save/Open at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    await page.setViewportSize(viewport);
    await page.goto("/");
    const surface = page.getByTestId("cycle-surface");
    await expect(surface).toHaveAttribute("data-cycle-view-ready", "true");

    await page.getByTestId("ribbon").getByRole("button", { name: "New", exact: true }).click();
    await expect(page.getByTestId("titlebar-document-title")).toHaveText("Untitled Timing Chart");
    await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
    await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();

    const rows = surface.locator("[data-role='left-row'][data-row-id]");
    const previousIds = await rows.evaluateAll((items) => items.map((item) => (item as HTMLElement).dataset.rowId));
    await page.getByRole("button", { name: "Add signal or group" }).click();
    await page.getByRole("menu", { name: "Add signal or group" }).getByRole("menuitem", { name: "Signal", exact: true }).click();
    await expect.poll(() => rows.count()).toBe(previousIds.length + 1);
    const authoredId = await rows.evaluateAll((items, before) => items.map((item) => (item as HTMLElement).dataset.rowId).find((id) => id && !before.includes(id)), previousIds);
    expect(authoredId).toBeTruthy();
    await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");

    const authoredRow = surface.locator(`[data-role='frozen-row'][data-row-id='${authoredId}']`);
    await authoredRow.click();
    const inspector = page.getByTestId("inspector");
    await expect(inspector.getByRole("heading", { name: "Signal Properties" })).toBeVisible();
    const signalName = inspector.getByLabel("Inspector signal name", { exact: true });
    await signalName.fill("RELEASE_CLOCK");
    await signalName.press("Enter");
    await expect(authoredRow).toContainText("RELEASE_CLOCK");

    await page.getByRole("tab", { name: "Signal", exact: true }).click();
    const eventEditor = page.getByTestId("signal-editor");
    await eventEditor.getByLabel("New event start").fill("1");
    await eventEditor.getByLabel("New event value").selectOption("1");
    await eventEditor.getByTestId("add-signal-event").click();
    await expect(eventEditor.locator(".event-row[data-event-start='1']")).toHaveCount(1);
    await expect(page.getByTestId("history-status")).toHaveText("History 3 / Redo 0");
    await expect(surface).toHaveAttribute("data-editor-idle", "true");

    const downloadPromise = page.waitForEvent("download");
    await page.getByTestId("ribbon").getByRole("button", { name: "Save", exact: true }).click();
    const savedPath = await (await downloadPromise).path();
    expect(savedPath).toBeTruthy();
    const saved = await readFile(savedPath!);
    const serialized = JSON.parse(saved.toString("utf8")) as { signals: Array<{ id: string; display: { name: string } }>; };
    expect(serialized.signals.find((signal) => signal.id === authoredId)?.display.name).toBe("RELEASE_CLOCK");

    await page.getByTestId("ribbon").getByRole("button", { name: "New", exact: true }).click();
    await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(savedPath!);
    await expect(surface).toHaveAttribute("data-editor-idle", "true");
    await expect(surface.locator(`[data-role='left-row'][data-row-id='${authoredId}']`)).toContainText("RELEASE_CLOCK");
    await surface.locator(`[data-role='frozen-row'][data-row-id='${authoredId}']`).click();
    await page.getByRole("tab", { name: "Signal", exact: true }).click();
    await expect(page.getByTestId("signal-editor").locator(".event-row[data-event-start='1']")).toHaveCount(1);
    await expect(page.getByTestId("dirty-status")).toHaveText("Clean");
    expect(errors).toEqual([]);
  });
}
