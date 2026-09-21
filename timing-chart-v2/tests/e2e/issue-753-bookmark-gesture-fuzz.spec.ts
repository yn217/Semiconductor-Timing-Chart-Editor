import { expect, test, type Page } from "@playwright/test";

// #753 closure audit: replay randomized (seeded) Bookmark-related gesture sequences across modes, recording the failure signals the
// user's second video suggests (same-URL blank page): #root child count, main-frame URL, pageerror, unhandled rejection, console
// errors, and the topmost element at the screen centre (root-covering overlay).
function rng(seed: number) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0x100000000; }; }

async function snapshot(page: Page) {
  return page.evaluate(() => {
    const root = document.getElementById("root");
    const cx = Math.round(innerWidth / 2); const cy = Math.round(innerHeight / 2);
    const stack = document.elementsFromPoint(cx, cy).slice(0, 3).map((e) => `${e.tagName}.${(e as HTMLElement).className?.toString().slice(0, 40)}`);
    return { rootChildren: root?.childElementCount ?? -1, bodyLen: document.body.innerHTML.length, url: location.href, shell: !!document.querySelector("main.editor-shell"), stack, unhandled: (window as unknown as { __unhandled?: string[] }).__unhandled ?? [] };
  });
}

for (const seed of [1, 2, 3, 4, 5]) {
  test(`Bookmark gesture fuzz keeps the editor alive (seed ${seed})`, async ({ page }) => {
    test.setTimeout(240_000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
    page.on("console", (message) => { if (message.type() === "error") errors.push(`console: ${message.text().slice(0, 200)}`); });
    await page.addInitScript(() => { (window as unknown as { __unhandled: string[] }).__unhandled = []; window.addEventListener("unhandledrejection", (event) => (window as unknown as { __unhandled: string[] }).__unhandled.push(String(event.reason))); });
    await page.setViewportSize({ width: 1672, height: 941 });
    await page.goto("/");
    const startUrl = page.url();
    await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
    const random = rng(seed);
    const pick = <T,>(items: readonly T[]) => items[Math.floor(random() * items.length)]!;
    const log: string[] = [];
    const executed: Record<string, number> = {};
    const tryClick = async (label: string, action: () => Promise<unknown>) => { log.push(label); try { await action(); executed[label] = (executed[label] ?? 0) + 1; } catch (error) { log.push(`  (skipped: ${String(error).split("\n")[0]!.slice(0, 80)})`); } };
    const ribbonTab = (name: string) => page.locator(".ribbon-tabs").getByRole("button", { name, exact: true });
    for (let step = 0; step < 36; step += 1) {
      const kind = pick(["mode", "add", "panel", "row", "rowdbl", "next", "prev", "delete", "undo", "redo", "zoom", "insertCycle", "deleteCycle", "marker"] as const);
      const panel = page.getByTestId("bookmark-editor-panel");
      if (kind === "mode") await tryClick(`mode`, async () => page.locator(".view-mode").getByRole("button", { name: pick(["Cycle", "Transaction", "Combined"] as const), exact: true }).click({ timeout: 3000 }));
      else if (kind === "add") await tryClick("add marker", async () => { await ribbonTab("Timeline").click({ timeout: 3000 }); await page.getByRole("button", { name: "Add marker" }).click({ timeout: 3000 }); });
      else if (kind === "panel") await tryClick("open panel", async () => page.getByRole("button", { name: "Open Bookmarks panel", exact: true }).click({ timeout: 3000 }));
      else if (kind === "row" || kind === "rowdbl") await tryClick(kind, async () => { const rows = panel.getByTestId(/bookmark-row-/); const n = await rows.count(); if (n === 0) return; const row = rows.nth(Math.floor(random() * n)); if (kind === "row") await row.click({ timeout: 3000 }); else await row.dblclick({ timeout: 3000 }); });
      else if (kind === "next" || kind === "prev") await tryClick(kind, async () => pick([page.getByTestId("ribbon"), panel]).getByRole("button", { name: kind === "next" ? "Next bookmark" : "Previous bookmark", exact: true }).click({ timeout: 3000 }));
      else if (kind === "delete") await tryClick("delete bookmark", async () => { const del = panel.getByRole("button", { name: /^Delete/ }); if (await del.count() > 0) await del.first().click({ timeout: 3000 }); });
      else if (kind === "undo") await tryClick("undo", async () => { await ribbonTab("Home").click({ timeout: 3000 }); await page.getByTestId("ribbon").getByRole("button", { name: "Undo", exact: true }).click({ timeout: 3000 }); });
      else if (kind === "redo") await tryClick("redo", async () => { await ribbonTab("Home").click({ timeout: 3000 }); await page.getByTestId("ribbon").getByRole("button", { name: "Redo", exact: true }).click({ timeout: 3000 }); });
      else if (kind === "zoom") await tryClick("zoom", async () => { await ribbonTab("Home").click({ timeout: 3000 }); await page.getByTestId("ribbon").getByRole("button", { name: pick(["Zoom In", "Zoom Out", "Fit All"] as const), exact: true }).click({ timeout: 3000 }); });
      else if (kind === "insertCycle" || kind === "deleteCycle") await tryClick(kind, async () => { await ribbonTab("Home").click({ timeout: 3000 }); await page.getByTestId("ribbon").getByRole("button", { name: kind === "insertCycle" ? /Cycle Insert/ : /Cycle Delete/ }).first().click({ timeout: 3000 }); });
      else await tryClick("marker click", async () => { const m = page.locator("[data-bookmark-id]"); const n = await m.count(); if (n > 0) await m.nth(Math.floor(random() * n)).click({ timeout: 3000, force: false }); });
      await page.waitForTimeout(60);
      const snap = await snapshot(page);
      const context = `seed ${seed} step ${step} (${log.slice(-2).join(" | ")})`;
      expect(errors, `${context}: errors`).toEqual([]);
      expect(snap.unhandled, `${context}: unhandled rejections`).toEqual([]);
      expect(snap.url, `${context}: URL`).toBe(startUrl);
      expect(snap.rootChildren, `${context}: #root children`).toBeGreaterThan(0);
      expect(snap.shell, `${context}: editor shell`).toBe(true);
      expect(snap.bodyLen, `${context}: body not blank (${snap.stack.join(" > ")})`).toBeGreaterThan(5_000);
    }
    // The fuzz must really exercise Bookmark gestures, not skip them all.
    const bookmarkGestures = (executed["row"] ?? 0) + (executed["rowdbl"] ?? 0) + (executed["next"] ?? 0) + (executed["prev"] ?? 0) + (executed["marker click"] ?? 0);
    console.log(`FUZZ seed ${seed} executed ${JSON.stringify(executed)}`);
    expect(bookmarkGestures, `seed ${seed}: executed Bookmark gestures`).toBeGreaterThanOrEqual(3);
  });
}
