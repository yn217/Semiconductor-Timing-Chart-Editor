import { expect, test } from "@playwright/test";

async function ready(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
}

// Undo-depth alone (not the full "History N / Redo M" string) is the right
// thing to compare across an Undo/Redo round trip -- an Undo after a fresh
// action always adds one Redo-able entry, so the *Redo* count legitimately
// differs from a snapshot taken before that action even existed.
function undoDepth(status: string): string {
  return status.split("/")[0]!.trim();
}

// #406: Home Ribbon's group set switches with ViewMode via composeRibbon
// (#405) and ActiveContext (#404) -- Time/Layout (Cycle-only row/timeline-
// range commands) only render in Signal context; Transaction stays common
// (see the scoped-decision comment on commonRibbonGroups in
// minimal-cycle-view-ribbon.tsx -- an established, already-tested Cycle-
// mode "Create Transaction" workflow means it can't be hidden per the
// issue's literal Transaction-context-only reading without regressing
// transaction-export.spec.ts).
test("Home Ribbon swaps Time/Layout for Transaction context on ViewMode change, with exact Undo/Redo and no canonical/history/dirty delta from the switch itself", async ({ page }) => {
  await ready(page);
  const ribbon = page.getByTestId("ribbon");
  const ribbonTabs = page.locator(".ribbon-tabs");

  await expect(ribbon.locator("[data-major-group='Time']")).toHaveCount(1);
  await expect(ribbon.locator("[data-major-group='Layout']")).toHaveCount(1);
  await expect(ribbon.locator("[data-major-group='Transaction']")).toHaveCount(1);

  const before = {
    revision: await page.getByTestId("revision-status").textContent(),
    history: await page.getByTestId("history-status").textContent(),
    dirty: await page.getByTestId("dirty-status").textContent(),
  };

  await ribbonTabs.getByRole("button", { name: "Transaction", exact: true }).click();
  await expect(page.getByTestId("revision-status")).toHaveText(before.revision!);
  await expect(page.getByTestId("history-status")).toHaveText(before.history!);
  await expect(page.getByTestId("dirty-status")).toHaveText(before.dirty!);

  // Time/Layout gone in Transaction context; Transaction (still common)
  // and every other common group remain.
  await expect(ribbon.locator("[data-major-group='Time']")).toHaveCount(0);
  await expect(ribbon.locator("[data-major-group='Layout']")).toHaveCount(0);
  await expect(ribbon.locator("[data-major-group='Transaction']")).toHaveCount(1);
  await expect(ribbon.locator("[data-major-group='File']")).toHaveCount(1);
  await expect(ribbon.locator("[data-major-group='Edit']")).toHaveCount(1);
  await expect(ribbon.locator("[data-major-group='Zoom']")).toHaveCount(1);
  await expect(ribbon.locator("[data-major-group='Display']")).toHaveCount(1);

  // Bottom tab followed the ViewMode switch to its Transaction context.
  await expect(page.getByTestId("bottom-tabs").locator("[data-bottom-tab='Transaction'].active")).toHaveCount(1);

  const depthBeforeCreate = undoDepth((await page.getByTestId("history-status").textContent())!);
  await ribbon.getByRole("button", { name: "Create Transaction", exact: true }).click();
  const depthAfterCreate = undoDepth((await page.getByTestId("history-status").textContent())!);
  expect(depthAfterCreate).not.toBe(depthBeforeCreate);

  await page.getByTestId("ribbon").getByRole("button", { name: "Undo", exact: true }).click();
  expect(undoDepth((await page.getByTestId("history-status").textContent())!)).toBe(depthBeforeCreate);
  await page.getByTestId("ribbon").getByRole("button", { name: "Redo", exact: true }).click();
  expect(undoDepth((await page.getByTestId("history-status").textContent())!)).toBe(depthAfterCreate);
  await page.getByTestId("ribbon").getByRole("button", { name: "Undo", exact: true }).click();
  expect(undoDepth((await page.getByTestId("history-status").textContent())!)).toBe(depthBeforeCreate);

  // Back to Cycle: Time/Layout return, Bottom follows back to Signal, no
  // regression from the round trip.
  await ribbonTabs.getByRole("button", { name: "Cycle", exact: true }).click();
  await expect(ribbon.locator("[data-major-group='Time']")).toHaveCount(1);
  await expect(ribbon.locator("[data-major-group='Layout']")).toHaveCount(1);
  await expect(page.getByTestId("bottom-tabs").locator("[data-bottom-tab='Signal'].active")).toHaveCount(1);
  expect(undoDepth((await page.getByTestId("history-status").textContent())!)).toBe(depthBeforeCreate);
});

for (const viewport of [{ width: 1672, height: 941 }, { width: 1280, height: 720 }]) {
  test(`Home Ribbon has no overlap/clipping in Transaction context at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await ready(page);
    await page.locator(".ribbon-tabs").getByRole("button", { name: "Transaction", exact: true }).click();
    const ribbon = page.getByTestId("ribbon");
    const metrics = await ribbon.evaluate((element) => ({ clientWidth: element.clientWidth, scrollWidth: element.scrollWidth }));
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1);
  });
}
