import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });

async function ready(page: import("@playwright/test").Page) {
  await page.goto("/?visual-reference");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
}

test("collapses only Left Tree descendants and restores stable rows without a canonical mutation", async ({ page }) => {
  await ready(page);
  const host = page.getByTestId("cycle-surface");
  const surface = host.locator("[data-role='timing-chart-surface']");
  const beforeRevision = await host.getAttribute("data-canonical-revision");
  const beforeHistory = await host.getAttribute("data-history-depth");
  const beforeWaves = JSON.parse((await surface.getAttribute("data-render-counters"))!).waveDromRenders;
  const beforeRows = await host.locator("[data-role='left-row'][data-row-id]").evaluateAll((rows) => rows.map((row) => (row as HTMLElement).dataset.rowId));

  for (const groupName of ["Input", "Internal Control", "Output"]) {
    const header = host.locator("[data-role='left-group-header'][data-group-name='" + groupName + "']");
    await header.locator("[data-role='tree-collapse']").click();
    await expect(header.locator("[data-role='tree-collapse']")).toHaveAttribute("aria-expanded", "false");
    await expect(header.locator("[data-role='tree-collapse'] svg path")).toHaveAttribute("d", "M9 6l6 6-6 6");
    await expect(host.locator("[data-role='left-row'][data-group-name='" + groupName + "']")).toHaveCount(0);
    await expect(host.locator("[data-role='frozen-row'][data-group-name='" + groupName + "']")).not.toHaveCount(0);
    await expect(host.locator("[data-role='timing-row'][data-group-name='" + groupName + "']")).not.toHaveCount(0);
    await expect(host.locator("[data-role='wave-owner'][data-group-id]")).not.toHaveCount(0);
    if (groupName !== "Output") await expect(host.locator("[data-role='left-group-header'][data-group-name='Internal Control']")).toBeVisible();
    await header.locator("[data-role='tree-collapse']").click();
    await expect(header.locator("[data-role='tree-collapse']")).toHaveAttribute("aria-expanded", "true");
  }
  expect(await host.getAttribute("data-canonical-revision")).toBe(beforeRevision);
  expect(await host.getAttribute("data-history-depth")).toBe(beforeHistory);
  expect(JSON.parse((await surface.getAttribute("data-render-counters"))!).waveDromRenders).toBe(beforeWaves);

  await expect(host.locator("[data-role='left-row'][data-row-id]")).toHaveCount(beforeRows.length);
  expect(await host.locator("[data-role='left-row'][data-row-id]").evaluateAll((rows) => rows.map((row) => (row as HTMLElement).dataset.rowId))).toEqual(beforeRows);
});

test("visibility keeps the navigation row but removes and restores derived signal surfaces", async ({ page }) => {
  await ready(page);
  const host = page.getByTestId("cycle-surface");
  const id = "sig_cycle_ready";
  const left = host.locator("[data-role='left-row'][data-row-id='" + id + "']");
  await left.locator("[data-role='tree-visibility']").click();
  await expect(left).toBeVisible();
  await expect(left.locator("[data-role='tree-visibility']")).toHaveAttribute("aria-pressed", "false");
  await expect(left.locator("[data-role='tree-visibility'] svg")).toHaveAttribute("data-icon", "eye-off");
  await expect(host.locator("[data-role='frozen-row'][data-row-id='" + id + "']")).toHaveCount(0);
  await expect(host.locator("[data-role='timing-row'][data-row-id='" + id + "']")).toHaveCount(0);
  await expect(host.locator("[data-role='wave-owner'][data-signal-id='" + id + "']")).toHaveCount(0);
  await left.locator("[data-role='tree-visibility']").click();
  await expect(left.locator("[data-role='tree-visibility']")).toHaveAttribute("aria-pressed", "true");
  await expect(left.locator("[data-role='tree-visibility'] svg")).toHaveAttribute("data-icon", "eye");
  await expect(host.locator("[data-role='frozen-row'][data-row-id='" + id + "']")).toHaveCount(1);
  await expect(host.locator("[data-role='timing-row'][data-row-id='" + id + "']")).toHaveCount(1);
  await expect(host.locator("[data-role='wave-owner'][data-signal-id='" + id + "']")).toHaveCount(1);
});

test("row and group More commands route to the shared context menu and insertion follows selection", async ({ page }) => {
  await ready(page);
  const host = page.getByTestId("cycle-surface");
  const busy = host.locator("[data-role='left-row'][data-row-id='sig_cycle_ready']");
  await busy.locator("[data-role='tree-more']").click();
  await expect(page.getByRole("menu", { name: "Signal context menu" })).toBeVisible();
  await page.getByRole("menu", { name: "Signal context menu" }).getByRole("menuitem", { name: "Rename" }).click();
  await expect(page.getByTestId("rename-dialog")).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();

  await host.locator("[data-role='left-group-header'][data-group-name='Internal Control'] [data-role='tree-group-more']").click();
  await expect(page.getByRole("menu", { name: "Group context menu" })).toBeVisible();
  await page.getByRole("menu", { name: "Group context menu" }).getByRole("menuitem", { name: "Move Down" }).click();

  await busy.click();
  await page.getByRole("button", { name: "Add signal or group" }).click();
  await page.getByRole("menu", { name: "Add signal or group" }).getByRole("menuitem", { name: "Signal", exact: true }).click();
  await expect.poll(async () => host.locator("[data-role='left-row'][data-group-id='grp_cycle_payload']").count()).toBe(4);
  const order = await host.locator("[data-role='left-row'][data-group-id='grp_cycle_payload']").evaluateAll((rows) => rows.map((row) => (row as HTMLElement).dataset.rowId));
  const insertedIndex = order.indexOf("sig_cycle_ready") + 1;
  expect(insertedIndex).toBeGreaterThan(0);
  expect(order[insertedIndex]).not.toBe("sig_cycle_valid");
});
