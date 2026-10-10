import { expect, test } from "@playwright/test";
import { generatePerformanceDocument } from "@timing-chart-v2/testing";
import { setTimelineScrollLeft } from "./timeline-scroll.js";

/**
 * #933 closure: the adversarial identities (persisted Group "ungrouped" next to the synthetic Ungrouped section, "a:b"+"c" vs "a"+"b:c")
 * on a long timeline. The MiniMap keeps one distinct row per (groupId, laneId) identity, and horizontal virtualization over a far jump
 * renders every Transaction exactly once under its exact Group header, with no Canonical/History/Dirty change.
 */
for (const size of [{ width: 1280, height: 720 }, { width: 1672, height: 941 }]) {
  test(`adversarial Group/Lane identity survives long-range horizontal virtualization and MiniMap at ${size.width}x${size.height}`, async ({ page }) => {
    test.setTimeout(150_000);
    await page.addInitScript(() => { try { window.localStorage.setItem("timing-chart-v2.view-mode", "Transaction"); } catch { /* best effort */ } });
    await page.setViewportSize(size);
    await page.goto("/");
    const base = generatePerformanceDocument({ signalCount: 4, cycleCount: 20_000, profile: "standard" });
    const tx = (id: string, start: number, laneId: string, groupId?: string) => ({ id, name: id, start, end: start + 6, laneId, ...(groupId === undefined ? {} : { groupId }), linkedSignals: [] });
    const identities = [
      { laneId: "lane_0", groupId: undefined }, { laneId: "lane_0", groupId: "ungrouped" }, { laneId: "c", groupId: "a:b" }, { laneId: "b:c", groupId: "a" },
    ];
    const document = {
      ...base,
      transactionGroups: [
        { id: "ungrouped", name: "Real ungrouped", color: "#2f6fd1", order: 0 },
        { id: "a:b", name: "Group a:b", color: "#d1602f", order: 1 },
        { id: "a", name: "Group a", color: "#2fd1a0", order: 2 },
      ],
      transactions: [2, 9_000, 19_000].flatMap((start, band) => identities.map((identity, index) => tx(`tx_${band}_${index}`, start + index * 10, identity.laneId, identity.groupId))),
    };
    await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "p933-long.tcd", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(document)) });
    const lanes = page.getByTestId("transaction-lanes");
    await expect(lanes.locator("[data-transaction-id='tx_0_0']")).toHaveCount(1, { timeout: 60_000 });
    const host = page.getByTestId("cycle-surface");
    await expect(host).toHaveAttribute("data-canonical-revision", /^\d+$/);
    const revision = await host.getAttribute("data-canonical-revision");
    const historyBefore = await page.getByTestId("history-status").textContent();
    const dirtyBefore = await page.getByTestId("dirty-status").textContent();

    await page.getByTestId("home-minimap-toggle").check(); // MiniMap is off by default
    const minimap = page.getByTestId("minimap");
    await expect(minimap).toBeVisible();
    await expect(minimap).toHaveAttribute("data-minimap-mode", /transaction|Transaction|split|Split/i);
    // One distinct MiniMap row per structured (groupId, laneId) identity, each carrying all three far-apart Transactions.
    const rowKeys = () => minimap.locator("[data-lane-key]").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-lane-key")!).sort());
    await expect.poll(rowKeys, { timeout: 20_000 }).toEqual([JSON.stringify([null, "lane_0"]), JSON.stringify(["a", "b:c"]), JSON.stringify(["a:b", "c"]), JSON.stringify(["ungrouped", "lane_0"])].sort());
    await expect(minimap.locator(".minimap-segment-transaction")).toHaveCount(12);

    // Bars live in absolutely positioned lanes, so ownership is resolved geometrically: a bar belongs to the nearest Group header above it.
    const owners = async () => lanes.evaluate((root) => {
      const headers = [...root.querySelectorAll<HTMLElement>("[data-testid='transaction-group-header']")].map((header) => ({ top: header.getBoundingClientRect().top, group: header.dataset.ungrouped === "true" ? "" : header.dataset.transactionGroupId ?? "?" })).sort((left, right) => left.top - right.top);
      return [...root.querySelectorAll<HTMLElement>("[data-transaction-id]")].map((bar) => {
        const top = bar.getBoundingClientRect().top;
        const owner = [...headers].reverse().find((header) => header.top <= top + 1);
        return { id: bar.dataset.transactionId!, group: owner?.group ?? "?" };
      });
    });
    for (const jump of [0, 9_000, 19_000]) {
      const target = await page.evaluate((cycle) => { const owner = document.querySelector<HTMLElement>("[data-testid='cycle-viewport']")!; return Math.round(owner.scrollWidth * cycle / 20_000); }, jump);
      await setTimelineScrollLeft(page, target);
      await expect.poll(async () => (await owners()).length, { timeout: 20_000, message: `Transactions are mounted near cycle ${jump}` }).toBeGreaterThan(0);
      const seen = await owners();
      const ids = seen.map((item) => item.id);
      for (const item of seen) {
        const index = Number(item.id.split("_")[2]);
        expect(item.group, `${item.id} stays under its exact Group header`).toBe([ "", "ungrouped", "a:b", "a" ][index]);
      }
      expect(new Set(ids).size, `each Transaction renders exactly once near cycle ${jump}: ${ids.join(",")}`).toBe(ids.length);
    }
    expect(await host.getAttribute("data-canonical-revision")).toBe(revision);
    await expect(page.getByTestId("history-status")).toHaveText(historyBefore!);
    await expect(page.getByTestId("dirty-status")).toHaveText(dirtyBefore!);
  });
}
