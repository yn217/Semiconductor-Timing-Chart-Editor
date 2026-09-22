import { expect, test } from "@playwright/test";
import { timelineOwner } from "./timeline-scroll.js";
import { startInCycleMode } from "./cycle-startup.js";

startInCycleMode(test);

type Counters = {
  revision: string | null;
  history: string | null;
  dirty: string | null;
  validationRuns: number;
  commits: number;
  waveDromRenders: number;
  localGeometryBuilds: number;
  rowLayoutBuilds: number;
};

test("view-only GUI operations do not validate or semantically rerender the document", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  const surface = host.locator("[data-role='timing-chart-surface']");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");

  const readCounters = async (): Promise<Counters> => {
    const session = JSON.parse(await host.getAttribute("data-session-counters") ?? "{}") as Record<string, number>;
    const render = JSON.parse(await surface.getAttribute("data-render-counters") ?? "{}") as Record<string, number>;
    return {
      revision: await host.getAttribute("data-canonical-revision"),
      history: await host.getAttribute("data-history-depth"),
      dirty: await page.getByTestId("dirty-status").textContent(),
      validationRuns: session.validationRuns ?? 0,
      commits: session.commits ?? 0,
      waveDromRenders: render.waveDromRenders ?? 0,
      localGeometryBuilds: render.localGeometryBuilds ?? 0,
      rowLayoutBuilds: session.rowLayoutBuilds ?? 0,
    };
  };
  const assertUnchanged = async (label: string, before: Counters) => {
    const after = await readCounters();
    expect(after, label).toEqual(before);
  };
  const observe = async (label: string, action: () => Promise<void>) => {
    const before = await readCounters();
    await action();
    await assertUnchanged(label, before);
  };

  await observe("signal selection", async () => {
    await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  });
  await observe("Ribbon tab switch", async () => {
    await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
    await page.locator(".ribbon-tabs").getByRole("button", { name: "Home", exact: true }).click();
  });
  await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
  await observe("Zoom", async () => {
    await page.getByTestId("ribbon").getByRole("button", { name: "Zoom In", exact: true }).click();
  });
  await observe("Bottom tab switch", async () => {
    await page.locator(".bottom-tabs").getByRole("tab", { name: "Problems", exact: true }).click();
    await page.locator(".bottom-tabs").getByRole("tab", { name: "Signal", exact: true }).click();
  });
  await observe("Inspector visibility", async () => {
    await page.getByTestId("ribbon").getByRole("button", { name: "Inspector", exact: true }).click();
    await page.getByTestId("ribbon").getByRole("button", { name: "Inspector", exact: true }).click();
  });
  await observe("Bottom visibility", async () => {
    await page.getByTestId("ribbon").getByRole("button", { name: "Bottom Editor", exact: true }).click();
    await page.getByTestId("ribbon").getByRole("button", { name: "Bottom Editor", exact: true }).click();
  });
  await observe("Workspace preset and density", async () => {
    await page.getByLabel("Workspace preset").selectOption("waveform");
    await page.getByLabel("Workspace preset").selectOption("edit");
    await page.getByLabel("UI density").selectOption("compact");
    await page.getByLabel("UI density").selectOption("comfortable");
  });
  await observe("Left pane resize", async () => {
    const handle = page.getByTestId("left-pane-resizer");
    const box = await handle.boundingBox();
    expect(box).toBeTruthy();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.mouse.move(box!.x + 20, box!.y + box!.height / 2);
    await page.mouse.up();
  });
  await observe("Inspector resize", async () => {
    const handle = page.getByTestId("inspector-resizer");
    const box = await handle.boundingBox();
    expect(box).toBeTruthy();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.mouse.move(box!.x - 20, box!.y + box!.height / 2);
    await page.mouse.up();
  });
  await observe("Bottom resize", async () => {
    const handle = page.getByTestId("bottom-resizer");
    const box = await handle.boundingBox();
    expect(box).toBeTruthy();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.mouse.move(box!.x + box!.width / 2, box!.y - 20);
    await page.mouse.up();
  });
  await observe("viewport scroll", async () => {
    // #625: vertical on the shared viewport, horizontal on the Timeline owner.
    await page.getByTestId("cycle-viewport").evaluate((element) => element.scrollBy({ top: 40, behavior: "auto" }));
    await timelineOwner(page).evaluate((element) => element.scrollBy({ left: 120, behavior: "auto" }));
    await expect.poll(async () => await timelineOwner(page).evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
  });
});
