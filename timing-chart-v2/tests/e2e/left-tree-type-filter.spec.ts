import { expect, test } from "@playwright/test";

for (const width of [1672, 1000]) {
  test(`combines the Left Tree type and text filters without mutation at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 941 });
    await page.goto("/?visual-reference");
    const host = page.getByTestId("cycle-surface");
    await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
    await expect(host).toHaveAttribute("data-canonical-revision", /^\d+$/);
    const filter = page.getByTestId("signal-tree-type-filter");
    const search = page.getByTestId("signal-tree-search-top");
    await expect(filter).toBeVisible();
    await expect(filter.locator("option")).toHaveText(["All", "Input", "Output", "Wire", "Comment"]);

    const before = {
      revision: await host.getAttribute("data-canonical-revision"),
      history: await page.getByTestId("history-status").textContent(),
      dirty: await page.getByTestId("dirty-status").textContent(),
      counters: await host.locator("[data-role='timing-chart-surface']").getAttribute("data-render-counters"),
    };
    const visibleRows = () => host.locator("[data-role='left-row']:not([hidden])");
    const visibleGroups = () => host.locator("[data-role='left-group-header']:not([hidden])");
    const assertVisibleCategory = async (category: "input" | "output" | "wire" | "comment") => {
      const rows = await visibleRows().evaluateAll((elements, expected) => elements.map((element) => ({
        kind: element.getAttribute("data-kind"),
        role: element.getAttribute("data-signal-role"),
      })).filter((row) => row.kind === "timing"), category);
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((row) => category === "comment" ? row.kind === "comment" : category === "wire" ? row.role === "internal" : row.role === category)).toBe(true);
    };

    // #184 P1-2: the Left Tree filter's contract is Left Tree presentation
    // only -- Frozen/Timing/WaveDrom surfaces must stay fully visible (and
    // unfiltered) even while filtered-out signals disappear from the tree.
    const frozenRowCount = await host.locator("[data-role='frozen-row'][data-row-id]").count();
    const waveOwnerCount = await host.locator("[data-role='wave-owner'][data-signal-id]").count();

    for (const [value, category] of [["input", "input"], ["output", "output"], ["wire", "wire"], ["comment", "comment"]] as const) {
      await filter.selectOption(value);
      await expect(host).toHaveAttribute("data-tree-type-filter", value);
      if (category === "comment") {
        expect(await visibleRows().evaluateAll((elements) => elements.filter((element) => element.dataset.kind === "comment").length)).toBeGreaterThan(0);
      } else {
        await assertVisibleCategory(category);
      }
      const visibleGroupIds = await visibleGroups().evaluateAll((elements) => elements.map((element) => element.dataset.groupId));
      for (const groupId of visibleGroupIds) {
        expect(await visibleRows().evaluateAll((elements, id) => elements.some((element) => element.dataset.groupId === id), groupId)).toBe(true);
      }
      expect(await visibleRows().count()).toBeLessThan(frozenRowCount);
      expect(await host.locator("[data-role='frozen-row'][data-row-id]:not([hidden])").count()).toBe(frozenRowCount);
      expect(await host.locator("[data-role='wave-owner'][data-signal-id]:not([hidden])").count()).toBe(waveOwnerCount);
    }
    await filter.selectOption("all");

    await filter.selectOption("input");
    const inputName = await host.locator("[data-role='left-row'][data-signal-role='input']:not([hidden])").first().getAttribute("data-name");
    const query = inputName!.slice(0, Math.max(1, Math.min(3, inputName!.length))).toLocaleLowerCase();
    await search.fill(query);
    await expect(host).toHaveAttribute("data-tree-filter", query);
    await assertVisibleCategory("input");
    expect(await visibleRows().evaluateAll((elements, text) => elements.filter((element) => element.dataset.kind === "timing").every((element) => (element.dataset.name ?? "").toLocaleLowerCase().includes(text)), query)).toBe(true);

    const inputCount = await visibleRows().count();
    await page.getByRole("button", { name: "Clear signal tree filter" }).click();
    await expect(search).toHaveValue("");
    await expect(filter).toHaveValue("input");
    expect(await visibleRows().count()).toBeGreaterThanOrEqual(inputCount);
    await filter.selectOption("all");
    await expect(search).toHaveValue("");
    expect(await visibleRows().count()).toBeGreaterThan(inputCount);

    expect({
      revision: await host.getAttribute("data-canonical-revision"),
      history: await page.getByTestId("history-status").textContent(),
      dirty: await page.getByTestId("dirty-status").textContent(),
      counters: await host.locator("[data-role='timing-chart-surface']").getAttribute("data-render-counters"),
    }).toEqual(before);
  });
}
