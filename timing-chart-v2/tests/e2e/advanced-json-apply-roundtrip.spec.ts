import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";

async function save(page: Page) {
  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  const pending = page.waitForEvent("download");
  await page.getByTestId("ribbon").getByRole("button", { name: "Save", exact: true }).click();
  const filename = (await (await pending).path())!;
  return { filename, document: JSON.parse(await readFile(filename, "utf8")) };
}

for (const scope of ["document", "selected"] as const) {
  test(`Advanced JSON atomic Apply and real Copy round-trip: ${scope}`, async ({ page, context }) => {
    test.setTimeout(60_000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/");
    await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
    await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
    await page.getByTestId("cycle-surface").locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
    const bottom = page.getByTestId("bottom-editor");
    await bottom.getByRole("tab", { name: "JSON", exact: true }).click();
    const json = page.getByTestId("json-panel");
    const originalDocument = JSON.parse((await json.locator("pre").textContent())!);
    await expect(json.getByTestId("json-advanced-toggle")).toHaveAttribute("aria-pressed", "false");
    await expect(json.getByLabel("Advanced JSON")).toHaveCount(0);
    await expect(json.getByTestId("apply-advanced-json")).toHaveCount(0);
    await json.getByLabel("JSON scope").selectOption(scope);
    const source = JSON.parse((await json.locator("pre").textContent())!);
    await json.getByTestId("json-advanced-toggle").click();
    await expect(json.getByLabel("JSON editing mode")).toHaveText("Advanced");
    const editor = json.getByLabel("Advanced JSON");
    const baseline = () => Promise.all(["revision-status", "history-status", "dirty-status"].map((id) => page.getByTestId(id).textContent()));
    const before = await baseline();
    if (scope === "selected") {
      const draft = structuredClone(source);
      draft.display.name = "Unapplied draft";
      const draftText = JSON.stringify(draft);
      await editor.fill(draftText);
      await page.getByTestId("cycle-surface").locator("[data-role='frozen-row'][data-row-id='sig_cycle_ready']").click();
      await expect(editor).toHaveValue(draftText);
      await expect(json.getByTestId("json-unapplied-status")).toBeVisible();
      expect(await baseline()).toEqual(before);
      await json.getByTestId("cancel-advanced-json").click();
      expect(JSON.parse(await editor.inputValue()).id).toBe("sig_cycle_ready");
      await page.getByTestId("cycle-surface").locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
      await expect.poll(async () => JSON.parse(await editor.inputValue())).toEqual(source);
      expect(await baseline()).toEqual(before);
    }
    const invalid = structuredClone(source);
    if (scope === "document") invalid.timeline.end = 0;
    else invalid.values[0].start = -1;
    const invalidText = JSON.stringify(invalid);
    await editor.fill(invalidText);
    await json.getByTestId("apply-advanced-json").click();
    await expect(json).toContainText("Invalid:");
    const invalidPath = scope === "document" ? "$/timeline/end" : `$/signals/${originalDocument.signals.findIndex((signal: { id: string }) => signal.id === source.id)}/values/0/start`;
    await expect(json.locator("output")).toContainText(invalidPath);
    await expect(editor).toHaveValue(invalidText);
    expect(await baseline()).toEqual(before);
    const expected = structuredClone(originalDocument);
    if (scope === "document") {
      source.document.title = "JSON document edit";
      expected.document.title = source.document.title;
      // Same legacy v2 normalization as production Open, not direct validation.
      delete source.annotationGroups;
    } else {
      source.display.name = "JSON signal edit";
      expected.signals.find((signal: { id: string }) => signal.id === source.id).display.name = source.display.name;
      source.display.splitPane = "Upper";
    }
    await editor.fill(JSON.stringify(source));
    await json.getByRole("button", { name: "Format", exact: true }).click();
    expect(JSON.parse(await editor.inputValue())).toEqual(source);
    await expect(editor).toHaveValue(/\n/);
    await json.getByRole("button", { name: "Validate", exact: true }).click();
    await expect(json.locator("output")).toHaveText("Valid");
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await json.getByRole("button", { name: "Copy", exact: true }).click();
    await expect(json.locator("output")).toHaveText("Copied");
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    // Native Windows clipboard transports LF as CRLF; retain exact content checks.
    expect(copied.replace(/\r\n/g, "\n")).toBe(await editor.inputValue());
    expect(JSON.parse(copied)).toEqual(source);
    expect(await baseline()).toEqual(before);
    await json.getByTestId("apply-advanced-json").click();
    await expect(json.getByTestId("json-advanced-toggle")).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
    await expect(page.getByTestId("dirty-status")).toHaveText("Modified");
    await page.locator(".ribbon-tabs").getByRole("button", { name: "Home", exact: true }).click();
    await page.getByTestId("ribbon").getByRole("button", { name: "Undo", exact: true }).click();
    await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 1");
    await expect(page.getByTestId("dirty-status")).toHaveText("Clean");
    await page.getByTestId("ribbon").getByRole("button", { name: "Redo", exact: true }).click();
    await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
    const saved = await save(page);
    expect(saved.document).toEqual(expected);
    await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(saved.filename);
    await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true");
    expect((await save(page)).document).toEqual(expected);
    expect(errors).toEqual([]);
  });
}
