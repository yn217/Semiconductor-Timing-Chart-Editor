import { expect, test } from "@playwright/test";
import { documentState, expectViewOnly } from "./view-only.js";

// #722: splitters advertise themselves (resize cursor, hit area larger than the 1px line, hover reveal) and their size is view state that
// neither selection nor a mode round-trip changes, and never touches Canonical/History/Dirty.
for (const viewport of [{ width: 1672, height: 941 }, { width: 1280, height: 720 }]) {
  test(`Bottom and Inspector splitters are discoverable at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
    await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
    const viewOnlyBefore = await documentState(page);
    const revision = await page.getByTestId("cycle-surface").getAttribute("data-canonical-revision");
    const bottom = page.getByTestId("bottom-resizer");
    const inspector = page.getByTestId("inspector-resizer");
    for (const [handle, cursors, minHit] of [[bottom, ["row-resize", "ns-resize"], "height"], [inspector, ["col-resize", "ew-resize"], "width"]] as const) {
      const box = (await handle.boundingBox())!;
      expect(box[minHit], `${minHit} of hit area`).toBeGreaterThanOrEqual(4);
      expect(cursors).toContain(await handle.evaluate((element) => getComputedStyle(element).cursor));
      const idle = await handle.evaluate((element) => { const s = getComputedStyle(element); const after = getComputedStyle(element, "::after"); const before = getComputedStyle(element, "::before"); return [s.backgroundColor, s.boxShadow, after.backgroundColor, before.backgroundColor, s.opacity].join("|"); });
      await handle.hover({ force: true });
      await page.waitForTimeout(250);
      const hover = await handle.evaluate((element) => { const s = getComputedStyle(element); const after = getComputedStyle(element, "::after"); const before = getComputedStyle(element, "::before"); return [s.backgroundColor, s.boxShadow, after.backgroundColor, before.backgroundColor, s.opacity].join("|"); });
      expect(hover, "hover reveals a handle/highlight").not.toBe(idle);
      await page.mouse.move(2, 2);
    }
    const sizes = () => Promise.all([bottom.getAttribute("aria-valuenow"), inspector.getAttribute("aria-valuenow")]);
    const before = await sizes();
    // Selecting an entity never resizes panes.
    await page.getByTestId("cycle-surface").locator("[data-role='frozen-row']").first().click();
    expect(await sizes()).toEqual(before);
    // User size survives a mode round-trip.
    await bottom.focus();
    await page.keyboard.press("ArrowUp");
    const resized = await sizes();
    expect(resized[0]).not.toBe(before[0]);
    for (const mode of ["Transaction", "Cycle"]) await page.locator(".view-mode").getByRole("button", { name: mode, exact: true }).click();
    expect(await sizes()).toEqual(resized);
    await expectViewOnly(page, viewOnlyBefore);
    await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-canonical-revision", revision!);
  });
}

test("double-clicking the Bottom and Inspector splitters restores default sizes without touching the document", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  const viewOnlyBefore = await documentState(page);
  const bottom = page.getByTestId("bottom-resizer");
  const inspector = page.getByTestId("inspector-resizer");
  const defaultBottom = await bottom.getAttribute("aria-valuenow");
  const defaultInspector = await inspector.getAttribute("aria-valuenow");
  await bottom.focus();
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowUp");
  await inspector.focus();
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  expect(await bottom.getAttribute("aria-valuenow")).not.toBe(defaultBottom);
  expect(await inspector.getAttribute("aria-valuenow")).not.toBe(defaultInspector);
  await bottom.dblclick({ force: true });
  await inspector.dblclick({ force: true });
  await expect(bottom).toHaveAttribute("aria-valuenow", defaultBottom!);
  await expect(inspector).toHaveAttribute("aria-valuenow", defaultInspector!);
  await expectViewOnly(page, viewOnlyBefore);
});
