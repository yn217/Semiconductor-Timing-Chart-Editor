import { expect, test } from "@playwright/test";
import { generatePerformanceDocument } from "@timing-chart-v2/testing";

/**
 * #1004: in the Cycle left Tree a Group header is visually a section (separator + dedicated background + stronger label), a Signal row is
 * quiet, hierarchy does not rely on hue, density is unchanged, and pure presentation interactions are view-only. Verified through computed
 * style on the semantic row roles (left-group-header / left-row), not DOM position or Group names.
 */
const sizes = [{ width: 1280, height: 720 }, { width: 1672, height: 941 }] as const;

for (const size of sizes) {
  test(`Cycle Tree Group headers are visually distinct from Signal rows at ${size.width}x${size.height}`, async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    await page.setViewportSize(size);
    await page.goto("/");
    const surface = page.getByTestId("cycle-surface");
    await expect(surface).toHaveAttribute("data-cycle-view-ready", "true");
    const document = generatePerformanceDocument({ signalCount: 12, cycleCount: 64, profile: "standard" });
    await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "g1004.tcd.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(document)) });
    await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 60_000 });
    await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
    const headers = surface.locator("[data-role='left-group-header']:not([hidden])");
    await expect(headers.first()).toBeVisible();
    const baseline = async () => page.evaluate(() => ({ revision: document.querySelector("[data-testid='cycle-surface']")?.getAttribute("data-canonical-revision"), history: document.querySelector("[data-testid='history-status']")?.textContent, dirty: document.querySelector("[data-testid='dirty-status']")?.textContent }));
    const before = await baseline();

    const styles = await page.evaluate(() => {
      const pick = (el: Element) => { const s = getComputedStyle(el); const r = el.getBoundingClientRect(); return { background: s.backgroundColor, shadow: s.boxShadow, weight: Number(s.fontWeight), height: r.height }; };
      const group = document.querySelector("[data-role='left-group-header']:not([hidden])")!;
      const label = group.querySelector("[data-role='tree-branch']")!;
      const row = document.querySelector("[data-role='left-row']:not([hidden])")!;
      return { group: pick(group), label: pick(label), row: pick(row) };
    });
    expect(styles.group.background, "Group has its own background").not.toBe(styles.row.background);
    expect(styles.group.shadow, "Group has a top separator and structural accent").not.toBe("none");
    expect(styles.group.shadow).toMatch(/inset/);
    expect(styles.label.weight, "Group label is stronger than Signal text").toBeGreaterThan(styles.row.weight);
    expect(styles.row.shadow, "Signal rows carry no section separator").toBe("none");
    expect(styles.group.height, "density unchanged").toBeLessThanOrEqual(styles.row.height + 6);

    // Interactions are view-only: collapse / expand, hover, keyboard focus, selection.
    const first = headers.first();
    await first.hover();
    await expect.poll(() => first.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(styles.group.background);
    await first.focus();
    await expect(first).toBeFocused();
    expect(await first.evaluate((el) => getComputedStyle(el).outlineStyle)).not.toBe("none");
    await first.locator("[data-role='tree-collapse']").click();
    await expect(surface).toHaveAttribute("data-editor-idle", "true");
    await expect(first).toHaveAttribute("aria-expanded", "false");
    expect(await first.evaluate((el) => getComputedStyle(el).boxShadow), "collapsed Group keeps its section treatment").toMatch(/inset/);
    await first.locator("[data-role='tree-collapse']").click();
    await expect(first).toHaveAttribute("aria-expanded", "true");
    expect(await baseline(), "presentation interactions do not touch Canonical / History / Dirty").toEqual(before);

    // Signal type badges keep their own semantics (still present, not faded by the Group treatment).
    const badge = surface.locator("[data-role='left-row']:not([hidden]) [data-role='role-badge'], [data-role='left-row']:not([hidden]) .role-badge").first();
    if (await badge.count()) expect(Number(await badge.evaluate((el) => getComputedStyle(el).opacity))).toBe(1);

    await surface.locator("[data-role='left-tree-rows']").screenshot({ path: testInfo.outputPath(`tree-${size.width}.png`) });
  });
}
