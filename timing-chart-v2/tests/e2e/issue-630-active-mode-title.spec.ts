import { expect, test } from "@playwright/test";
import { transactionDemoDocument } from "../../apps/editor/src/fixtures-cycle-reference-documents.js";

for (const viewport of [{ width: 1672, height: 941 }, { width: 1280, height: 720 }]) {
  test(`document title never displays a stale mode suffix at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    test.setTimeout(60_000);
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.setViewportSize(viewport);
    await page.goto("/");

    const host = page.getByTestId("cycle-surface");
    const documentName = page.locator(".app-titlebar h1");
    const modeTitle = page.getByTestId("titlebar-view-title");
    await expect(host).toHaveAttribute("data-editor-idle", "true");
    await expect(page.getByTestId("view-mode-status")).toHaveText("Mode: Transaction");
    await expect(documentName).toHaveText("Sample");
    await expect(modeTitle).toHaveText("Transaction View");
    const baseline = {
      revision: await host.getAttribute("data-canonical-revision"),
      history: await page.getByTestId("history-status").innerText(),
      dirty: await page.getByTestId("dirty-status").innerText(),
    };

    const selectMode = async (mode: "Cycle" | "Transaction" | "Combined", expectedLabel: string) => {
      await page.locator(".view-mode").getByRole("button", { name: mode, exact: true }).click();
      await expect(page.getByTestId("view-mode-status")).toHaveText(`Mode: ${mode}`);
      await expect(modeTitle).toHaveText(expectedLabel);
      await expect(documentName).toHaveText("Sample");
      await expect(documentName).not.toContainText(/(?:Cycle|Transaction|Combined)\s+Mode/i);
    };

    await selectMode("Cycle", "Cycle View");
    await selectMode("Transaction", "Transaction View");
    await selectMode("Combined", "Combined View");
    await selectMode("Cycle", "Cycle View");

    await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({
      name: "mode-title-roundtrip.tcd",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(transactionDemoDocument)),
    });
    await expect(host).toHaveAttribute("data-editor-idle", "true");
    await expect(documentName).toHaveText("Sample");
    await expect(modeTitle).toHaveText("Cycle View");
    await page.reload();
    await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true");
    await expect(documentName).toHaveText("Sample");

    await expect(host).toHaveAttribute("data-canonical-revision", baseline.revision ?? "0");
    await expect(page.getByTestId("history-status")).toHaveText(baseline.history);
    await expect(page.getByTestId("dirty-status")).toHaveText(baseline.dirty);
    expect(pageErrors).toEqual([]);
  });
}
