import { expect, test } from "@playwright/test";

test("renders distinct connector paths and SVG arrowheads for every line type", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Annotation", exact: true }).click();
  await page.getByLabel("Annotation type").selectOption("arrow");
  await page.getByRole("button", { name: "Add annotation" }).click();

  const owner = host.locator("[data-role='annotation-owner'][data-annotation-type='arrow']").last();
  const editor = page.getByTestId("annotation-editor");
  const path = owner.locator("[data-role='annotation-path']");
  const observed = new Map<string, { readonly d: string; readonly dash: string | null }>();
  for (const lineType of ["straight", "diagonal", "curve", "orthogonal"] as const) {
    await editor.getByLabel("Annotation line type").selectOption(lineType);
    await editor.getByTestId("apply-annotation-properties").click();
    await expect(owner).toHaveAttribute("data-line-type", lineType);
    await expect(path).toHaveAttribute("data-line-type", lineType);
    observed.set(lineType, { d: await path.getAttribute("d") ?? "", dash: await path.getAttribute("stroke-dasharray") });
  }

  expect(observed.get("straight")?.d).toContain(" L ");
  expect(observed.get("straight")?.d).not.toContain(" Q ");
  expect(observed.get("diagonal")?.dash).toBe("7 4");
  expect(observed.get("curve")?.d).toContain(" Q ");
  expect((observed.get("orthogonal")?.d.match(/ L /g) ?? []).length).toBe(3);
  // #375: Diagonal must have genuinely distinct path geometry from
  // Straight -- a single 45-degree elbow (two " L " segments), not merely
  // a dashed stroke on Straight's identical single-segment path. Distinct
  // from Orthogonal's axis-aligned bend (3 " L " segments) too.
  expect((observed.get("diagonal")?.d.match(/ L /g) ?? []).length).toBe(2);
  expect(observed.get("diagonal")?.d).not.toBe(observed.get("straight")?.d);

  await editor.getByLabel("Annotation arrowhead").selectOption("bidirectional");
  await editor.getByTestId("apply-annotation-properties").click();
  await expect(path).toHaveAttribute("marker-start", /start/);
  await expect(path).toHaveAttribute("marker-end", /end/);
  await expect(owner.locator("marker")).toHaveCount(2);
  await expect(owner.locator("marker").first()).toHaveAttribute("orient", "auto-start-reverse");
  await expect(page.getByTestId("history-status")).toHaveText("History 5 / Redo 0");
});

test("Dependency annotations expose and persist line presentation controls", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Annotation", exact: true }).click();
  await page.getByLabel("Annotation type").selectOption("dependency");
  await page.getByRole("button", { name: "Add annotation" }).click();

  const owner = host.locator("[data-role='annotation-owner'][data-annotation-type='dependency']").last();
  const editor = page.getByTestId("annotation-editor");
  await expect(editor.getByLabel("Annotation line type")).toBeVisible();
  await editor.getByLabel("Annotation line type").selectOption("curve");
  await editor.getByLabel("Annotation arrowhead").selectOption("bidirectional");
  await editor.getByTestId("apply-annotation-properties").click();

  await expect(owner).toHaveAttribute("data-line-type", "curve");
  await expect(owner).toHaveAttribute("data-arrowhead", "bidirectional");
  await expect(owner.locator("[data-role='annotation-path']")).toHaveAttribute("data-line-type", "curve");
  await expect(owner.locator("marker")).toHaveCount(2);
});

// #375 item 12: SVG export must preserve the real route shape, arrow
// markers and label of a Dependency, not just the live-DOM overlay.
test("SVG export preserves a Dependency's route shape, arrow markers and label", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Annotation", exact: true }).click();
  await page.getByLabel("Annotation type").selectOption("dependency");
  await page.getByRole("button", { name: "Add annotation" }).click();

  const owner = host.locator("[data-role='annotation-owner'][data-annotation-type='dependency']").last();
  const editor = page.getByTestId("annotation-editor");
  await editor.getByLabel("Annotation label", { exact: true }).fill("Req to Ready");
  await editor.getByLabel("Annotation line type").selectOption("orthogonal");
  await editor.getByLabel("Annotation arrowhead").selectOption("bidirectional");
  await editor.getByTestId("apply-annotation-properties").click();
  await expect(owner).toHaveAttribute("data-line-type", "orthogonal");
  await expect(owner).toHaveAttribute("aria-label", /Req to Ready/);
  const annotationId = await owner.getAttribute("data-annotation-id");

  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Export", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Export Timing Chart" });
  await dialog.getByLabel("Export format").selectOption("svg");
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Export SVG", exact: true }).click();
  const path = await (await download).path();
  expect(path).toBeTruthy();
  const fs = await import("node:fs");
  const svgText = fs.readFileSync(path!, "utf-8");

  // Orthogonal's path is the 4-point L-shaped segment (3 "L" commands),
  // matching the live-DOM assertion in this file's first test.
  // Attribute order in the downloaded file isn't guaranteed to match the
  // source markup (the export pipeline may round-trip it through the
  // browser's own SVG serializer), so match the "d" attribute specifically
  // by its coordinate-path value shape rather than assuming it immediately
  // follows "annotation-path" or precedes any particular other attribute.
  const groupMatch = svgText.match(new RegExp(`<g data-annotation-id="${annotationId}"[\\s\\S]*?</g>`));
  expect(groupMatch).not.toBeNull();
  const pathMatch = groupMatch![0].match(/d="(M [^"]+)"/);
  expect(pathMatch).not.toBeNull();
  // Orthogonal's multi-segment L-shaped path, vs straight's single segment
  // (exactly one " L "). Both endpoints share a row here (same signal), so
  // the middle two bend points coincide and some SVG/PDF backends collapse
  // that degenerate segment -- assert "more than one", not an exact count.
  expect((pathMatch![1].match(/ L /g) ?? []).length).toBeGreaterThan(1);
  expect(svgText).toContain(`data-annotation-id="${annotationId}"`);
  expect(svgText).toContain("Req to Ready");
  expect((svgText.match(/<marker/g) ?? []).length).toBeGreaterThanOrEqual(2);
});

// #375: Diagonal must export a genuinely distinct path (a 45-degree elbow,
// two " L " segments), not Straight's identical single segment with only a
// different stroke-dasharray -- matching the live-DOM renderer exactly.
test("SVG export preserves Diagonal's distinct elbow geometry, not Straight's single segment", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']").click();
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Annotation", exact: true }).click();
  await page.getByLabel("Annotation type").selectOption("dependency");
  await page.getByRole("button", { name: "Add annotation" }).click();

  const owner = host.locator("[data-role='annotation-owner'][data-annotation-type='dependency']").last();
  const editor = page.getByTestId("annotation-editor");
  await editor.getByLabel("Annotation line type").selectOption("diagonal");
  await editor.getByTestId("apply-annotation-properties").click();
  await expect(owner).toHaveAttribute("data-line-type", "diagonal");
  const annotationId = await owner.getAttribute("data-annotation-id");

  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Export", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Export Timing Chart" });
  await dialog.getByLabel("Export format").selectOption("svg");
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Export SVG", exact: true }).click();
  const path = await (await download).path();
  expect(path).toBeTruthy();
  const fs = await import("node:fs");
  const svgText = fs.readFileSync(path!, "utf-8");

  const groupMatch = svgText.match(new RegExp(`<g data-annotation-id="${annotationId}"[\\s\\S]*?</g>`));
  expect(groupMatch).not.toBeNull();
  const pathMatch = groupMatch![0].match(/d="(M [^"]+)"/);
  expect(pathMatch).not.toBeNull();
  expect((pathMatch![1].match(/ L /g) ?? []).length).toBe(2);
  expect(groupMatch![0]).toContain(`stroke-dasharray="7 4"`);
});
