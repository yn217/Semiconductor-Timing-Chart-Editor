import { expect, test } from "@playwright/test";

test("Bottom Editor splitter resizes and collapses without changing document or render state", async ({ page }) => {
  await page.goto("/");
  const shell = page.locator(".editor-shell");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const before = {
    revision: await host.getAttribute("data-canonical-revision"),
    history: await host.getAttribute("data-history-depth"),
    dirty: await page.getByTestId("dirty-status").textContent(),
    session: await host.getAttribute("data-session-counters"),
  };
  const initialHeight = Number(await shell.getAttribute("data-bottom-height"));
  const resizer = page.getByTestId("bottom-resizer");
  await expect(resizer).toHaveAttribute("aria-valuenow", String(initialHeight));
  const box = await resizer.boundingBox();
  expect(box).toBeTruthy();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width / 2, box!.y - 80);
  await page.mouse.up();
  const resizedHeight = Number(await shell.getAttribute("data-bottom-height"));
  expect(resizedHeight).toBeGreaterThan(initialHeight);
  expect(resizedHeight).toBeLessThanOrEqual(420);
  await expect(resizer).toHaveAttribute("aria-valuenow", String(resizedHeight));
  expect(await host.getAttribute("data-canonical-revision")).toBe(before.revision);
  expect(await host.getAttribute("data-history-depth")).toBe(before.history);
  expect(await page.getByTestId("dirty-status").textContent()).toBe(before.dirty);
  expect(await host.getAttribute("data-session-counters")).toBe(before.session);
  await page.screenshot({ path: ".tmp_gui_reference/gui-bottom-resize-1672x941.png", animations: "disabled" });

  await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Bottom Editor", exact: true }).click();
  await expect(shell).toHaveAttribute("data-bottom-visible", "false");
  expect(await host.getAttribute("data-canonical-revision")).toBe(before.revision);
  expect(await host.getAttribute("data-history-depth")).toBe(before.history);
  expect(await page.getByTestId("dirty-status").textContent()).toBe(before.dirty);
  await page.getByTestId("ribbon").getByRole("button", { name: "Bottom Editor", exact: true }).click();
  await expect(shell).toHaveAttribute("data-bottom-visible", "true");
  await expect(page.getByTestId("bottom-editor")).toBeVisible();
  await expect(page.getByTestId("bottom-resizer")).toHaveAttribute("aria-valuenow", String(resizedHeight));
});
