import { expect, test } from "@playwright/test";

// #331 P2: Ribbon Font edits must apply to every selected Annotation
// (multi-selection), as one atomic History entry, each preserving its own
// non-font properties -- not just the primary/first selected one.
test("Ribbon Bold applies to every selected Annotation as one atomic commit, each keeping its own color", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  const tabs = page.locator(".ribbon-tabs");
  await tabs.getByRole("button", { name: "Annotation", exact: true }).click();

  const owners = host.locator("[data-role='annotation-owner']");
  await page.getByLabel("Annotation type").selectOption("text");
  await page.getByRole("button", { name: "Add annotation" }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  const firstId = await owners.last().getAttribute("data-annotation-id");

  await page.getByLabel("Annotation type").selectOption("marker");
  await page.getByRole("button", { name: "Add annotation" }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  const secondId = await owners.last().getAttribute("data-annotation-id");
  expect(firstId).not.toBe(secondId);

  // Stable per-annotation locators -- `.last()` is dynamic and re-resolves
  // against whatever the current DOM order is, which shifts as more
  // annotations get added/selected.
  const first = host.locator(`[data-role='annotation-owner'][data-annotation-id='${firstId}']`);
  const second = host.locator(`[data-role='annotation-owner'][data-annotation-id='${secondId}']`);
  const firstLabel = first.locator("[data-role='annotation-label']");
  const secondLabel = second.locator("[data-role='annotation-label']");

  // Give each a distinct color through the Bottom Editor's full-properties
  // form before selecting both, so we can prove Bold doesn't clobber it.
  await firstLabel.click();
  await page.getByTestId("annotation-editor").getByLabel("Annotation color").fill("#aa2211");
  await page.getByTestId("apply-annotation-properties").click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await secondLabel.click();
  await page.getByTestId("annotation-editor").getByLabel("Annotation color").fill("#1122aa");
  await page.getByTestId("apply-annotation-properties").click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");

  const historyBefore = await page.getByTestId("history-status").textContent();
  const depthBefore = Number(historyBefore?.match(/History (\d+)/)?.[1]);

  // Select both: click first, Ctrl+click second.
  await firstLabel.click();
  await secondLabel.click({ modifiers: ["Control"] });
  await expect(first).toHaveAttribute("data-selected", "true");
  await expect(second).toHaveAttribute("data-selected", "true");

  await page.getByTestId("ribbon-annotation-font-bold").click();
  await expect(page.getByTestId("history-status")).toHaveText(`History ${depthBefore + 1} / Redo 0`);

  const styles = await owners.evaluateAll((elements) => elements.map((element) => ({ id: (element as HTMLElement).dataset.annotationId, fontWeight: (element.querySelector("[data-role='annotation-label']") as HTMLElement | null)?.style.fontWeight })));
  const firstStyle = styles.find((item) => item.id === firstId);
  const secondStyle = styles.find((item) => item.id === secondId);
  expect(firstStyle?.fontWeight).toBe("bold");
  expect(secondStyle?.fontWeight).toBe("bold");

  // Each annotation kept its own color -- Bold on a multi-selection must
  // not clobber the other one's non-font properties with the primary's.
  await firstLabel.click();
  await expect(page.getByTestId("annotation-editor").getByLabel("Annotation color")).toHaveValue("#aa2211");
  await secondLabel.click();
  await expect(page.getByTestId("annotation-editor").getByLabel("Annotation color")).toHaveValue("#1122aa");
});
