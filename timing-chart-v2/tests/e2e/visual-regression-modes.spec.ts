import { expect, test } from "@playwright/test";

// Layout-shape regression net: this session's manual QA passes kept finding
// real layout bugs (Combined mode's MiniMap detaching at short viewports,
// Cycle mode's grid drifting from the waveform) that every targeted e2e
// assertion in the suite missed, because each assertion checks one property
// (an attribute, a bounding-box relationship) rather than "does the whole
// screen still look right." A whole-viewport screenshot diff catches the
// class of bug none of those targeted checks are shaped to see -- it is
// deliberately coarse and unrelated to `gui-visual-acceptance.spec.ts`
// (a V1-vs-V2 pixel-fidelity proof for one fixed Cycle golden), which this
// does not replace.
//
// First run on a given platform/browser has no baseline and fails with a
// "missing snapshot" diagnostic that writes the actual capture next to
// where the baseline belongs -- promote that file (or run this suite with
// `--update-snapshots`) once to establish it, then commit it. Snapshot
// filenames are automatically namespaced per OS by Playwright, so Windows
// and Linux (CI) baselines never collide or get compared against each
// other.
const viewports = [
  { name: "1280x720", width: 1280, height: 720 },
  { name: "1672x941", width: 1672, height: 941 },
] as const;

const modes = ["Cycle", "Transaction", "Combined"] as const;

for (const viewport of viewports) {
  test.describe(`view mode layout shape at ${viewport.name}`, () => {
    for (const mode of modes) {
      test(`${mode} mode renders without layout regression`, async ({ page }, testInfo) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.goto("/?transaction-demo");
        await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
        const beforeViewOnly = {
          canonicalRevision: await page.getByTestId("cycle-surface").getAttribute("data-canonical-revision"),
          history: await page.getByTestId("history-status").innerText(),
          dirty: await page.getByTestId("dirty-status").innerText(),
        };
        await page.locator(".view-mode").getByRole("button", { name: mode, exact: true }).click();
        // Cycle/Combined paint their waveform surface asynchronously; wait for
        // the shared readiness gate rather than a fixed timeout.
        await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true");
        const manifest = await page.evaluate(({ expectedMode, viewport: requestedViewport, before }) => {
          const box = (selector: string) => {
            const element = document.querySelector<HTMLElement>(selector);
            if (!element) return undefined;
            const rect = element.getBoundingClientRect();
            const style = getComputedStyle(element);
            return {
              visible: style.display !== "none" && style.visibility !== "hidden",
              x: rect.x, y: rect.y, width: rect.width, height: rect.height,
              clientWidth: element.clientWidth, clientHeight: element.clientHeight,
              scrollWidth: element.scrollWidth, scrollHeight: element.scrollHeight,
              scrollLeft: element.scrollLeft, scrollTop: element.scrollTop,
            };
          };
          const panel = document.querySelector<HTMLElement>(".cycle-panel");
          const surface = document.querySelector<HTMLElement>("[data-testid='cycle-surface']");
          const modeStatus = document.querySelector<HTMLElement>("[data-testid='view-mode-status']")?.innerText ?? "";
          const activeMode = panel?.dataset.viewMode ?? "";
          const viewports = [...document.querySelectorAll<HTMLElement>(".cycle-viewport")];
          const viewportElement = viewports[0];
          const geometry = {
            cyclePanel: box(".cycle-panel"),
            primaryViewport: box(".cycle-viewport"),
            surface: box("[data-testid='cycle-surface']"),
            transactionTree: box(".transaction-left-tree"),
            bottomContent: box("#bottom-context-content"),
            inspector: box(".inspector-shell"),
            minimap: box(".minimap-shell"),
          };
          const afterViewOnly = {
            canonicalRevision: surface?.getAttribute("data-canonical-revision") ?? null,
            history: document.querySelector<HTMLElement>("[data-testid='history-status']")?.innerText ?? "",
            dirty: document.querySelector<HTMLElement>("[data-testid='dirty-status']")?.innerText ?? "",
          };
          return {
            schemaVersion: 1,
            scenario: `${expectedMode}-${requestedViewport.width}x${requestedViewport.height}`,
            viewport: { ...requestedViewport, devicePixelRatio: window.devicePixelRatio },
            mode: {
              expected: expectedMode,
              runtime: activeMode,
              actual: activeMode === "Split" ? "Combined" : activeMode,
              status: modeStatus,
            },
            zoom: document.querySelector<HTMLElement>("[data-testid='zoom-status']")?.innerText ?? "",
            geometry,
            scroll: {
              ownerCount: viewports.length,
              primaryOwner: viewportElement ? {
                horizontalOverflow: viewportElement.scrollWidth > viewportElement.clientWidth,
                verticalOverflow: viewportElement.scrollHeight > viewportElement.clientHeight,
                scrollLeft: viewportElement.scrollLeft,
                scrollTop: viewportElement.scrollTop,
              } : undefined,
              combinedHasSingleSharedOwner: expectedMode !== "Combined" || viewports.length === 1,
            },
            viewOnlyDelta: {
              canonicalUnchanged: before.canonicalRevision === afterViewOnly.canonicalRevision,
              historyUnchanged: before.history === afterViewOnly.history,
              dirtyUnchanged: before.dirty === afterViewOnly.dirty,
            },
            classifications: {
              mode: "EXACT", zoom: "EXACT", viewportRects: "OBSERVATION",
              overflowAndOwner: "BOOLEAN", viewOnlyDelta: "RELATIONAL",
            },
          };
        }, { expectedMode: mode, viewport: { width: viewport.width, height: viewport.height }, before: beforeViewOnly });
        expect(manifest.mode.actual).toBe(mode);
        expect(manifest.mode.runtime).toBe(mode === "Combined" ? "Split" : mode);
        expect(manifest.mode.status).toBe(`Mode: ${mode}`);
        expect(manifest.scroll.ownerCount).toBe(1);
        expect(manifest.scroll.combinedHasSingleSharedOwner).toBe(true);
        expect(manifest.viewOnlyDelta).toEqual({ canonicalUnchanged: true, historyUnchanged: true, dirtyUnchanged: true });
        await testInfo.attach("geometry-invariant-manifest.json", {
          body: Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`),
          contentType: "application/json",
        });
        await page.addStyleTag({ content: "*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }" });
        await expect(page).toHaveScreenshot(`${mode.toLowerCase()}-${viewport.name}.png`, {
          maxDiffPixelRatio: 0.015,
          animations: "disabled",
        });
      });
    }
  });
}
