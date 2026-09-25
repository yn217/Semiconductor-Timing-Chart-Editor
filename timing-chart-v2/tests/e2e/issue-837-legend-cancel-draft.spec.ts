import { expect, test } from "@playwright/test";
import { startInCycleSample } from "./cycle-startup.js";

startInCycleSample(test);

async function showLegend(page: import("@playwright/test").Page) {
  await page.goto("/");
  const surface = page.getByTestId("cycle-surface");
  await expect(surface).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Properties", exact: true }).click();
  const properties = page.getByRole("dialog", { name: "Document Properties" });
  await properties.getByLabel("Legend show").check();
  await properties.getByLabel("Legend position X").fill("200");
  await properties.getByLabel("Legend position Y").fill("140");
  await properties.getByTestId("apply-document-properties").click();
  await properties.getByRole("button", { name: "Close properties" }).click();
  return { surface, legend: page.getByTestId("editor-legend") };
}

test("Legend Escape and pointer cancellation restore the committed position without a mutation", async ({ page }) => {
  const { surface, legend } = await showLegend(page);
  const original = { x: await legend.getAttribute("data-legend-position-x"), y: await legend.getAttribute("data-legend-position-y") };
  const revision = await surface.getAttribute("data-canonical-revision");
  const history = await page.getByTestId("history-status").textContent();
  const box = (await legend.boundingBox())!;

  await page.mouse.move(box.x + 16, box.y + 12);
  await page.mouse.down();
  await page.mouse.move(box.x + 70, box.y + 48, { steps: 3 });
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(legend).toHaveAttribute("data-legend-position-x", original.x!);
  await expect(legend).toHaveAttribute("data-legend-position-y", original.y!);
  await expect(surface).toHaveAttribute("data-canonical-revision", revision!);
  await expect(page.getByTestId("history-status")).toHaveText(history!);

  const resetBox = (await legend.boundingBox())!;
  await page.mouse.move(resetBox.x + 16, resetBox.y + 12);
  await page.mouse.down();
  await page.mouse.move(resetBox.x + 80, resetBox.y + 55, { steps: 3 });
  await legend.dispatchEvent("pointercancel", { bubbles: true, pointerId: 1, pointerType: "mouse" });
  await page.mouse.up();
  await expect(legend).toHaveAttribute("data-legend-position-x", original.x!);
  await expect(legend).toHaveAttribute("data-legend-position-y", original.y!);
  await expect(surface).toHaveAttribute("data-canonical-revision", revision!);
  await expect(page.getByTestId("history-status")).toHaveText(history!);
});

test("external Legend drag does not erase dirty Inspector fields or apply stale position", async ({ page }) => {
  const { legend } = await showLegend(page);
  await legend.click();
  const inspector = page.getByTestId("inspector");
  await expect(inspector).toHaveAttribute("data-inspector-entity", "legend");
  await page.getByLabel("Legend orientation").selectOption("vertical");
  await page.getByLabel("Legend X").fill("300");

  const box = (await legend.boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + 15);
  await page.mouse.down();
  await page.mouse.move(box.x + 55, box.y + 35, { steps: 3 });
  await page.mouse.up();

  await expect(page.getByLabel("Legend orientation")).toHaveValue("vertical");
  await expect(page.getByLabel("Legend X")).toHaveValue("300");
  await expect(inspector.getByTestId("legend-draft-conflict")).toBeVisible();
  await expect(page.getByTestId("apply-legend-properties")).toBeDisabled();
  await inspector.getByRole("button", { name: "Keep my draft" }).click();
  await page.getByTestId("apply-legend-properties").click();
  await expect(legend).toHaveAttribute("data-legend-position-x", "300");
  await expect(legend).toHaveClass(/vertical/);
});
