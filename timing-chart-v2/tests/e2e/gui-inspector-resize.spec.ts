import { expect, test } from "@playwright/test";

test("Inspector splitter resizes and collapses without changing document or render state", async ({ page }) => {
  await page.goto("/");
  const shell = page.locator(".editor-shell");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await expect(host).toHaveAttribute("data-canonical-revision", /^\d+$/);
  const before = {
    revision: await host.getAttribute("data-canonical-revision"),
    history: await host.getAttribute("data-history-depth"),
    session: await host.getAttribute("data-session-counters"),
    dirty: await page.getByTestId("dirty-status").textContent(),
  };
  const initialWidth = Number(await shell.getAttribute("data-inspector-width"));
  const resizer = page.getByTestId("inspector-resizer");
  await expect(resizer).toHaveAttribute("aria-valuenow", String(initialWidth));
  const box = await resizer.boundingBox();
  expect(box).toBeTruthy();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x - 80, box!.y + box!.height / 2);
  await page.mouse.up();
  const resizedWidth = Number(await shell.getAttribute("data-inspector-width"));
  expect(resizedWidth).toBeGreaterThan(initialWidth);
  expect(resizedWidth).toBeLessThanOrEqual(420);
  await expect(resizer).toHaveAttribute("aria-valuenow", String(resizedWidth));
  expect(await host.getAttribute("data-canonical-revision")).toBe(before.revision);
  expect(await host.getAttribute("data-history-depth")).toBe(before.history);
  expect(await host.getAttribute("data-session-counters")).toBe(before.session);
  expect(await page.getByTestId("dirty-status").textContent()).toBe(before.dirty);
  await page.screenshot({ path: ".tmp_gui_reference/gui-inspector-resize-1672x941.png", animations: "disabled" });

  await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Inspector", exact: true }).click();
  await expect(shell).toHaveAttribute("data-inspector-visible", "false");
  expect(await host.getAttribute("data-canonical-revision")).toBe(before.revision);
  expect(await host.getAttribute("data-history-depth")).toBe(before.history);
  expect(await host.getAttribute("data-session-counters")).toBe(before.session);
  await page.getByTestId("ribbon").getByRole("button", { name: "Inspector", exact: true }).click();
  await expect(shell).toHaveAttribute("data-inspector-visible", "true");
  await expect(page.getByTestId("inspector-shell")).toBeVisible();
  await expect(page.getByTestId("inspector-resizer")).toHaveAttribute("aria-valuenow", String(resizedWidth));
});
