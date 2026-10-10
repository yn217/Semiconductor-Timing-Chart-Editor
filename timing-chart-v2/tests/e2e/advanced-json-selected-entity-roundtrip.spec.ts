import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";

async function save(page: Page) {
  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  const pending = page.waitForEvent("download");
  await page.getByTestId("ribbon").getByRole("button", { name: "Save", exact: true }).click();
  const filename = (await (await pending).path())!;
  return { filename, document: JSON.parse(await readFile(filename, "utf8")) as Record<string, any> };
}

for (const entity of ["annotation", "transaction"] as const) {
  test(`Advanced JSON selected ${entity} applies atomically and survives Save/Open`, async ({ page }) => {
    await page.goto("/");
    const host = page.getByTestId("cycle-surface");
    await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
    await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();

    let entityId: string;
    if (entity === "annotation") {
      await page.getByRole("tablist", { name: "Bottom context panels" }).getByRole("tab", { name: "Annotation" }).click();
      const annotationRow = page.getByTestId("annotation-list").locator("[data-annotation-list-id]").nth(0);
      entityId = (await annotationRow.getAttribute("data-annotation-list-id"))!;
      await annotationRow.click();
    } else {
      await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
      const transactionRow = page.getByTestId("transaction-left-tree").locator("[data-transaction-tree-id]").first();
      entityId = (await transactionRow.getAttribute("data-transaction-tree-id"))!;
      await transactionRow.click();
    }

    const bottom = page.getByTestId("bottom-editor");
    await bottom.getByRole("tab", { name: "JSON", exact: true }).click();
    const json = page.getByTestId("json-panel");
    await json.getByLabel("JSON scope").selectOption("selected");
    await json.getByTestId("json-advanced-toggle").click();
    const editor = json.getByLabel("Advanced JSON");
    const source = JSON.parse(await editor.inputValue()) as Record<string, any>;
    expect(source.id).toBe(entityId);
    const baseline = {
      revision: await host.getAttribute("data-canonical-revision"),
      history: await page.getByTestId("history-status").textContent(),
      dirty: await page.getByTestId("dirty-status").textContent(),
    };
    const label = entity === "annotation" ? "Advanced JSON annotation" : "Advanced JSON transaction";
    if (entity === "annotation") source.label = label;
    else source.name = label;

    await editor.fill(JSON.stringify(source));
    await json.getByRole("button", { name: "Validate", exact: true }).click();
    await expect(json.locator("output")).toHaveText("Valid");
    expect(await host.getAttribute("data-canonical-revision")).toBe(baseline.revision);
    expect(await page.getByTestId("history-status").textContent()).toBe(baseline.history);
    expect(await page.getByTestId("dirty-status").textContent()).toBe(baseline.dirty);

    await json.getByTestId("apply-advanced-json").click();
    await expect(host).toHaveAttribute("data-editor-idle", "true");
    const baselineHistory = Number(baseline.history?.match(/History (\d+)/)?.[1] ?? 0);
    await expect(page.getByTestId("history-status")).toHaveText(`History ${baselineHistory + 1} / Redo 0`);
    await page.locator(".ribbon-tabs").getByRole("button", { name: "Home", exact: true }).click();
    await page.getByTestId("ribbon").getByRole("button", { name: "Undo", exact: true }).click();
    await expect(page.getByTestId("history-status")).toHaveText(`History ${baselineHistory} / Redo 1`);
    await page.getByTestId("ribbon").getByRole("button", { name: "Redo", exact: true }).click();
    await expect(page.getByTestId("history-status")).toHaveText(`History ${baselineHistory + 1} / Redo 0`);

    const saved = await save(page);
    const collection = entity === "annotation" ? saved.document.annotations : saved.document.transactions;
    expect(collection.find((item: Record<string, unknown>) => item.id === entityId)).toMatchObject(entity === "annotation" ? { label } : { name: label });
    await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(saved.filename);
    await expect(host).toHaveAttribute("data-editor-idle", "true");
    const reopened = await save(page);
    const reopenedCollection = entity === "annotation" ? reopened.document.annotations : reopened.document.transactions;
    expect(reopenedCollection.find((item: Record<string, unknown>) => item.id === entityId)).toMatchObject(entity === "annotation" ? { label } : { name: label });
  });
}
