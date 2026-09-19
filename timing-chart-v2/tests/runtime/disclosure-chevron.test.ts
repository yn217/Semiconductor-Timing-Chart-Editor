import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EditorIcon } from "../../apps/editor/src/editor-icon.js";
import { InspectorSection } from "../../apps/editor/src/inspector-section.js";
import { DISCLOSURE_CHEVRON_SIZE, DISCLOSURE_CHEVRON_SPEC } from "@timing-chart-v2/renderer";

describe("shared disclosure chevron", () => {
  it("keeps the Cycle Tree chevron geometry as the common 15px / 2px spec", () => {
    expect(DISCLOSURE_CHEVRON_SIZE).toBe(15);
    expect(DISCLOSURE_CHEVRON_SPEC.down).toEqual({ path: "M6 9l6 6 6-6", strokeWidth: 2 });
    expect(DISCLOSURE_CHEVRON_SPEC.right).toEqual({ path: "M9 6l6 6-6 6", strokeWidth: 2 });
  });

  it("renders both Inspector states from that exact geometry without changing disclosure semantics", () => {
    const expanded = renderToStaticMarkup(createElement(InspectorSection, {
      sectionId: "general",
      title: "General",
      open: true,
      onToggle: () => undefined,
      children: createElement("div", null, "contents"),
    }));
    const collapsed = renderToStaticMarkup(createElement(InspectorSection, {
      sectionId: "timing",
      title: "Timing",
      open: false,
      onToggle: () => undefined,
      children: createElement("div", null, "contents"),
    }));

    expect(expanded).toContain('class="inspector-section-toggle shared-disclosure-toggle shared-disclosure-toggle--section" aria-expanded="true" aria-controls="inspector-section-general"');
    expect(expanded).toContain('class="shared-disclosure-chevron" aria-hidden="true"');
    expect(expanded).toContain(`width="${DISCLOSURE_CHEVRON_SIZE}" height="${DISCLOSURE_CHEVRON_SIZE}"`);
    expect(expanded).toContain(`d="${DISCLOSURE_CHEVRON_SPEC.down.path}"`);
    expect(expanded).toContain('stroke-width="2"');
    expect(collapsed).toContain('aria-expanded="false" aria-controls="inspector-section-timing"');
    expect(collapsed).toContain(`d="${DISCLOSURE_CHEVRON_SPEC.right.path}"`);
  });

  it("leaves action-arrow icons distinct from the disclosure chevron", () => {
    const arrow = renderToStaticMarkup(createElement(EditorIcon, { name: "down" }));
    const chevron = renderToStaticMarkup(createElement(EditorIcon, { name: "chevron-down" }));
    expect(arrow).toContain("M12 5v14M6 13l6 6 6-6");
    expect(arrow).not.toContain("shared-disclosure-chevron");
    expect(chevron).toContain(`d="${DISCLOSURE_CHEVRON_SPEC.down.path}"`);
  });
});
