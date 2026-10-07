import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { openBottomSettings } from "./bottom-settings";

const fixture = path.resolve("samples/current/03_transactions.tcd.json");
async function save(page: Page) {
  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  const pending = page.waitForEvent("download");
  await page.getByTestId("ribbon").getByRole("button", { name: "Save", exact: true }).click();
  const filename = (await (await pending).path())!;
  return { filename, document: JSON.parse(await readFile(filename, "utf8")) };
}

for (const viewport of [{ width: 1280, height: 720 }, { width: 1672, height: 941 }]) {
  for (const mode of ["Transaction", "Combined"] as const) {
    for (const fixed of ["Pin", "Follow OFF"] as const) {
      test(`fixed Transaction subtabs target stable ID: ${mode}, ${fixed}, ${viewport.width}x${viewport.height}`, async ({ page }) => {
        test.setTimeout(60_000); // Two production Save/Open cycles plus editing and History verification.
        page.on("pageerror", (error) => console.error("FIXED_BOTTOM_PAGE_ERROR", error.message));
        await page.setViewportSize(viewport);
        await page.goto("/");
        await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
        await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(fixture);
        await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true");
        await page.locator(".view-mode").getByRole("button", { name: mode, exact: true }).click();
        const bottom = page.getByTestId("bottom-editor");
        const tree = page.getByTestId("transaction-left-tree");
        await tree.getByTestId("transaction-left-tree-row-txn.read").getByText("Read request", { exact: true }).click();
        await openBottomSettings(page);
        if (fixed === "Pin") await bottom.getByTestId("bottom-pin").click();
        else await bottom.getByTestId("follow-selection").uncheck();
        await tree.getByTestId("transaction-left-tree-row-txn.write").getByText("Un-grouped write", { exact: true }).click();
        await expect(bottom.getByTestId("bottom-target-mode")).toContainText("Read request");
        const unchanged = await Promise.all(["revision-status", "history-status", "dirty-status"].map((id) => page.getByTestId(id).textContent()));
        for (const tab of ["Transaction", "Phases", "Linked Signals", "Phases"]) {
          await bottom.getByRole("tab", { name: tab, exact: true }).click();
        }
        expect(await Promise.all(["revision-status", "history-status", "dirty-status"].map((id) => page.getByTestId(id).textContent()))).toEqual(unchanged);
        await expect(bottom.getByLabel("Bottom Phase 1 name", { exact: true })).toHaveValue("Address");
        await bottom.getByLabel("Bottom Phase 1 name", { exact: true }).fill("Pinned Address");
        await bottom.getByTestId("apply-bottom-transaction-phases").click();
        await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
        await page.getByTestId("inspector").getByTestId("manage-transaction-links").click();
        const links = bottom.getByTestId("transaction-linked-signals");
        await expect(links.locator('[data-signal-id="sig.addr"]')).toHaveCount(1);
        await links.locator('[data-signal-id="sig.addr"]').getByRole("button").click();
        await expect(page.getByTestId("history-status")).toHaveText("History 2 / Redo 0");
        await page.locator(".ribbon-tabs").getByRole("button", { name: "Home", exact: true }).click();
        await page.getByTestId("ribbon").getByRole("button", { name: "Undo", exact: true }).click();
        await expect(links.locator('[data-signal-id="sig.addr"]')).toHaveCount(1);
        await page.getByTestId("ribbon").getByRole("button", { name: "Redo", exact: true }).click();
        await expect(links.locator('[data-signal-id="sig.addr"]')).toHaveCount(0);
        const saved = await save(page);
        const read = saved.document.transactions.find((tx: { id: string }) => tx.id === "txn.read");
        const write = saved.document.transactions.find((tx: { id: string }) => tx.id === "txn.write");
        expect(read.phases[0]).toMatchObject({ id: "phase_read_address", name: "Pinned Address" });
        expect(read.linkedSignals).toEqual(["sig.req"]);
        expect(write.phases[0]).toMatchObject({ id: "phase_write_command", name: "Command" });
        expect(write.linkedSignals).toEqual(["sig.req"]);
        await openBottomSettings(page);
        if (fixed === "Pin") await bottom.getByTestId("bottom-pin").click();
        else await bottom.getByTestId("follow-selection").check();
        await bottom.getByRole("tab", { name: "Phases", exact: true }).click();
        await expect(bottom.getByLabel("Bottom Phase 1 name", { exact: true })).toHaveValue("Command");
        await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(saved.filename);
        await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true");
        const reopened = await save(page);
        expect(reopened.document.transactions).toEqual(saved.document.transactions);
      });
    }
  }
}
