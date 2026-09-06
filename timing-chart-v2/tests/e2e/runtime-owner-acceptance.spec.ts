import { expect, test } from "@playwright/test";
import { canonicalFixture } from "../fixtures/canonical.js";

async function openDocument(page: import("@playwright/test").Page, title: string) {
  const document = canonicalFixture();
  document.document.title = title;
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({
    name: `${title.replaceAll(" ", "-")}.tcd`,
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(document)),
  });
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-editor-idle", "true", { timeout: 120_000 });
  await expect(page.locator(".app-titlebar h1")).toHaveText(title);
  return host;
}

test("Open then Annotation drag uses the current document geometry", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await openDocument(page, "Opened Annotation Document");

  await host.locator("[data-role='frozen-row'][data-row-id='sig_data']").click();
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Annotation", exact: true }).click();
  await page.getByLabel("Annotation type").selectOption("arrow");
  await page.getByRole("button", { name: "Add annotation" }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");

  const owner = host.locator("[data-role='annotation-owner'][data-annotation-type='arrow']").last();
  const handle = owner.locator("[data-role='annotation-handle'][data-annotation-field='from']");
  const handleBox = await handle.boundingBox();
  const x0 = Number.parseFloat(await page.getByTestId("cycle-ruler").locator("[data-cycle='0']").evaluate((element) => (element as HTMLElement).style.left));
  const x2 = Number.parseFloat(await page.getByTestId("cycle-ruler").locator("[data-cycle='2']").evaluate((element) => (element as HTMLElement).style.left));
  const x5 = Number.parseFloat(await page.getByTestId("cycle-ruler").locator("[data-cycle='5']").evaluate((element) => (element as HTMLElement).style.left));
  expect(handleBox).not.toBeNull();

  await page.mouse.move(handleBox!.x + 4, handleBox!.y + 4);
  await page.mouse.down();
  await page.mouse.move(handleBox!.x + 4 + (x5 - x0), handleBox!.y + 4);
  await expect(host).toHaveAttribute("data-snap-kind", "cycle-boundary");
  await expect(host).toHaveAttribute("data-snap-cycle", "5");
  await page.mouse.up();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(page.getByTestId("history-status")).toHaveText("History 2 / Redo 0");
});

test("resize then edit then zoom reads current ViewMetrics and keeps semantics coherent", async ({ page }) => {
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const surface = host.locator("[data-role='timing-chart-surface']");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();

  const beforeRevision = await host.getAttribute("data-canonical-revision");
  const beforeMetrics = JSON.parse(await host.getAttribute("data-view-metrics") ?? "{}") as { inspectorWidth?: number };
  const beforeHostWidth = await host.evaluate((element) => getComputedStyle(element).width);
  const resizer = page.getByTestId("inspector-resizer");
  const box = await resizer.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x - 50, box!.y + box!.height / 2);
  await page.mouse.up();
  const resizedWidth = Number(await resizer.getAttribute("aria-valuenow"));
  expect(resizedWidth).not.toBe(beforeMetrics.inspectorWidth);
  await expect.poll(async () => host.evaluate((element) => getComputedStyle(element).width)).not.toBe(beforeHostWidth);

  const editor = page.getByTestId("signal-editor");
  await editor.getByLabel("Signal name").fill("REQUEST_AFTER_RESIZE");
  await editor.getByTestId("save-signal-properties").click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']")).toContainText("REQUEST_AFTER_RESIZE");
  expect(await host.getAttribute("data-canonical-revision")).not.toBe(beforeRevision);

  await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Zoom In", exact: true }).click();
  await expect(page.getByTestId("zoom-status")).toHaveText("125%");
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await expect(host.locator("[data-role='wave-owner'][data-signal-id='sig_cycle_request'] svg")).toHaveCount(1);
});
