import { expect, test } from "@playwright/test";

test("Review filters and navigates the shared Problems diagnostics without mutation", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");

  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  const editor = page.getByTestId("signal-editor");
  const row = editor.locator("form.event-row").nth(1);
  await row.getByRole("button", { name: /Edit transition/ }).click();
  await row.getByLabel("Start 3").fill("0");
  await row.getByRole("button", { name: "Save" }).click();
  await expect(page.getByTestId("problems-status")).toHaveText("Problems: 1");

  const before = {
    revision: await host.getAttribute("data-canonical-revision"),
    history: await page.getByTestId("history-status").textContent(),
    dirty: await page.getByTestId("dirty-status").textContent(),
  };
  await page.getByRole("button", { name: "Check", exact: true }).click();
  const review = page.getByTestId("review-workflow");
  await expect(review).toBeVisible();
  await expect(page.getByTestId("review-summary")).toHaveText("1 of 1 · Errors 1 · Warnings 0 · Info 0");

  await page.getByTestId("review-scope-filter").selectOption("selection");
  await expect(page.getByTestId("review-summary")).toHaveText("1 of 1 · Errors 1 · Warnings 0 · Info 0");
  await page.getByTestId("review-scope-filter").selectOption("group");
  await expect(page.getByTestId("review-summary")).toHaveText("0 of 0 · Errors 0 · Warnings 0 · Info 0");
  await page.getByTestId("review-scope-filter").selectOption("all");

  await page.getByTestId("review-severity-filter").selectOption("warning");
  await expect(page.getByTestId("review-summary")).toHaveText("0 of 1 · Errors 1 · Warnings 0 · Info 0");
  await expect(page.getByTestId("review-next")).toBeDisabled();
  await page.getByTestId("review-severity-filter").selectOption("error");
  await expect(page.getByTestId("review-next")).toBeEnabled();
  await expect(page.getByTestId("review-current-target")).toHaveText("$.start");
  await page.getByTestId("review-next").click();
  await expect(page.getByTestId("review-current-target")).toHaveText("$.start");
  await page.getByTestId("review-previous").click();
  await expect(page.getByTestId("review-current-target")).toHaveText("$.start");

  await expect(host).toHaveAttribute("data-canonical-revision", before.revision!);
  await expect(page.getByTestId("history-status")).toHaveText(before.history!);
  await expect(page.getByTestId("dirty-status")).toHaveText(before.dirty!);
});

// #394: Filter / Navigation / Summary / Selection-Status / Action must read
// as distinct groups (a shared separator between each, aligned baselines,
// no overlap) rather than one crowded band -- while the Previous/Next
// buttons stay disabled (the default state, with no diagnostics selected).
test("Check header separates Filter/Navigation/Summary/Status/Action into non-overlapping groups (#394)", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Check", exact: true }).click();
  const review = page.getByTestId("review-workflow");
  await expect(review).toBeVisible();

  const report = await review.evaluate((root) => {
    const groups = [...root.querySelectorAll<HTMLElement>(":scope > div")];
    const overlaps = (a: DOMRect, b: DOMRect) => a.left < b.right - 0.5 && a.right > b.left + 0.5 && a.top < b.bottom - 0.5 && a.bottom > b.top + 0.5;
    const boxes = groups.map((group) => group.getBoundingClientRect());
    let pairOverlap = false;
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        if (overlaps(boxes[i]!, boxes[j]!)) pairOverlap = true;
      }
    }
    const textCenters = groups.flatMap((group) => [...group.querySelectorAll<HTMLElement>("select, button, output")]
      .filter((el) => getComputedStyle(el).display !== "none")
      .map((el) => { const box = el.getBoundingClientRect(); return box.top + box.height / 2; }));
    return {
      groupCount: groups.length,
      pairOverlap,
      centerSpread: Math.max(...textCenters) - Math.min(...textCenters),
      order: groups.map((group) => group.className),
    };
  });
  expect(report.groupCount).toBe(5);
  expect(report.pairOverlap, JSON.stringify(report)).toBe(false);
  expect(report.centerSpread, JSON.stringify(report)).toBeLessThanOrEqual(2);
  expect(report.order).toEqual(["review-filter-group", "review-nav-group", "review-summary-group", "review-status-group", "review-action-group"]);

  await expect(page.getByTestId("review-previous")).toBeDisabled();
  await expect(page.getByTestId("review-next")).toBeDisabled();
  await expect(page.getByTestId("review-current-target")).toHaveText("No diagnostic selected");
});
