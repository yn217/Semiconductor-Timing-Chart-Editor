import { expect, test } from "@playwright/test";
import { canonicalFixture } from "../fixtures/canonical";

for (const count of [1_000, 5_000, 20_000]) test(`${count} Annotation rows stay virtualized through End navigation`, async ({ page }) => {
  const document = canonicalFixture();
  const signalId = document.signals[0]!.id;
  document.annotations = Array.from({ length: count }, (_, index) => ({ id: `annotation-scale-${index}`, type: "text" as const, label: `Annotation ${index}`, visible: true, anchor: { signalId, cycle: index % document.timeline.cycleCount, point: "cycle-start" as const } }));
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const epoch = Number((JSON.parse(await host.getAttribute("data-session-counters") ?? "{}")).projectionDocumentEpoch ?? 0);
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "annotation-scale.tcd.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(document)) });
  await expect.poll(async () => Number((JSON.parse(await host.getAttribute("data-session-counters") ?? "{}")).projectionDocumentEpoch ?? 0), { timeout: 120_000 }).toBeGreaterThan(epoch);
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Annotation", exact: true }).click();
  await page.getByRole("tab", { name: "Annotation", exact: true }).last().click();
  const list = page.getByTestId("annotation-list");
  await expect(list).toBeVisible();
  const revision = await host.getAttribute("data-canonical-revision");
  const history = await page.getByTestId("history-status").textContent();
  const dirty = await page.getByTestId("dirty-status").textContent();
  expect(await list.locator("[data-annotation-list-id]").count()).toBeLessThan(100);
  await list.locator("[data-annotation-list-id]").first().focus();
  await page.keyboard.press("End");
  await expect(list.locator(`[data-annotation-list-id='annotation-scale-${count - 1}']`)).toHaveAttribute("data-selected", "true");
  expect(await list.locator("[data-annotation-list-id]").count()).toBeLessThan(100);
  await expect(host).toHaveAttribute("data-canonical-revision", revision!);
  await expect(page.getByTestId("history-status")).toHaveText(history!);
  await expect(page.getByTestId("dirty-status")).toHaveText(dirty!);
});
