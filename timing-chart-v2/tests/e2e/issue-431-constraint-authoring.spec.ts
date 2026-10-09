import { expect, test } from "@playwright/test";
import { startInCycleMode } from "./cycle-startup.js";

startInCycleMode(test);

test("Check authors semantic latency constraints and the checker reports an out-of-range edge", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Check", exact: true }).click();
  const editor = page.getByTestId("review-constraint-editor");
  await editor.locator("summary").click();
  await editor.getByLabel("Constraint trigger signal").selectOption({ label: "REQUEST" });
  await editor.getByLabel("Constraint trigger edge").selectOption("rising");
  await editor.getByLabel("Constraint response signal").selectOption({ label: "READY" });
  await editor.getByLabel("Constraint response edge").selectOption("rising");
  await editor.getByLabel("Constraint minimum cycles").fill("2");
  await editor.getByLabel("Constraint maximum cycles").fill("3");
  const before = Number((await page.getByTestId("problems-status").textContent())?.match(/\d+$/)?.[0] ?? 0);
  await editor.getByRole("button", { name: "Add latency constraint" }).click();
  await expect(editor.locator("li[data-constraint-id]")).toHaveCount(1);
  await expect(editor.getByTestId("constraint-status")).toHaveText("Latency constraint added.");
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");

  await editor.getByLabel("Constraint minimum cycles").fill("0");
  await editor.getByLabel("Constraint maximum cycles").fill("0");
  await editor.getByRole("button", { name: "Add latency constraint" }).click();
  await expect(editor.locator("li[data-constraint-id]")).toHaveCount(2);
  await expect.poll(async () => Number((await page.getByTestId("problems-status").textContent())?.match(/\d+$/)?.[0] ?? 0)).toBeGreaterThan(before);
  await expect(page.getByTestId("history-status")).toHaveText("History 2 / Redo 0");

  await page.getByTestId("bottom-tabs").getByRole("tab", { name: "Problems" }).click();
  const problemRow = page.getByTestId("problems-panel").locator('tr[data-problem-key^="LATENCY_OUT_OF_RANGE:"]').first();
  await expect(problemRow).toBeVisible();
  const problemMessage = await problemRow.locator("td").nth(3).innerText();
  const targetCycle = Number(/edge at cycle (\d+)/.exec(problemMessage)?.[1]);
  expect(Number.isInteger(targetCycle)).toBe(true);
  const beforeNavigation = {
    revision: await host.getAttribute("data-canonical-revision"),
    history: await page.getByTestId("history-status").innerText(),
    dirty: await page.getByTestId("dirty-status").innerText(),
  };
  await problemRow.getByRole("button", { name: "LATENCY_OUT_OF_RANGE" }).click();
  await expect(page.getByTestId("cycle-status")).toHaveText(`Cycle ${targetCycle}`);
  await expect(page.getByTestId("range-status")).toHaveText(`Range: [${targetCycle}, ${targetCycle + 1})`);
  await expect(host).toHaveAttribute("data-selected-cycle", String(targetCycle));
  await expect(host).toHaveAttribute("data-canonical-revision", beforeNavigation.revision!);
  await expect(page.getByTestId("history-status")).toHaveText(beforeNavigation.history);
  await expect(page.getByTestId("dirty-status")).toHaveText(beforeNavigation.dirty);

  const failing = editor.locator("li[data-constraint-id]").nth(1);
  const failingId = await failing.getAttribute("data-constraint-id");
  await failing.getByRole("button", { name: `Delete constraint ${failingId}` }).click();
  await expect(editor.locator("li[data-constraint-id]")).toHaveCount(1);
  await expect(page.getByTestId("history-status")).toHaveText("History 3 / Redo 0");
});
