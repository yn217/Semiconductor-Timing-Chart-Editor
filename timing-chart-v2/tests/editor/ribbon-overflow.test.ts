import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RibbonSchemaOverflow } from "../../apps/editor/src/ribbon-group.js";

describe("Ribbon overflow presentation", () => {
  it("preserves toggle semantics, checked state, and command identity", () => {
    const markup = renderToStaticMarkup(
      createElement(RibbonSchemaOverflow, {
        items: [
          { kind: "toggle", id: "grid", label: "Grid", checked: true, onChange: () => undefined, presentation: { preferredSize: "large", overflow: "preferred" } },
          { kind: "toggle", id: "ruler", label: "Ruler", checked: false, onChange: () => undefined, presentation: { preferredSize: "large", overflow: "preferred" } },
        ],
      }),
    );

    expect(markup).toContain('role="menuitemcheckbox" data-ribbon-command-id="grid" aria-checked="true"');
    expect(markup).toContain('role="menuitemcheckbox" data-ribbon-command-id="ruler" aria-checked="false"');
    expect(markup).toContain("<span aria-hidden=\"true\"> ✓</span>");
    expect(markup).toContain("<span aria-hidden=\"true\"></span>");
  });
});
