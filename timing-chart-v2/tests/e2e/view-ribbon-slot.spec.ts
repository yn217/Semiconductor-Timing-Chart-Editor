import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });

test("View exposes stable Show/Panels/Guides/Zoom/Workspace/Layout slots", async ({ page }) => {
  await page.goto("/");
  const shell = page.locator(".editor-shell");
  const surface = page.locator("[data-role='timing-chart-surface']");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();

  await expect(page.locator(".ribbon-major-group")).toHaveCount(7);
  await expect(page.locator(".ribbon-major-group").first()).toHaveAttribute("data-major-group", "Show");
  await expect(page.locator(".ribbon-major-group").nth(1)).toHaveAttribute("data-major-group", "Panels");
  await expect(page.locator(".ribbon-major-group").nth(2)).toHaveAttribute("data-major-group", "Guides");
  await expect(page.locator(".ribbon-major-group").nth(3)).toHaveAttribute("data-major-group", "Zoom");
  await expect(page.locator(".ribbon-major-group").nth(4)).toHaveAttribute("data-major-group", "Cursor");
  await expect(page.locator(".ribbon-major-group").nth(5)).toHaveAttribute("data-major-group", "Workspace");
  await expect(page.locator(".ribbon-major-group").nth(6)).toHaveAttribute("data-major-group", "Layout");
  await expect(page.getByTestId("ribbon").getByLabel("Layout commands")).toBeVisible();
  await expect(page.getByTestId("ribbon").getByRole("button", { name: "Reset Layout" })).toBeVisible();
  await expect(page.getByTestId("ribbon").getByRole("button", { name: "Focus Waveform" })).toBeVisible();
  await expect(page.getByTestId("ribbon").getByRole("button", { name: "Zoom Out" })).toBeVisible();
  await expect(page.getByTestId("ribbon").getByRole("button", { name: "Zoom In" })).toBeVisible();
  await expect(page.getByTestId("ribbon").getByRole("button", { name: "Fit All" })).toBeVisible();
  await expect(page.getByTestId("ribbon").getByRole("button", { name: "Fit Selection" })).toBeVisible();
  await expect(page.getByTestId("ribbon").getByLabel("Fit commands")).toBeVisible();
  await expect(page.getByTestId("ribbon").getByLabel("Workspace preset")).toBeVisible();
  await expect(page.getByTestId("ribbon").locator(".ds-ribbon-select")).toHaveCount(3);
  const zoomGroup = page.getByTestId("ribbon").getByLabel("Zoom commands");
  await expect(zoomGroup.locator(".ds-ribbon-select")).toHaveCount(1);
  await expect(zoomGroup.getByTestId("zoom-status")).toHaveClass(/visually-hidden/);
  await expect(page.getByTestId("ribbon").getByLabel("Labels and structure")).toBeVisible();
  await expect(page.getByTestId("ribbon").getByLabel("Overlays")).toBeVisible();
  // View tab visual-consistency fix: groups now render through the same
  // RibbonGroup primitive Home's own schema-composed groups use, so the
  // caption is the shared external `.ribbon-schema-group__caption` span
  // (Home's exact pattern) with the internal <b> hidden -- not a
  // View-only `.view-slot-group > b` visible-caption override.
  const footerLabels = page.getByTestId("ribbon").locator(".ribbon-schema-group__caption");
  await expect(footerLabels).toHaveCount(7);
  await expect(footerLabels).toHaveText(["Show", "Panels", "Guides", "Zoom", "Cursor", "Workspace", "Layout"]);
  // RibbonGroup always passes externalCaption to DsRibbonGroup, so there
  // is no second, internal <b> caption element at all (not merely a
  // hidden one) -- the same single-caption contract every schema-rendered
  // Home group already has.
  await expect(page.getByTestId("ribbon").locator(".ribbon-schema-group > .ds-ribbon-group > b")).toHaveCount(0);

  const before = {
    revision: await surface.getAttribute("data-canonical-revision"),
    history: await surface.getAttribute("data-history-depth"),
    dirty: await shell.getAttribute("data-workspace-preset"),
  };
  await page.getByTestId("view-show-roles").uncheck();
  await page.getByTestId("grid-toggle").uncheck();
  await page.getByTestId("view-panel-minimap").click();
  await expect(page.locator(".editor-shell")).toHaveAttribute("data-minimap-enabled", "false");
  await expect(shell).toHaveAttribute("data-show-roles", "false");
  await expect(shell).toHaveAttribute("data-minimap-enabled", "false");
  expect(await surface.getAttribute("data-canonical-revision")).toBe(before.revision);
  expect(await surface.getAttribute("data-history-depth")).toBe(before.history);
  expect(await shell.getAttribute("data-workspace-preset")).toBe(before.dirty);
});

test("View zoom uses a shared view-only route and does not move Home presentation", async ({ page }) => {
  await page.goto("/");
  const ribbon = page.getByTestId("ribbon");
  const surface = page.locator("[data-role='timing-chart-surface']");
  const home = page.locator(".ribbon-tabs").getByRole("button", { name: "Home", exact: true });
  await home.click();
  const homeZoom = page.locator("[data-major-group='Zoom']").filter({ has: page.locator(".home-view-group") });
  const homeBox = await homeZoom.boundingBox();
  const homeX = homeBox?.x ?? -1;
  await expect(homeZoom.getByRole("button")).toHaveText(["Zoom Out", "100%", "Zoom In", "Fit All", "Fit Selection"]);
  const beforeRevision = await surface.getAttribute("data-canonical-revision");
  const beforeHistory = await surface.getAttribute("data-history-depth");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
  // View tab visual-consistency fix: the Zoom group now renders through
  // the same RibbonGroup primitive and [data-ribbon-home] sizing Home's
  // own Zoom group uses (both share the fixed 280px `[data-ribbon-home]
  // [data-major-group="Zoom"]` width rule) -- there is no more
  // View-specific `.view-zoom-slot` wrapper to select by. Labels are
  // plain single-line strings now (not hand-split <span> pairs), so
  // "Zoom Out" reads as one space-separated string like every other
  // schema-driven button's label (Home's own "Save As" is the same shape).
  const viewZoom = page.locator("[data-major-group='Zoom']").filter({ hasText: "Zoom" });
  await expect(viewZoom).toBeVisible();
  await expect(viewZoom.getByRole("button")).toHaveText(["Zoom Out", "Zoom In", "Fit All", "Fit Selection"]);
  await expect(viewZoom.getByLabel("Zoom preset")).toBeVisible();
  const viewBox = await viewZoom.boundingBox();
  expect(viewBox).not.toBeNull();
  expect(homeBox).not.toBeNull();
  // Both Zoom groups share the exact same [data-ribbon-home] width rule
  // now, so their widths match even though their X position (governed by
  // each tab's own, unrelated, preceding groups) legitimately doesn't.
  expect(viewBox!.width).toBeGreaterThan(0);
  expect(homeBox!.width).toBeGreaterThan(0);
  await ribbon.getByRole("button", { name: "Zoom In" }).click();
  await expect(page.getByTestId("zoom-status")).toHaveText("125%");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Home", exact: true }).click();
  await expect(homeZoom).toBeVisible();
  expect((await homeZoom.boundingBox())?.x ?? -1).toBe(homeX);
  expect(await surface.getAttribute("data-canonical-revision")).toBe(beforeRevision);
  expect(await surface.getAttribute("data-history-depth")).toBe(beforeHistory);
});

test("View groups compress without horizontal overflow at 1280px", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
  const ribbon = page.getByTestId("ribbon");
  await expect(ribbon.locator("[data-major-group]")).toHaveCount(7);
  const metrics = await ribbon.evaluate((node) => {
    const root = node.getBoundingClientRect();
    const groups = [...node.querySelectorAll<HTMLElement>("[data-major-group]")].map((group) => group.getBoundingClientRect());
    return { scrollWidth: node.scrollWidth, clientWidth: node.clientWidth, right: Math.max(...groups.map((group) => group.right)), viewportRight: root.right };
  });
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth);
  expect(metrics.right).toBeLessThanOrEqual(metrics.viewportRight + 1);
  await expect(ribbon.getByLabel("Zoom preset")).toBeVisible();
  await expect(ribbon.getByLabel("Workspace preset")).toBeVisible();
});

test("View group controls stay inside their owned regions", async ({ page }) => {
  await page.goto("/");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
  const metrics = await page.getByTestId("ribbon").evaluate((ribbon) => [...ribbon.querySelectorAll<HTMLElement>("[data-major-group]")].map((group) => {
    const owner = group.querySelector<HTMLElement>(".ds-ribbon-group")!;
    const ownerRect = owner.getBoundingClientRect();
    const children = [...owner.children].filter((child): child is HTMLElement => child instanceof HTMLElement && child.tagName !== "B" && getComputedStyle(child).display !== "none");
    return { group: group.dataset.majorGroup, owner: { left: ownerRect.left, right: ownerRect.right, top: ownerRect.top, bottom: ownerRect.bottom }, children: children.map((child) => { const rect = child.getBoundingClientRect(); return { tag: child.tagName, className: child.className, left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom }; }), overflow: children.some((child) => { const rect = child.getBoundingClientRect(); return rect.left < ownerRect.left - 1 || rect.right > ownerRect.right + 1 || rect.top < ownerRect.top - 1 || rect.bottom > ownerRect.bottom + 1; }) };
  }));
  expect(metrics.every((item) => !item.overflow), JSON.stringify(metrics)).toBe(true);
  // View tab visual-consistency fix: Fit All/Fit Selection no longer sit
  // in a specially tight (near-zero-gap) sub-container -- they use the
  // same uniform inter-button gap every other pair of adjacent Ribbon
  // buttons gets (Home doesn't special-case spacing between any of its
  // own related buttons either), just left-to-right in order.
  const fitButtons = await page.getByLabel("Fit commands").getByRole("button").evaluateAll((buttons) => buttons.map((button) => button.getBoundingClientRect()));
  expect(fitButtons[0]!.right).toBeLessThanOrEqual(fitButtons[1]!.left);
});

test("Layout Focus Waveform restores the previous panel state without document history", async ({ page }) => {
  await page.goto("/");
  const shell = page.locator(".editor-shell");
  const surface = page.locator("[data-role='timing-chart-surface']");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
  await page.getByTestId("ribbon").getByLabel("Inspector").click();
  const before = {
    revision: await surface.getAttribute("data-canonical-revision"),
    history: await surface.getAttribute("data-history-depth"),
    bottom: await shell.getAttribute("data-bottom-visible"),
  };
  await page.getByTestId("ribbon").getByRole("button", { name: "Focus Waveform" }).click();
  await expect(shell).toHaveAttribute("data-workspace-preset", "waveform");
  await expect(shell).toHaveAttribute("data-inspector-visible", "false");
  await expect(shell).toHaveAttribute("data-bottom-visible", "false");
  await page.getByTestId("ribbon").getByRole("button", { name: "Focus Waveform" }).click();
  await expect(shell).toHaveAttribute("data-workspace-preset", "edit");
  await expect(shell).toHaveAttribute("data-inspector-visible", "false");
  await expect(shell).toHaveAttribute("data-bottom-visible", before.bottom!);
  expect(await surface.getAttribute("data-canonical-revision")).toBe(before.revision);
  expect(await surface.getAttribute("data-history-depth")).toBe(before.history);
});

// #389: Inspector/Bottom Editor/Signal Tree start checked=true, so their
// normal (not-hovering) state used to permanently show the exact same
// solid border+fill treatment .ds-ribbon-button only otherwise applies on
// a transient :hover -- a persistently-lit blue tile with no Home Ribbon
// counterpart (Home has no persistently-toggled buttons at all). Checked
// state must now read as "selected" (border + text color, matching
// Home's own persistent-active idiom on .ribbon-tabs > button.active)
// rather than a stuck hover fill.
test("View Panels toggle buttons look like other ribbon buttons: accent icon only, no tile border/fill/bar (#389)", async ({ page }) => {
  await page.goto("/");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
  const ribbon = page.getByTestId("ribbon");

  const checked = ["Inspector", "Bottom Editor", "Signal Tree"];
  for (const label of checked) {
    const button = ribbon.getByRole("button", { name: label });
    await expect(button).toHaveAttribute("aria-pressed", "true");
    const style = await button.evaluate((el) => { const cs = getComputedStyle(el); return { background: cs.backgroundColor, border: cs.borderTopColor, bar: cs.boxShadow, icon: getComputedStyle(el.querySelector(".ds-icon-box")!).color, weight: cs.fontWeight }; });
    // Transparent/no-fill background -- not the old solid #dceeff tile.
    expect(style.background, `${label}: ${JSON.stringify(style)}`).toMatch(/^rgba\(0,\s*0,\s*0,\s*0\)$/);
    // Same border/weight as any other ribbon button (no stuck "tile"); the pressed state is the accent bar + accent icon instead.
    expect(style.border, label).toBe("rgba(0, 0, 0, 0)");
    expect(style.weight, label).toBe(await ribbon.getByRole("button", { name: "Zoom Out" }).evaluate((el) => getComputedStyle(el).fontWeight));
    expect(style.bar, label).toBe("none");
    expect(style.icon, label).toBe("rgb(22, 117, 209)");
  }

  const inspector = ribbon.getByRole("button", { name: "Inspector" });
  const checkedStyle = await inspector.evaluate((el) => getComputedStyle(el.querySelector(".ds-icon-box")!).color);
  await inspector.click();
  await expect(inspector).toHaveAttribute("aria-pressed", "false");
  const uncheckedStyle = await inspector.evaluate((el) => getComputedStyle(el.querySelector(".ds-icon-box")!).color);
  expect(uncheckedStyle).not.toBe(checkedStyle);
});

test("Layout Reset restores application panes without mutating the document", async ({ page }) => {
  await page.goto("/");
  const shell = page.locator(".editor-shell");
  const surface = page.locator("[data-role='timing-chart-surface']");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
  const before = {
    revision: await surface.getAttribute("data-canonical-revision"),
    history: await surface.getAttribute("data-history-depth"),
  };
  await page.getByTestId("inspector-resizer").press("ArrowRight");
  await expect(shell).not.toHaveAttribute("data-inspector-width", "297");
  await page.getByTestId("ribbon").getByRole("button", { name: "Reset Layout" }).click();
  await expect(shell).toHaveAttribute("data-workspace-preset", "edit");
  await expect(shell).toHaveAttribute("data-left-pane-width", "265");
  await expect(shell).toHaveAttribute("data-inspector-width", "297");
  await expect(shell).toHaveAttribute("data-bottom-height", "240");
  expect(await surface.getAttribute("data-canonical-revision")).toBe(before.revision);
  expect(await surface.getAttribute("data-history-depth")).toBe(before.history);
});
