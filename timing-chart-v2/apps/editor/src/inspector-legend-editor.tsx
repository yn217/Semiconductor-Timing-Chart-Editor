import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import type { CanonicalDocument, Legend } from "@timing-chart-v2/schema";
import { effectiveLegendEntries } from "@timing-chart-v2/schema";
import type { EditorSurfaceCommandController } from "./application/editor-surface-command-controller.js";
import { InspectorFooter, PropertyToggle } from "./inspector-section.js";
import { InspectorHeaderBar, InspectorSelectionHeader } from "./inspector-selection-header.js";
import { clampLegendToVisibleSurface, measureLegendSize, readLegendSurfaceGeometry } from "./legend-geometry.js";
import { reconcileExternalDraftFields } from "./runtime/external-draft-reconciliation.js";

/** Draft/Apply editor for the document-wide Legend singleton. */
export function InspectorLegendEditor({ document, viewport, commands, onCancel, onClose }: {
  readonly document: Readonly<CanonicalDocument>;
  readonly viewport: RefObject<HTMLDivElement | null>;
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
  const latestDraft = { x, y, show, orientation, usedRolesOnly };
  const baseRef = useRef(latestDraft);
  const [externalConflict, setExternalConflict] = useState(false);
  const canonicalDraft = { x: String(legend.position.x), y: String(legend.position.y), show: legend.show, orientation: legend.orientation, usedRolesOnly: legend.usedRolesOnly };
  useEffect(() => {
    const resolution = reconcileExternalDraftFields(baseRef.current, latestDraft, canonicalDraft);
    if (resolution.value.x !== x) setX(resolution.value.x as string);
    if (resolution.value.y !== y) setY(resolution.value.y as string);
    if (resolution.value.show !== show) setShow(resolution.value.show as boolean);
    if (resolution.value.orientation !== orientation) setOrientation(resolution.value.orientation as Legend["orientation"]);
    if (resolution.value.usedRolesOnly !== usedRolesOnly) setUsedRolesOnly(resolution.value.usedRolesOnly as boolean);
    baseRef.current = resolution.base;
    const conflict = resolution.conflicts.length > 0;
    setExternalConflict((current) => current === conflict ? current : conflict);
  }, [legend.position.x, legend.position.y, legend.show, legend.orientation, legend.usedRolesOnly]);

  const positionX = Number(x);
  const positionY = Number(y);
  const valid = x.trim() !== "" && y.trim() !== "" && Number.isFinite(positionX) && Number.isFinite(positionY);
  const changed = valid && (positionX !== legend.position.x || positionY !== legend.position.y || show !== legend.show || orientation !== legend.orientation || usedRolesOnly !== legend.usedRolesOnly);
  const reloadLatest = () => {
    setX(canonicalDraft.x); setY(canonicalDraft.y); setShow(canonicalDraft.show); setOrientation(canonicalDraft.orientation); setUsedRolesOnly(canonicalDraft.usedRolesOnly);
    baseRef.current = canonicalDraft;
    setExternalConflict(false);
  };
  const keepDraft = () => {
    baseRef.current = canonicalDraft;
    setExternalConflict(false);
  };
  const apply = () => {
    if (!changed || externalConflict) return;
    const content = viewport.current?.querySelector<HTMLElement>(".split-signal-content");
    const geometry = content ? readLegendSurfaceGeometry(content) : undefined;
    const overlay = content?.querySelector<HTMLElement>(".editor-legend");
    const size = overlay
      ? { width: overlay.getBoundingClientRect().width, height: overlay.getBoundingClientRect().height }
      : content ? measureLegendSize(content, orientation, effectiveLegendEntries(document)) : { width: 0, height: 0 };
    const position = show && geometry
      ? clampLegendToVisibleSurface({ x: positionX, y: positionY }, size, geometry)
      : { x: positionX, y: positionY };
    if (
      position.x === legend.position.x && position.y === legend.position.y &&
      show === legend.show && orientation === legend.orientation && usedRolesOnly === legend.usedRolesOnly
    ) {
      setX(String(position.x));
      setY(String(position.y));
      baseRef.current = { x: String(position.x), y: String(position.y), show, orientation, usedRolesOnly };
      setExternalConflict(false);
      return;
    }
    const next: Legend = { ...legend, show, orientation, usedRolesOnly, position };
    const result = commands.updateLegend(next);
    if (result.ok) {
      const applied = { x: String(position.x), y: String(position.y), show, orientation, usedRolesOnly };
      setX(applied.x);
      setY(applied.y);
      baseRef.current = applied;
      setExternalConflict(false);
    }
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
        {externalConflict && <div role="alert" data-testid="legend-draft-conflict"><span>Legend changed elsewhere. Reload the latest values or keep your draft before applying.</span><div><button type="button" onClick={reloadLatest}>Reload latest</button><button type="button" onClick={keepDraft}>Keep my draft</button></div></div>}
        {!valid && <span role="alert" className="editor-problem">Legend position must be finite numbers.</span>}
        <small className="inspector-note">Position and presentation are saved through the canonical Legend command.</small>
      </section>
    </div>
    <InspectorFooter onCancel={onCancel} onApply={apply} applyDisabled={!changed || externalConflict} applyTestId="apply-legend-properties" />
  </aside>;
}
