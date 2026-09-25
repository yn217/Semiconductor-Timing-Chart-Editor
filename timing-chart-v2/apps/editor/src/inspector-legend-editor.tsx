import { useEffect, useState } from "react";
import type { CanonicalDocument, Legend } from "@timing-chart-v2/schema";
import type { EditorSurfaceCommandController } from "./application/editor-surface-command-controller.js";
import { InspectorFooter, PropertyToggle } from "./inspector-section.js";
import { InspectorHeaderBar, InspectorSelectionHeader } from "./inspector-selection-header.js";

/** Draft/Apply editor for the document-wide Legend singleton. */
export function InspectorLegendEditor({ document, commands, onCancel, onClose }: {
  readonly document: Readonly<CanonicalDocument>;
  readonly commands: Pick<EditorSurfaceCommandController, "updateLegend">;
  readonly onCancel: () => void;
  readonly onClose: () => void;
}) {
  const legend = document.legend;
  const [x, setX] = useState(String(legend.position.x));
  const [y, setY] = useState(String(legend.position.y));
  const [show, setShow] = useState(legend.show);
  const [orientation, setOrientation] = useState(legend.orientation);
  const [usedRolesOnly, setUsedRolesOnly] = useState(legend.usedRolesOnly);
  useEffect(() => {
    setX(String(legend.position.x));
    setY(String(legend.position.y));
    setShow(legend.show);
    setOrientation(legend.orientation);
    setUsedRolesOnly(legend.usedRolesOnly);
  }, [legend.position.x, legend.position.y, legend.show, legend.orientation, legend.usedRolesOnly]);

  const positionX = Number(x);
  const positionY = Number(y);
  const valid = x.trim() !== "" && y.trim() !== "" && Number.isFinite(positionX) && Number.isFinite(positionY);
  const changed = valid && (positionX !== legend.position.x || positionY !== legend.position.y || show !== legend.show || orientation !== legend.orientation || usedRolesOnly !== legend.usedRolesOnly);
  const apply = () => {
    if (!changed) return;
    const next: Legend = { ...legend, show, orientation, usedRolesOnly, position: { x: positionX, y: positionY } };
    commands.updateLegend(next);
  };

  return <aside className="inspector" data-testid="inspector" data-inspector-entity="legend" onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); onCancel(); } }}>
    <InspectorHeaderBar onClose={onClose} />
    <InspectorSelectionHeader kind="Legend" title="Legend" detail="Document overlay" />
    <div className="inspector-scroll">
      <section className="inspector-section is-open" data-section-id="legend-properties">
        <h3 className="inspector-section-heading">Legend</h3>
        <PropertyToggle label="Show" ariaLabel="Legend show" checked={show} onChange={setShow} />
        <PropertyToggle label="Used roles only" ariaLabel="Legend used roles only" checked={usedRolesOnly} onChange={setUsedRolesOnly} />
        <label>Orientation<select aria-label="Legend orientation" value={orientation} onChange={(event) => setOrientation(event.target.value as Legend["orientation"])}><option value="horizontal">Horizontal</option><option value="vertical">Vertical</option></select></label>
        <div className="inspector-property-pair">
          <label>X<input aria-label="Legend X" type="number" value={x} onChange={(event) => setX(event.target.value)} /></label>
          <label>Y<input aria-label="Legend Y" type="number" value={y} onChange={(event) => setY(event.target.value)} /></label>
        </div>
        {!valid && <span role="alert" className="editor-problem">Legend position must be finite numbers.</span>}
        <small className="inspector-note">Position and presentation are saved through the canonical Legend command.</small>
      </section>
    </div>
    <InspectorFooter onCancel={onCancel} onApply={apply} applyDisabled={!changed} applyTestId="apply-legend-properties" />
  </aside>;
}
