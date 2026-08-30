import { expect, test } from "@playwright/test";

for (const viewport of [{ width: 1672, height: 941 }, { width: 1280, height: 720 }]) {
  test(`keeps Insert and Timeline groups usable at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
    const tabs = page.locator(".ribbon-tabs");
    const ribbon = page.getByTestId("ribbon");
    await tabs.getByRole("button", { name: "Home", exact: true }).click();
    const homeBefore = await ribbon.evaluate((root) => ({
      groups: [...root.querySelectorAll<HTMLElement>("[data-major-group]")].map((group) => ({
        name: group.dataset.majorGroup,
        rect: [group.offsetLeft, group.offsetTop, group.offsetWidth, group.offsetHeight],
      })),
    }));

    await tabs.getByRole("button", { name: "Insert", exact: true }).click();
    const insert = page.getByTestId("insert-ribbon");
    await expect(insert.locator("[data-major-group]").first()).toHaveAttribute("data-major-group", "Signals");
    await expect(insert.locator("[data-major-group]")).toHaveCount(4);
    await expect(insert.getByRole("button", { name: "Signal", exact: true })).toBeVisible();
    await expect(insert.getByRole("button", { name: "Clock", exact: true })).toBeVisible();
    await expect(insert.getByRole("button", { name: "Bus", exact: true })).toBeVisible();
    await expect(insert.getByRole("button", { name: "State", exact: true })).toBeVisible();
    await expect(insert.getByRole("button", { name: "Spacer", exact: true })).toBeVisible();
    await expect(insert.getByRole("button", { name: "Measurement", exact: true })).toBeVisible();

    const insertGeometry = await insert.evaluate((root) => {
      const box = root.getBoundingClientRect();
      const groups = [...root.querySelectorAll<HTMLElement>("[data-major-group]")].map((element) => element.getBoundingClientRect());
      const buttons = [...root.querySelectorAll<HTMLButtonElement>("button")];
      const overlaps = (a: DOMRect, b: DOMRect) => a.left < b.right - 0.5 && a.right > b.left + 0.5 && a.top < b.bottom - 0.5 && a.bottom > b.top + 0.5;
      const buttonBoxes = buttons.map((button) => ({ button, box: button.getBoundingClientRect() }));
      const pairOverlap = buttonBoxes.some(({ box }, index) => buttonBoxes.slice(index + 1).some((other) => overlaps(box, other.box)));
      return { overflow: root.scrollWidth > root.clientWidth, groupsInside: groups.every((group) => group.left >= box.left - 1 && group.right <= box.right + 1), pairOverlap };
    });
    expect(insertGeometry).toEqual({ overflow: false, groupsInside: true, pairOverlap: false });
    const revisionBefore = await page.getByTestId("revision-status").textContent();
    await insert.getByRole("button", { name: "Signal", exact: true }).click();
    await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true");
    await expect(page.getByTestId("revision-status")).not.toHaveText(revisionBefore!);
    await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");

    await tabs.getByRole("button", { name: "Timeline", exact: true }).click();
    const timeline = page.getByTestId("timeline-editor");
    await expect(timeline.locator("[data-timeline-group='Range']")).toBeVisible();
    await expect(timeline.locator("[data-timeline-group='Insert']")).toBeVisible();
    await expect(timeline.locator("[data-timeline-group='Range Edit']")).toBeVisible();
    await expect(timeline.locator("[data-timeline-group='Bookmark']")).toBeVisible();
    await expect(timeline.locator("[data-timeline-group='Fold / Break']")).toBeVisible();
    await expect(timeline.getByLabel("Timeline range start")).toBeVisible();
    await expect(timeline.getByLabel("Timeline insert count")).toBeVisible();
    await expect(timeline.getByLabel("Timeline destination")).toBeVisible();
    await expect(timeline.getByTestId("timeline-selected-length")).toHaveText("Length 2");
    await expect(timeline.getByLabel("Range edit from")).toHaveText("2");
    await expect(timeline.getByRole("button", { name: "Axis Break", exact: true })).toBeVisible();
    await expect(timeline.getByRole("button", { name: "Previous bookmark", exact: true })).toBeVisible();
    await expect(timeline.getByRole("button", { name: "Next bookmark", exact: true })).toBeVisible();
    await expect(timeline.getByRole("button", { name: "List bookmarks", exact: true })).toBeVisible();
    const timelineGeometry = await timeline.evaluate((root) => {
      const box = root.getBoundingClientRect();
      const groups = [...root.querySelectorAll<HTMLElement>("[data-timeline-group]")].map((element) => element.getBoundingClientRect());
      return { overflow: root.scrollWidth > root.clientWidth, groupsInside: groups.every((group) => group.left >= box.left - 1 && group.right <= box.right + 1) };
    });
    expect(timelineGeometry).toEqual({ overflow: false, groupsInside: true });

    const cycleCountBeforeTimelineInsert = Number(await page.locator(".editor-shell").getAttribute("data-cycle-count"));
    await timeline.getByRole("button", { name: "Insert before", exact: true }).click();
    await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-editor-idle", "true");
    await expect(page.locator(".editor-shell")).toHaveAttribute("data-cycle-count", String(cycleCountBeforeTimelineInsert + 1));
    await expect(page.getByTestId("history-status")).toHaveText("History 2 / Redo 0");

    await tabs.getByRole("button", { name: "Home", exact: true }).click();
    await expect(ribbon).toHaveAttribute("aria-label", "Home Ribbon");
    expect(await ribbon.evaluate((root) => ({
      groups: [...root.querySelectorAll<HTMLElement>("[data-major-group]")].map((group) => ({
        name: group.dataset.majorGroup,
        rect: [group.offsetLeft, group.offsetTop, group.offsetWidth, group.offsetHeight],
      })),
    }))).toEqual(homeBefore);
  });
}
