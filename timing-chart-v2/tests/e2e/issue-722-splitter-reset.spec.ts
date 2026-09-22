import { expect, test } from "@playwright/test";

test("double-clicking the Bottom and Inspector splitters restores default sizes without touching the document", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  const history = await page.getByTestId("history-status").innerText();
  const dirty = await page.getByTestId("dirty-status").innerText();
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
  await expect(page.getByTestId("history-status")).toHaveText(history);
  await expect(page.getByTestId("dirty-status")).toHaveText(dirty);
});
