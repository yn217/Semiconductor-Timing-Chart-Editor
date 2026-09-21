import { expect, test, type Page } from "@playwright/test";

// #753: no Bookmark gesture may navigate the browser, throw, or blank the editor -- in any view mode.
async function guard(page: Page) {
  const errors: string[] = [];
  const navigations: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("framenavigated", (frame) => { if (frame === page.mainFrame()) navigations.push(frame.url()); });
  return { errors, navigations };
}

async function expectEditorAlive(page: Page, origin: string, state: { errors: string[]; navigations: string[] }, step: string) {
  expect(state.errors, `${step}: uncaught page errors`).toEqual([]);
  expect(state.navigations, `${step}: main-frame navigations after load`).toEqual([]);
  expect(new URL(page.url()).origin, `${step}: origin`).toBe(origin);
  await expect(page.locator("main.editor-shell"), `${step}: editor shell still mounted`).toBeVisible();
  expect(await page.evaluate(() => document.body.innerHTML.length), `${step}: body not blank`).toBeGreaterThan(5_000);
}

for (const mode of ["Cycle", "Transaction", "Combined"] as const) {
  test(`every Bookmark gesture stays inside the SPA in ${mode} mode`, async ({ page }) => {
    await page.goto("/");
    const host = page.getByTestId("cycle-surface");
    await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
    const origin = new URL(page.url()).origin;
    await page.locator(".view-mode").getByRole("button", { name: mode, exact: true }).click();
    await expect(page.getByTestId("view-mode-status")).toHaveText(`Mode: ${mode}`, { timeout: 10_000 });
    const state = await guard(page);

    await page.locator(".ribbon-tabs").getByRole("button", { name: "Timeline", exact: true }).click();
    await page.getByLabel("Timeline range end").fill("7");
    await page.getByLabel("Timeline range start").fill("6");
    await page.getByRole("button", { name: "Add marker" }).click();
    await page.getByRole("button", { name: "Open Bookmarks panel", exact: true }).click();
    const panel = page.getByTestId("bookmark-editor-panel");
    await expect(panel).toBeVisible();
    await expectEditorAlive(page, origin, state, "create");

    const row = panel.getByTestId(/bookmark-row-/).first();
    await row.click();
    await expectEditorAlive(page, origin, state, "row click");
    await row.dblclick();
    await expectEditorAlive(page, origin, state, "row double-click (reveal)");

    for (const name of ["Reveal", "Reveal Bookmark", "Go to Bookmark"]) {
      const button = panel.getByRole("button", { name, exact: true });
      if (await button.count() > 0) { await button.first().click(); await expectEditorAlive(page, origin, state, `${name} button`); }
    }
    for (const [scope, label] of [["Ribbon", page.getByTestId("ribbon")], ["Bottom panel", panel]] as const) {
      await label.getByRole("button", { name: "Next bookmark", exact: true }).click();
      await expectEditorAlive(page, origin, state, `${scope} Next bookmark`);
      await label.getByRole("button", { name: "Previous bookmark", exact: true }).click();
      await expectEditorAlive(page, origin, state, `${scope} Previous bookmark`);
    }

    const marker = page.locator("[data-bookmark-id]").first();
    if (await marker.count() > 0 && await marker.isVisible()) {
      // Under cyclesPerTC compression (#750) neighbouring markers are a few px apart: hit the marker's own left edge.
      await marker.click({ position: { x: 1, y: 4 } });
      await expectEditorAlive(page, origin, state, "ruler marker click");
      await marker.dblclick({ position: { x: 1, y: 4 } });
      await expectEditorAlive(page, origin, state, "ruler marker double-click");
    }
  });
}
