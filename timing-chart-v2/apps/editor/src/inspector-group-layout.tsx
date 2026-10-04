import type { SignalGroup } from "@timing-chart-v2/schema";
import { InspectorSection, PropertyToggle } from "./inspector-section.js";

export function InspectorGroupLayout({ group, spacingBefore, spacingAfter, headerHeight, collapsed, open, onToggleSection, onSpacingBeforeChange, onSpacingAfterChange, onHeaderHeightChange, onPreviewHeaderHeight, onToggleCollapsed }: {
  readonly group: SignalGroup;
  readonly spacingBefore: number;
  readonly spacingAfter: number;
  readonly headerHeight: string;
  readonly collapsed: boolean;
  readonly open: boolean;
  readonly onToggleSection: () => void;
  readonly onSpacingBeforeChange: (value: number) => void;
  readonly onSpacingAfterChange: (value: number) => void;
  readonly onHeaderHeightChange: (value: string) => void;
  readonly onPreviewHeaderHeight: (value: number) => void;
  readonly onToggleCollapsed: () => void;
}) {
  return <InspectorSection sectionId="layout" title="Layout" open={open} onToggle={onToggleSection}>
    <div className="inspector-property-pair"><label>Spacing Before<input aria-label="Group spacing before" type="number" min="0" value={spacingBefore} onChange={(event) => onSpacingBeforeChange(Number(event.target.value))} /></label><label>Spacing After<input aria-label="Group spacing after" type="number" min="0" value={spacingAfter} onChange={(event) => onSpacingAfterChange(Number(event.target.value))} /></label></div>
    <label>Header height<input aria-label="Group header height" type="number" min="0" step="1" value={headerHeight} onChange={(event) => { const value = event.target.value; onHeaderHeightChange(value); const parsed = Number(value); if (value.trim() !== "" && Number.isFinite(parsed) && parsed >= 0) onPreviewHeaderHeight(parsed); }} /></label>
    <div className="property-row"><span>Rows</span><span>{group.rows.length}</span></div>
    <PropertyToggle label="Collapsed" ariaLabel="Inspector group collapsed" checked={collapsed} onChange={onToggleCollapsed} />
    <small className="inspector-note">Collapse is a view-only layout preference; it does not change Canonical, History, or Dirty state.</small>
  </InspectorSection>;
}
