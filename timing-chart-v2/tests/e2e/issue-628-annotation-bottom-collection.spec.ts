import { expect, test } from "@playwright/test";
import { documentState, expectViewOnly } from "./view-only.js";

for (const viewport of [{ width: 1672, height: 941 }, { width: 1280, height: 720 }]) {
  test(`Annotation Bottom stays list-first at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
    await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
    await page.locator(".ribbon-tabs").getByRole("button", { name: "Annotation", exact: true }).click();
    await page.getByRole("tablist", { name: "Bottom context panels" }).getByRole("tab", { name: "Annotation" }).click();

    const collection = page.getByTestId("annotation-collection");
    const list = page.getByTestId("annotation-list");
    const bottomContent = page.locator("#bottom-context-content");
    await expect(collection).toBeVisible();
    await expect(list).toHaveAttribute("aria-rowcount", "17");
    await expect(page.getByTestId("create-annotation-preset")).toBeVisible();
    await expect(bottomContent.getByTestId("annotation-editor")).toHaveCount(0);

    const initialScroll = await list.evaluate((element) => ({ top: element.scrollTop, height: element.scrollHeight, viewport: element.clientHeight }));
    expect(initialScroll.height).toBeGreaterThan(initialScroll.viewport);
    const listBox = await list.boundingBox();
    if (!listBox) throw new Error("Annotation list has no visible geometry");
    await page.mouse.move(listBox.x + listBox.width / 2, listBox.y + listBox.height / 2);
    await page.mouse.wheel(0, 1200);
    await expect.poll(() => list.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    await page.mouse.wheel(0, 10000);
    await expect.poll(() => list.evaluate((element) => element.scrollTop + element.clientHeight)).toBeGreaterThanOrEqual(initialScroll.height - 1);
    await expect(list.locator('[aria-rowindex="17"]')).toBeVisible();
    await page.mouse.wheel(0, -10000);
    await expect.poll(() => list.evaluate((element) => element.scrollTop)).toBe(0);
    const firstRow = list.locator("[data-annotation-list-id]").first();
    const secondRow = list.locator("[data-annotation-list-id]").nth(1);
    await firstRow.focus();
    await page.keyboard.press("ArrowDown");
    await expect(secondRow).toHaveAttribute("data-selected", "true");
    await page.keyboard.press("ArrowUp");
    await expect(firstRow).toHaveAttribute("data-selected", "true");

    const before = await bottomContent.evaluate((element) => {
      const box = element.getBoundingClientRect();
      return { x: box.x, width: box.width, height: box.height };
    });
    const firstId = await firstRow.getAttribute("data-annotation-list-id");
    const firstLabel = await firstRow.locator(".annotation-list-label").innerText();
    const host = page.getByTestId("cycle-surface");
    const viewOnlyBefore = await documentState(page);
    await firstRow.click();
    await expect(firstRow).toHaveAttribute("data-selected", "true");
    await expect(page.getByRole("textbox", { name: "Annotation label", exact: true })).toHaveValue(firstLabel);
    const after = await bottomContent.evaluate((element) => {
      const box = element.getBoundingClientRect();
      return { x: box.x, width: box.width, height: box.height };
    });
    expect(after).toEqual(before);
    await expect(bottomContent.getByTestId("annotation-editor")).toHaveCount(0);

    const inspectorLabel = page.getByRole("textbox", { name: "Annotation label", exact: true });
    await inspectorLabel.fill("unapplied draft from prior selection");
    await page.getByTestId("annotation-preview-action").click();
    await expect(page.getByTestId("annotation-preview-status")).toContainText("canonical data unchanged");
    const secondLabel = await secondRow.locator(".annotation-list-label").innerText();
    await secondRow.click();
    await expect(secondRow).toHaveAttribute("data-selected", "true");
    await expect(page.getByRole("textbox", { name: "Annotation label", exact: true })).toHaveValue(secondLabel);
    expect(await bottomContent.evaluate((element) => {
      const box = element.getBoundingClientRect();
      return { x: box.x, width: box.width, height: box.height };
    })).toEqual(before);
    await expectViewOnly(page, viewOnlyBefore);

    await firstRow.click();
    await page.getByRole("textbox", { name: "Annotation label", exact: true }).fill("Inspector-applied label");
    await page.getByTestId("apply-annotation-properties").click();
    await expect(host).toHaveAttribute("data-editor-idle", "true");
    await expect(firstRow.locator(".annotation-list-label")).toHaveText("Inspector-applied label");
    await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
    await page.keyboard.press("Control+z");
    await expect(host).toHaveAttribute("data-editor-idle", "true");
    await expect(firstRow.locator(".annotation-list-label")).toHaveText(firstLabel);
    await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 1");

    const measurementRow = list.locator('[data-annotation-list-id="demo_ann_measurement"]');
    await measurementRow.click();
    await expect(page.getByLabel("Measurement profile")).toHaveValue("cycle");
    await page.getByLabel("Measurement profile").selectOption("30-70");
    await page.getByTestId("apply-measurement-semantics").click();
    await expect(host).toHaveAttribute("data-editor-idle", "true");
    await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
    await page.keyboard.press("Control+z");
    await expect(host).toHaveAttribute("data-editor-idle", "true");
    await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 1");

    const scrollOwners = await bottomContent.locator("*").evaluateAll((elements) =>
      elements.filter((element) => {
        const style = getComputedStyle(element);
        return /(auto|scroll)/.test(style.overflowY) && element.scrollHeight > element.clientHeight;
      }).map((element) => element.getAttribute("data-testid") ?? element.className),
    );
    expect(scrollOwners).toEqual(["annotation-list"]);

    await page.getByLabel("Annotation preset").selectOption("measurement");
    await page.getByTestId("create-annotation-preset").click();
    await expect(list).toHaveAttribute("aria-rowcount", "18");
    const selectedRow = list.locator('[data-annotation-list-id][data-selected="true"]');
    await expect(selectedRow).toHaveCount(1);
    const createdId = await selectedRow.getAttribute("data-annotation-list-id");
    expect(createdId).toBeTruthy();
    await expect(bottomContent).toHaveAttribute("class", /bottom-content-annotation/);
    expect(firstId).toMatch(/^demo_ann_/);
  });
}
