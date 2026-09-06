import { expect, test, type Page } from "@playwright/test";

type SessionCounters = Record<string, number> & {
  waveRendersBySignal?: Record<string, number>;
};

async function ready(page: Page) {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  return host;
}

async function sessionCounters(page: Page): Promise<SessionCounters> {
  return JSON.parse(await page.getByTestId("cycle-surface").getAttribute("data-session-counters") ?? "{}");
}

async function renderCounters(page: Page): Promise<Record<string, number>> {
  return JSON.parse(await page.locator("[data-role='timing-chart-surface']").getAttribute("data-render-counters") ?? "{}");
}

async function waitForIdle(page: Page) {
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true");
}

test("ChangeSet invalidation matrix keeps derived owners local", async ({ page }) => {
  const host = await ready(page);
  const surface = page.locator("[data-role='timing-chart-surface']");

  // Rename is a presentation-only canonical edit: it must not touch waveform,
  // local geometry, the ruler, or annotation resolution.
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  const renameBefore = { session: await sessionCounters(page), render: await renderCounters(page) };
  const inspector = page.getByTestId("inspector");
  await inspector.getByLabel("Inspector signal name", { exact: true }).fill("REQUEST_RENAMED");
  await inspector.getByLabel("Inspector signal name", { exact: true }).press("Enter");
  await waitForIdle(page);
  const renameAfter = { session: await sessionCounters(page), render: await renderCounters(page) };
  expect(renameAfter.session.rulerBuilds).toBe(renameBefore.session.rulerBuilds);
  expect(renameAfter.session.annotationResolvePasses).toBe(renameBefore.session.annotationResolvePasses);
  expect(renameAfter.render.waveDromRenders).toBe(renameBefore.render.waveDromRenders);
  expect(renameAfter.render.localGeometryBuilds).toBe(renameBefore.render.localGeometryBuilds);

  // A non-reference waveform edit invalidates exactly its waveform owner.
  const requestSvgBefore = await surface.locator("[data-signal-id='sig_cycle_request'] > svg").elementHandle();
  const clockSvgBefore = await surface.locator("[data-signal-id='sig_cycle_clock'] > svg").elementHandle();
  const waveformBefore = { session: await sessionCounters(page), render: await renderCounters(page) };
  const editor = page.getByTestId("signal-editor");
  const row = editor.locator("form.event-row").nth(1);
  await row.getByLabel(/Value 3|Value 4/).fill("X");
  await row.getByRole("button", { name: "Save" }).click();
  await waitForIdle(page);
  const waveformAfter = { session: await sessionCounters(page), render: await renderCounters(page) };
  expect(waveformAfter.session.rulerBuilds).toBe(waveformBefore.session.rulerBuilds);
  expect(waveformAfter.render.waveDromRenders).toBe(waveformBefore.render.waveDromRenders + 1);
  expect(waveformAfter.render.localGeometryBuilds).toBe(waveformBefore.render.localGeometryBuilds + 1);
  const requestSvgAfter = await surface.locator("[data-signal-id='sig_cycle_request'] > svg").elementHandle();
  const clockSvgAfter = await surface.locator("[data-signal-id='sig_cycle_clock'] > svg").elementHandle();
  expect(await requestSvgBefore!.evaluate((before, after) => before !== after, requestSvgAfter)).toBe(true);
  expect(await clockSvgBefore!.evaluate((before, after) => before === after, clockSvgAfter)).toBe(true);

  // Annotation style is an overlay-only update.
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Annotation", exact: true }).click();
  await page.getByLabel("Annotation type").selectOption("text");
  await page.getByRole("button", { name: "Add annotation" }).click();
  await waitForIdle(page);
  const owner = host.locator("[data-role='annotation-owner']").last();
  await owner.locator("[data-role='annotation-label']").click();
  const annotationBefore = { session: await sessionCounters(page), render: await renderCounters(page) };
  const annotationInspector = page.getByTestId("inspector");
  await annotationInspector.getByLabel("Inspector annotation color").fill("#2255aa");
  await annotationInspector.getByTestId("apply-inspector-annotation").click();
  await waitForIdle(page);
  const annotationAfter = { session: await sessionCounters(page), render: await renderCounters(page) };
  expect(annotationAfter.session.rulerBuilds).toBe(annotationBefore.session.rulerBuilds);
  expect(annotationAfter.session.annotationResolvePasses).toBe(annotationBefore.session.annotationResolvePasses + 1);
  expect(annotationAfter.render.waveDromRenders).toBe(annotationBefore.render.waveDromRenders);
  expect(annotationAfter.render.localGeometryBuilds).toBe(annotationBefore.render.localGeometryBuilds);

  // Reference-clock edits own the ruler dependency and still render only the
  // reference waveform under the existing ChangeSet contract.
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_clock']").click();
  const clockBefore = { session: await sessionCounters(page), render: await renderCounters(page) };
  const clockEditor = page.getByTestId("signal-editor");
  await clockEditor.getByLabel("Clock period").fill("4");
  await clockEditor.getByTestId("apply-clock-generator").click();
  await waitForIdle(page);
  const clockAfter = { session: await sessionCounters(page), render: await renderCounters(page) };
  expect(clockAfter.session.rulerBuilds).toBe(clockBefore.session.rulerBuilds + 1);
  expect(clockAfter.render.waveDromRenders).toBe(clockBefore.render.waveDromRenders + 1);
  expect(clockAfter.render.localGeometryBuilds).toBe(clockBefore.render.localGeometryBuilds + 1);
  expect(clockAfter.session.validationRuns).toBe(clockBefore.session.validationRuns + 1);
});
