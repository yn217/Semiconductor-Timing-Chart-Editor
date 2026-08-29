import { expect, test } from "@playwright/test";

test("Bottom tabs support keyboard roving focus and correct tabpanel semantics", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  const tablist = page.getByRole("tablist", { name: "Bottom context panels" });
  const before = await host.getAttribute("data-canonical-revision");
  await expect(tablist.getByRole("tab")).toHaveCount(4);
  const signal = tablist.getByRole("tab", { name: "Signal" });
  await signal.focus();
  await signal.press("ArrowRight");
  const annotation = tablist.getByRole("tab", { name: "Annotation" });
  await expect(annotation).toBeFocused();
  await expect(annotation).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel")).toHaveAttribute("aria-labelledby", "bottom-tab-annotation");
  await annotation.press("End");
  const json = tablist.getByRole("tab", { name: "JSON" });
  await expect(json).toBeFocused();
  await expect(json).toHaveAttribute("aria-selected", "true");
  await expect(host).toHaveAttribute("data-canonical-revision", before!);
  await expect(page.getByTestId("dirty-status")).toHaveText("Clean");
});

test("Focusable separators resize by keyboard within bounds without canonical mutation", async ({ page }) => {
  test.setTimeout(60000);
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  const before = {
    revision: await host.getAttribute("data-canonical-revision"),
    history: await page.getByTestId("history-status").textContent(),
    dirty: await page.getByTestId("dirty-status").textContent(),
  };
  const cases = [
    ["left-pane-resizer", "ArrowRight", "ArrowLeft"],
    ["frozen-pane-resizer", "ArrowRight", "ArrowLeft"],
    ["bottom-resizer", "ArrowUp", "ArrowDown"],
    ["inspector-resizer", "ArrowLeft", "ArrowRight"],
  ] as const;
  for (const [testId, growKey, shrinkKey] of cases) {
    const separator = page.getByTestId(testId);
    const minimum = Number(await separator.getAttribute("aria-valuemin"));
    const maximum = Number(await separator.getAttribute("aria-valuemax"));
    const initial = Number(await separator.getAttribute("aria-valuenow"));
    await separator.focus();
    await separator.press(growKey);
    expect(Number(await separator.getAttribute("aria-valuenow"))).toBe(Math.min(maximum, initial + 10));
    await separator.press("Shift+" + growKey);
    expect(Number(await separator.getAttribute("aria-valuenow"))).toBeLessThanOrEqual(maximum);
    while (Number(await separator.getAttribute("aria-valuenow")) < maximum) await page.keyboard.press(growKey);
    expect(Number(await separator.getAttribute("aria-valuenow"))).toBe(maximum);
    while (Number(await separator.getAttribute("aria-valuenow")) > minimum) await page.keyboard.press(shrinkKey);
    expect(Number(await separator.getAttribute("aria-valuenow"))).toBe(minimum);
  }
  await expect(host).toHaveAttribute("data-canonical-revision", before.revision!);
  await expect(page.getByTestId("history-status")).toHaveText(before.history!);
  await expect(page.getByTestId("dirty-status")).toHaveText(before.dirty!);
});
