import { expect, test } from "@playwright/test";

test("Signal/Group pane splitter resizes the derived columns without mutation", async ({ page }) => {
  await page.goto("/");
  const shell = page.locator(".editor-shell");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const before = {
    revision: await host.getAttribute("data-canonical-revision"),
    history: await host.getAttribute("data-history-depth"),
    session: await host.getAttribute("data-session-counters"),
    dirty: await page.getByTestId("dirty-status").textContent(),
  };
  const initialWidth = Number(await shell.getAttribute("data-left-pane-width"));
  const resizer = page.getByTestId("left-pane-resizer");
  await expect(resizer).toHaveAttribute("aria-valuenow", String(initialWidth));
  const box = await resizer.boundingBox();
  expect(box).toBeTruthy();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + 70, box!.y + box!.height / 2);
  await page.mouse.up();
  const resizedWidth = Number(await shell.getAttribute("data-left-pane-width"));
  expect(resizedWidth).toBeGreaterThan(initialWidth);
  expect(resizedWidth).toBeLessThanOrEqual(420);
  await expect(resizer).toHaveAttribute("aria-valuenow", String(resizedWidth));
  await expect(page.locator(".column-headings")).toHaveCSS("grid-template-columns", `${resizedWidth}px 210px 640px`);
  expect(await host.getAttribute("data-canonical-revision")).toBe(before.revision);
  expect(await host.getAttribute("data-history-depth")).toBe(before.history);
  expect(await host.getAttribute("data-session-counters")).toBe(before.session);
  expect(await page.getByTestId("dirty-status").textContent()).toBe(before.dirty);
  await page.screenshot({ path: ".tmp_gui_reference/gui-left-pane-resize-1672x941.png", animations: "disabled" });
});

test("Signal label and timing splitter resizes shared geometry columns without mutation", async ({ page }) => {
  await page.goto("/");
  const shell = page.locator(".editor-shell");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const before = {
    revision: await host.getAttribute("data-canonical-revision"),
    history: await host.getAttribute("data-history-depth"),
    session: await host.getAttribute("data-session-counters"),
    dirty: await page.getByTestId("dirty-status").textContent(),
  };
  const initialWidth = Number(await shell.getAttribute("data-frozen-pane-width"));
  const resizer = page.getByTestId("frozen-pane-resizer");
  await expect(resizer).toHaveAttribute("aria-valuenow", String(initialWidth));
  const box = await resizer.boundingBox();
  expect(box).toBeTruthy();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + 60, box!.y + box!.height / 2);
  await page.mouse.up();
  const resizedWidth = Number(await shell.getAttribute("data-frozen-pane-width"));
  expect(resizedWidth).toBeGreaterThan(initialWidth);
  expect(resizedWidth).toBeLessThanOrEqual(360);
  await expect(resizer).toHaveAttribute("aria-valuenow", String(resizedWidth));
  await expect(page.locator(".column-headings")).toHaveCSS("grid-template-columns", `${Number(await shell.getAttribute("data-left-pane-width"))}px ${resizedWidth}px 640px`);
  await expect(page.getByTestId("cycle-ruler")).toHaveCSS("left", `${Number(await shell.getAttribute("data-left-pane-width")) + resizedWidth}px`);
  await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
  await page.getByLabel("Zoom preset").selectOption("150");
  await expect(page.getByTestId("zoom-status")).toHaveText("150%");
  const resizedOffset = Number(await shell.getAttribute("data-left-pane-width")) + resizedWidth;
  const geometry = await host.evaluate((element) => ({
    surfaceWidth: Number.parseFloat(getComputedStyle(element).width),
    waveWidth: Number.parseFloat(getComputedStyle(element).getPropertyValue("--wave-width")),
  }));
  expect(geometry.surfaceWidth).toBe(resizedOffset + geometry.waveWidth * 1.5);
  expect(await host.getAttribute("data-canonical-revision")).toBe(before.revision);
  expect(await host.getAttribute("data-history-depth")).toBe(before.history);
  expect(await host.getAttribute("data-session-counters")).toBe(before.session);
  expect(await page.getByTestId("dirty-status").textContent()).toBe(before.dirty);
});
