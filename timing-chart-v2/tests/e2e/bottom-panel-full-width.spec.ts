import { expect, test, type Page } from "@playwright/test";

type LayoutEvidence = {
  readonly workspaceLeft: number;
  readonly leftRailRight: number;
  readonly bottomContentLeft: number;
  readonly bottomContentRight: number;
  readonly minimapLeft: number;
  readonly bottomWidth: number;
  readonly inspectorLeft: number;
  readonly top: {
    readonly left: { readonly left: number; readonly right: number };
    readonly frozen: { readonly left: number; readonly right: number };
    readonly waveform: { readonly left: number; readonly right: number };
  };
};

async function ready(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
}

async function readLayout(page: Page): Promise<LayoutEvidence> {
  return page.evaluate(() => {
    const rect = (selector: string): { left: number; right: number; width: number } => {
      const element = document.querySelector<HTMLElement>(selector);
      if (!element) throw new Error(`Missing layout element: ${selector}`);
      const box = element.getBoundingClientRect();
      return { left: box.left, right: box.right, width: box.width };
    };
    const workspace = rect(".desktop-workspace");
    const leftRail = rect("[data-testid='left-workspace-rail']");
    const bottomContent = rect("[data-testid='bottom-editor'] > .bottom-content");
    const minimap = rect(".inspector > [data-testid='minimap']");
    return {
      workspaceLeft: workspace.left,
      leftRailRight: leftRail.right,
      bottomContentLeft: bottomContent.left,
      bottomContentRight: bottomContent.right,
      minimapLeft: minimap.left,
      bottomWidth: rect("[data-testid='bottom-editor']").width,
      inspectorLeft: rect(".inspector-shell").left,
      top: {
        left: rect("[data-role='left-row'][data-row-id='sig_cycle_request']"),
        frozen: rect("[data-role='frozen-row'][data-row-id='sig_cycle_request']"),
        waveform: rect("[data-role='wave-owner'][data-signal-id='sig_cycle_request']"),
      },
    };
  });
}

function expectBottomShell(evidence: LayoutEvidence): void {
  expect(Math.abs(evidence.bottomContentLeft - evidence.leftRailRight)).toBeLessThanOrEqual(1);
  expect(evidence.bottomContentRight).toBeLessThanOrEqual(evidence.minimapLeft + 1);
  expect(evidence.bottomWidth).toBeGreaterThan(600);
  expect(evidence.bottomContentRight).toBeLessThanOrEqual(evidence.inspectorLeft + 1);
}

for (const viewport of [{ width: 1672, height: 941 }, { width: 1280, height: 720 }]) {
  test(`#428 Bottom shell starts after the persistent left rail at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await ready(page);

    const shell = page.locator(".editor-shell");
    const beforeState = {
      canonical: await page.getByTestId("revision-status").textContent(),
      history: await page.getByTestId("history-status").textContent(),
      dirty: await page.getByTestId("dirty-status").textContent(),
    };
    const topBefore = (await readLayout(page)).top;

    for (const tabName of ["Signal", "Annotation", "Bookmarks", "AI", "Problems", "JSON"]) {
      await page.getByTestId("bottom-tabs").locator(`[data-bottom-tab='${tabName}']`).click();
      await expect(page.locator("#bottom-context-content")).toBeVisible();
      expectBottomShell(await readLayout(page));
    }

    const topAfterTabs = (await readLayout(page)).top;
    expect(topAfterTabs.left).toEqual(topBefore.left);
    expect(topAfterTabs.frozen).toEqual(topBefore.frozen);
    expect(topAfterTabs.waveform).toEqual(topBefore.waveform);

    const inspectorResizer = page.getByTestId("inspector-resizer");
    await inspectorResizer.press("ArrowLeft");
    await expect(inspectorResizer).toHaveAttribute("aria-valuenow", "307");
    expectBottomShell(await readLayout(page));

    const bottomResizer = page.getByTestId("bottom-resizer");
    await bottomResizer.press("ArrowUp");
    await expect(bottomResizer).toHaveAttribute("aria-valuenow", "250");
    expectBottomShell(await readLayout(page));

    await page.getByLabel("Ribbon tabs").getByRole("button", { name: "View", exact: true }).click();
    const inspectorToggle = page.getByTestId("ribbon").getByRole("button", { name: "Inspector", exact: true });
    await inspectorToggle.click();
    await expect(page.locator(".inspector-shell")).toBeHidden();
    const hiddenInspectorLayout = await page.evaluate(() => {
      const workspace = document.querySelector<HTMLElement>(".desktop-workspace")!;
      const bottom = document.querySelector<HTMLElement>("[data-testid='bottom-editor'] > .bottom-content")!;
      const workspaceBox = workspace.getBoundingClientRect();
      const bottomBox = bottom.getBoundingClientRect();
      return { workspaceLeft: workspaceBox.left, bottomLeft: bottomBox.left, bottomRight: bottomBox.right };
    });
    const leftRailRight = await page.locator("[data-testid='left-workspace-rail']").evaluate((element) => element.getBoundingClientRect().right);
    expect(Math.abs(hiddenInspectorLayout.bottomLeft - leftRailRight)).toBeLessThanOrEqual(1);
    expect(hiddenInspectorLayout.bottomRight).toBeLessThanOrEqual(viewport.width + 1);
    await inspectorToggle.click();
    await expect(page.getByTestId("minimap")).toBeVisible();
    expectBottomShell(await readLayout(page));

    expect(await page.getByTestId("revision-status").textContent()).toBe(beforeState.canonical);
    expect(await page.getByTestId("history-status").textContent()).toBe(beforeState.history);
    expect(await page.getByTestId("dirty-status").textContent()).toBe(beforeState.dirty);
    await expect(page.getByTestId("minimap")).toBeVisible();
  });
}
