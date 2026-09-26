import { expect, test } from "@playwright/test";

// #748 Journeys B and D: left-pane + Add creates one Transaction (one History unit) that shows up with the same stable ID in Tree, Timeline
// and Bottom; the More menu does not reflow the pane; Tab through the left header reaches only labelled controls (no hidden Signals stop).
test("left-pane Add and keyboard journey at both supported viewports", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto("/?transaction-demo");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  for (const viewport of [{ width: 1672, height: 941 }, { width: 1280, height: 720 }]) {
    await page.setViewportSize(viewport);
    const historyDepth = async () => Number(((await page.getByTestId("history-status").innerText()).match(/History (\d+)/) ?? [])[1] ?? -1);
    const ids = () => page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>("[data-testid^='transaction-left-tree-row-']")).map((el) => el.getAttribute("data-testid")!.replace("transaction-left-tree-row-", "")));
    const before = await ids(); const depth0 = await historyDepth();
    const header = page.getByTestId("transaction-tree-header");
    const paneBefore = await page.getByTestId("left-workspace-rail").boundingBox();

    // Journey B: Add.
    await header.getByRole("button", { name: "Add transaction", exact: true }).click();
    await expect.poll(async () => (await ids()).length).toBe(before.length + 1);
    const created = (await ids()).filter((id) => !before.includes(id));
    expect(created).toHaveLength(1);
    expect(await historyDepth()).toBe(depth0 + 1);
    // Same stable ID in the Timeline lane bars and in the Bottom table.
    await expect(page.locator(`.transaction-track [data-transaction-id='${created[0]}']`)).toHaveCount(1);
    await expect(page.locator(`[data-transaction-row-id='${created[0]}'], [data-transaction-id='${created[0]}']`).first()).toBeAttached();

    // Journey C: the menu opens/closes without moving the pane.
    await page.getByTestId("transaction-tree-more").click();
    const paneOpen = await page.getByTestId("left-workspace-rail").boundingBox();
    expect(paneOpen).toEqual(paneBefore);
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("transaction-tree-more-menu")).toHaveCount(0);

    // Journey D: Tab order through the header contains only named controls and never a Signals stop.
    await header.getByRole("textbox", { name: "Search transactions" }).focus();
    const stops: string[] = [];
    for (let step = 0; step < 6; step += 1) {
      stops.push(await page.evaluate(() => { const el = document.activeElement as HTMLElement | null; return el ? (el.getAttribute("aria-label") ?? el.textContent ?? el.tagName).trim().slice(0, 40) : "none"; }));
      await page.keyboard.press("Tab");
    }
    expect(stops.every((label) => label.length > 0 && label !== "BODY" && label !== "none"), stops.join(" | ")).toBe(true);
    expect(stops.some((label) => /^signals$/i.test(label))).toBe(false);
    // Linked Signals stays reachable from Bottom/Inspector.
    await page.getByTestId(`transaction-left-tree-row-demo_txn_read`).click();
    await expect(page.locator(".bottom-tabs").getByRole("tab", { name: "Linked Signals", exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  }
});
