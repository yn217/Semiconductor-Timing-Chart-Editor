import { expect, test } from "@playwright/test";
import { generatePerformanceDocument } from "@timing-chart-v2/testing";

test("vertical viewport updates reuse unchanged Group header controls", async ({ page }) => {
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const document = generatePerformanceDocument({ signalCount: 1_000, cycleCount: 32, profile: "standard" });
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({
    name: "issue-175-group-header-scroll.tcd",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(document)),
  });
  await expect(page.locator(".app-titlebar h1")).toHaveText(document.document.title);
  await expect(host).toHaveAttribute("data-editor-idle", "true", { timeout: 60_000 });
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  await expect(host).toHaveAttribute("data-editor-idle", "true");

  const header = host.locator("[data-role='left-group-header'][data-group-id='grp_perf_0']");
  await expect(header).toBeVisible();
  const viewport = page.getByTestId("cycle-viewport");
  const before = await host.getAttribute("data-canonical-revision");
  const scrollEvidence = await page.evaluate(async () => {
    const header = document.querySelector<HTMLElement>("[data-role='left-group-header'][data-group-id='grp_perf_0']");
    const viewport = document.querySelector<HTMLElement>("[data-testid='cycle-viewport']");
    if (!header || !viewport) throw new Error("Expected visible Group header and Cycle viewport");
    const initialChildren = [...header.childNodes];
    const initialSignature = header.dataset.presentationSignature;
    const mutations: string[] = [];
    const observer = new MutationObserver((records) => {
      for (const record of records.filter((entry) => entry.type === "childList")) {
        mutations.push(`${[...record.removedNodes].map((node) => (node as HTMLElement).dataset?.role ?? node.nodeName)} -> ${[...record.addedNodes].map((node) => (node as HTMLElement).dataset?.role ?? node.nodeName)}`);
      }
    });
    observer.observe(header, { childList: true });
    viewport.scrollTop += 80;
    await new Promise<void>((resolve) => {
      let frames = 4;
      const next = () => { if (--frames === 0) resolve(); else requestAnimationFrame(next); };
      requestAnimationFrame(next);
    });
    observer.disconnect();
    return {
      scrollTop: viewport.scrollTop,
      childListChanges: mutations.length,
      mutations,
      initialSignature,
      finalSignature: header.dataset.presentationSignature,
      sameChildNodes: initialChildren.length === header.childNodes.length && initialChildren.every((child, index) => header.childNodes[index] === child),
    };
  });
  expect(scrollEvidence.scrollTop).toBeGreaterThan(0);
  expect(scrollEvidence.childListChanges, `unchanged Group header controls must not be reconstructed during scroll: ${JSON.stringify(scrollEvidence)}`).toBe(0);
  expect(scrollEvidence.sameChildNodes).toBe(true);
  expect(await host.getAttribute("data-canonical-revision")).toBe(before);

  await header.locator("[data-role='tree-collapse']").click();
  await expect(header.locator("[data-role='tree-collapse']")).toHaveAttribute("aria-expanded", "false");
  expect(await host.getAttribute("data-canonical-revision")).toBe(before);
});
