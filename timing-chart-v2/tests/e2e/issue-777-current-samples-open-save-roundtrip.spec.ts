import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";

/**
 * #777 acceptance: every manifest-listed current sample goes through the PRODUCTION File input (never injected Canonical state):
 * Open -> settled render with no console/page errors -> Save -> New -> Open the saved file -> Save again. The two saved files must be
 * byte-identical (deterministic canonical serialization) and keep the sample's document id and entity counts. Run at both required
 * viewports.
 */
const manifest = JSON.parse(await readFile(new URL("../../samples/current/manifest.json", import.meta.url), "utf8")) as { samples: ReadonlyArray<{ file: string; documentId: string }> };
const sizes = [{ width: 1280, height: 720 }, { width: 1672, height: 941 }] as const;

async function save(page: Page): Promise<string> {
  const downloaded = page.waitForEvent("download");
  await page.getByTestId("ribbon").getByRole("button", { name: "Save", exact: true }).first().click();
  const file = await (await downloaded).path();
  return readFile(file!, "utf8");
}

for (const size of sizes) {
  for (const sample of manifest.samples) {
    test(`${sample.file} survives Open -> Save -> New -> Open -> Save at ${size.width}x${size.height}`, async ({ page }) => {
      test.setTimeout(120_000);
      const problems: string[] = [];
      page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
      page.on("console", (message) => { if (message.type() === "error") problems.push(`console: ${message.text()}`); });
      await page.setViewportSize(size);
      await page.goto("/");
      const surface = page.getByTestId("cycle-surface");
      await expect(surface).toHaveAttribute("data-cycle-view-ready", "true");
      const original = await readFile(new URL(`../../samples/current/${sample.file}`, import.meta.url));
      const originalJson = JSON.parse(original.toString("utf8")) as { document: { id: string }; signals: unknown[]; annotations?: unknown[]; transactions?: unknown[]; timeGroups?: unknown[]; bookmarks?: unknown[] };
      const input = page.locator("input[type='file'][accept='.json,.tcd']");

      await input.setInputFiles({ name: sample.file, mimeType: "application/json", buffer: original });
      await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 60_000 });
      await expect(page.getByTestId("cycle-ruler")).toBeVisible();
      await expect(page.getByTestId("dirty-status")).toHaveText("Clean");

      const first = await save(page);
      const firstJson = JSON.parse(first) as typeof originalJson;
      expect(firstJson.document.id).toBe(sample.documentId);
      expect(firstJson.signals.length).toBe(originalJson.signals.length);
      for (const key of ["annotations", "transactions", "timeGroups", "bookmarks"] as const) expect((firstJson[key] ?? []).length, key).toBe((originalJson[key] ?? []).length);

      await page.getByTestId("ribbon").getByRole("button", { name: "New", exact: true }).first().click();
      await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 60_000 });
      await input.setInputFiles({ name: `saved-${sample.file}`, mimeType: "application/json", buffer: Buffer.from(first, "utf8") });
      await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 60_000 });
      await expect(page.getByTestId("cycle-ruler")).toBeVisible();

      const second = await save(page);
      expect(second, "re-saved file is byte-identical to the first save (deterministic round-trip)").toBe(first);
      expect(problems, problems.join("\n")).toEqual([]);
    });
  }
}
