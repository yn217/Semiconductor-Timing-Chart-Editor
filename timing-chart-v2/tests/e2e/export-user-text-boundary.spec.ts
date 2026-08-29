import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

const hostile = `<script>alert(1)</script> <image href="javascript:alert(1)"> <text onclick="alert(1)">x</text>`;

test("browser SVG export keeps adversarial document text inert", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");

  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Properties", exact: true }).click();
  const properties = page.getByRole("dialog", { name: "Document Properties" });
  await properties.getByLabel("Document title").fill(hostile);
  await properties.getByLabel("Document description").fill(hostile);
  await properties.getByLabel("Footer text").fill(hostile);
  await properties.getByTestId("apply-document-properties").click();
  await properties.getByRole("button", { name: "Close properties" }).click();

  await page.getByTestId("ribbon").getByRole("button", { name: "Export", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Export Timing Chart" });
  const pending = page.waitForEvent("download");
  await dialog.getByLabel("Export format").selectOption("svg");
  await dialog.getByRole("button", { name: "Export SVG", exact: true }).click();
  const download = await pending;
  const svg = (await readFile((await download.path())!)).toString("utf8");

  expect(svg).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  expect(svg).not.toMatch(/<script\b|<image\b|<text[^>]*\bon[a-z][\\w:-]*\\s*=/i);
  expect(svg).not.toMatch(/(?:href|xlink:href)=\"\s*javascript:/i);
});
