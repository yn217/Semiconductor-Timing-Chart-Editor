import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buildMiniMapOverview } from "@timing-chart-v2/projection";
import { generatePerformanceDocument } from "@timing-chart-v2/testing";
import { MINIMAP_MAX_DOM_ROWS, MiniMapOverviewRows } from "../../apps/editor/src/minimap-overview-rows.js";

function renderRows(signalCount: number) {
  const overview = buildMiniMapOverview(generatePerformanceDocument({ signalCount, cycleCount: 32, profile: "standard" }));
  const markup = renderToStaticMarkup(createElement(MiniMapOverviewRows, { overview }));
  return { overview, rowIds: [...markup.matchAll(/data-row-id="([^"]+)"/g)].map((match) => match[1]), segments: markup.match(/class="minimap-segment /g)?.length ?? 0 };
}

describe("MiniMapOverviewRows DOM bound (#175)", () => {
  it("mounts every row of a small document in canonical order", () => {
    const { overview, rowIds } = renderRows(40);
    expect(rowIds).toEqual(overview.rows.map((row) => row.rowId));
  });

  it("keeps the mounted row count independent of Signal count", () => {
    const small = renderRows(1_000);
    const large = renderRows(10_000);
    expect(large.overview.rows).toHaveLength(10_000);
    expect(large.rowIds).toHaveLength(MINIMAP_MAX_DOM_ROWS);
    expect(large.rowIds).toEqual(large.overview.rows.slice(0, MINIMAP_MAX_DOM_ROWS).map((row) => row.rowId));
    expect(large.segments).toBe(small.segments);
  });
});
