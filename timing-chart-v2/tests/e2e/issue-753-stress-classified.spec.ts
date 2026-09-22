import { expect, test, type Page } from "@playwright/test";

// #753 deterministic stress harness (seeded), classifying any failure into Case A (navigation), B (crash) or C (opaque overlay) per the Issue's
// contract, so a real reproduction can be triaged immediately instead of re-investigated from scratch.
const rng = (seed: number) => { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0x100000000; }; };
const ROUNDS = process.env.STRESS753 === "1" ? 80 : 24;

type Snapshot = { href: string; title: string; bodyLen: number; rootChildren: number; topAtCenter: string | undefined };
const snapshot = (page: Page): Promise<Snapshot> => page.evaluate(() => {
  const root = document.getElementById("root");
  const cx = Math.round(innerWidth / 2); const cy = Math.round(innerHeight / 2);
  const top = document.elementsFromPoint(cx, cy)[0];
  return { href: location.href, title: document.title, bodyLen: document.body.innerHTML.length, rootChildren: root?.childElementCount ?? -1, topAtCenter: top ? `${top.tagName}.${(top as HTMLElement).className?.toString().slice(0, 40)}` : undefined };
});

for (const seed of [753, 1753, 2753]) {
  test(`Bookmark single/double/reveal/prev/next repeated ${ROUNDS}x is classified on failure (seed ${seed})`, async ({ page }) => {
    test.setTimeout(300_000);
    const errors: string[] = []; const consoleErrors: string[] = []; const navigations: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text().slice(0, 200)); });
    page.on("framenavigated", (frame) => { if (frame === page.mainFrame()) navigations.push(frame.url()); });
    await page.goto("/?transaction-demo");
    const host = page.getByTestId("cycle-surface");
    await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
    const origin = new URL(page.url()).origin;
    await page.locator(".ribbon-tabs").getByRole("button", { name: "Timeline", exact: true }).click();
    for (let i = 0; i < 3; i += 1) { await page.getByLabel("Timeline range end").fill(String(6 + i * 8)); await page.getByLabel("Timeline range start").fill(String(4 + i * 8)); await page.getByRole("button", { name: "Add marker" }).click(); }
    await page.getByRole("button", { name: "Open Bookmarks panel", exact: true }).click();
    const panel = page.getByTestId("bookmark-editor-panel");
    await expect(panel).toBeVisible();
    navigations.length = 0; // drop the initial page load navigation; only navigations AFTER this point count as Case A
    const random = rng(seed);
    const pick = <T,>(items: readonly T[]) => items[Math.floor(random() * items.length)]!;
    const trace: string[] = [];
    for (let round = 0; round < ROUNDS; round += 1) {
      const action = pick(["single", "double", "reveal", "next", "prev", "marker-click", "marker-dbl"] as const);
      trace.push(`#${round} ${action}`);
      try {
        if (action === "single" || action === "double") {
          const rows = panel.getByTestId(/bookmark-row-/); const n = await rows.count(); if (n === 0) continue;
          const row = rows.nth(Math.floor(random() * n));
          if (action === "single") await row.click({ timeout: 3000 }); else await row.dblclick({ timeout: 3000 });
        } else if (action === "reveal") {
          const button = panel.getByRole("button", { name: /^Reveal/ }); if (await button.count() > 0) await button.first().click({ timeout: 3000 });
        } else if (action === "next" || action === "prev") {
          await pick([page.getByTestId("ribbon"), panel]).getByRole("button", { name: action === "next" ? "Next bookmark" : "Previous bookmark", exact: true }).click({ timeout: 3000 });
        } else {
          const markers = page.locator("[data-bookmark-id]"); const n = await markers.count(); if (n === 0) continue;
          const marker = markers.nth(Math.floor(random() * n));
          if (await marker.isVisible().catch(() => false)) { if (action === "marker-click") await marker.click({ timeout: 3000, position: { x: 1, y: 4 } }); else await marker.dblclick({ timeout: 3000, position: { x: 1, y: 4 } }); }
        }
      } catch (error) { trace.push(`  (action failed to run: ${String(error).split("\n")[0]!.slice(0, 100)})`); }
      const snap = await snapshot(page);
      const context = `seed ${seed} step ${round} (${action})`;
      if (navigations.length > 0 || new URL(snap.href).origin !== origin) {
        throw new Error(`CASE A (full-page navigation) at ${context}: navigations=${JSON.stringify(navigations)} href=${snap.href}\n${trace.join("\n")}`);
      }
      if (errors.length > 0 || snap.rootChildren <= 0 || snap.bodyLen < 5000) {
        throw new Error(`CASE B (React/render crash) at ${context}: pageerror=${JSON.stringify(errors)} console=${JSON.stringify(consoleErrors.slice(-5))} rootChildren=${snap.rootChildren} bodyLen=${snap.bodyLen}\n${trace.join("\n")}`);
      }
      if (snap.topAtCenter && /overlay|backdrop|modal|scrim/i.test(snap.topAtCenter) && !(await page.getByRole("dialog").count()) && !(await panel.isVisible().catch(() => false) && (await panel.boundingBox())?.height)) {
        throw new Error(`CASE C (opaque overlay) at ${context}: topAtCenter=${snap.topAtCenter}\n${trace.join("\n")}`);
      }
    }
    expect(errors).toEqual([]);
    expect(navigations).toEqual([]);
    await expect(page.locator("main.editor-shell")).toBeVisible();
  });
}
