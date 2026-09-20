import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { startInCycleMode } from "./cycle-startup.js";

startInCycleMode(test);

async function openJson(page: Page, document: unknown): Promise<void> {
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({
    name: "adversarial.tcd.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(document)),
  });
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true");
}

test("Open renders adversarial user strings as inert production SVG content", async ({ page }) => {
  await page.goto("/");
  const payload = "< > & \\\" ' </text><script>window.__waveAttack = true</script> <foreignObject onclick=alert(1)>x</foreignObject> javascript:";
  const signal = {
    id: "sig_adversarial",
    name: payload,
    type: "binary",
    role: "internal",
    source: { instancePath: ["rtl", "scope"], signalName: payload },
    display: { name: payload },
    values: [{ start: 0, value: 0 }, { start: 2, value: 1 }],
  };
  await openJson(page, {
    formatVersion: 2,
    document: { id: "security", title: payload, header: { subtitle: payload, description: payload, notes: payload, preconditions: [], constraints: [], exceptions: [] }, footer: { figureNumber: "", revision: "V2", text: payload } },
    timeline: { start: 0, end: 4, cycleCount: 4, timeBase: "cycle", edge: "rising", labelAnchors: [] },
    signalGroups: [{ id: "grp_security", name: payload, rows: [signal.id] }],
    signals: [signal], bookmarks: [], timeGroups: [], annotations: [], transactions: [], constraints: [],
    legend: { show: false, orientation: "horizontal", usedRolesOnly: true, position: { x: 0, y: 0 } },
    layout: { roleColumnWidth: 62, signalNameWidth: 178, signalNameAlign: "left", rowHeight: 30, signalSpacing: 4, overflow: "ellipsis" },
    checkSettings: {},
  });

  await expect(page).toHaveTitle(/Timing Chart Editor V2/);
  const waveSvg = page.locator("[data-role='wave-owner'] svg");
  await expect(waveSvg).toHaveCount(1);
  await expect(waveSvg.locator("script, foreignObject, iframe, object, embed, img")).toHaveCount(0);
  await expect(waveSvg.locator("[*|href^='javascript:'], [href^='javascript:']")).toHaveCount(0);
  expect(await page.evaluate(() => (globalThis as { __waveAttack?: boolean }).__waveAttack)).toBeUndefined();
  await expect(waveSvg).toBeAttached();

  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Export", exact: true }).click();
  await page.getByLabel("Export format").selectOption("svg");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export SVG", exact: true }).click();
  const exportPath = await (await download).path();
  expect(exportPath).toBeTruthy();
  const exported = await readFile(exportPath!, "utf8");
  expect(exported).not.toMatch(/<\/?(?:script|foreignObject|iframe|object|embed|img)\b/i);
  expect(exported).not.toMatch(/<[^>]*\bon[a-z][\w:-]*\s*=/i);
  expect(exported).not.toMatch(/<[^>]*(?:href|xlink:href)\s*=\s*["']\s*(?:javascript|data):/i);
});
