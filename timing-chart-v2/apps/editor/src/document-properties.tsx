import { useRef, useState } from "react";
import type { RefObject } from "react";
import { effectiveLegendEntries, type CanonicalDocument, type EnumDefinition, type LegendEntry } from "@timing-chart-v2/schema";
import type { EditorSurfaceCommandController } from "./application/editor-surface-command-controller.js";
import { useDialogFocusLoop } from "./dialog-focus-loop.js";
import { EditorIconButton } from "./editor-icon.js";
import { clampLegendToVisibleSurface, measureLegendSize, readLegendSurfaceGeometry } from "./legend-geometry.js";
import { ModalBackdrop } from "./modal-backdrop.js";
import { randomId } from "./random-id.js";

/** Editor seed for a legend without stored items: exactly the roles the effective legend shows (so Used Roles Only off keeps "internal"), in signal-appearance order. */
function seededLegendEntries(document: CanonicalDocument): LegendEntry[] {
  const effectiveRoles = [...new Set(effectiveLegendEntries(document).map((entry) => entry.role))];
  const signalRoles = [...new Set(document.signals.filter((signal) => signal.type !== "commentRow").map((signal) => signal.role))];
  const ordered = [...signalRoles, ...effectiveRoles].filter((role, index, all) => all.indexOf(role) === index && effectiveRoles.includes(role));
  return ordered.map((role, order) => ({ id: `legend_${role}`, role, label: role, visible: true, order }));
}

export function DocumentProperties({ document, viewport, commands, restoreFocusRef, onClose }: { readonly document: CanonicalDocument; readonly viewport: RefObject<HTMLDivElement | null>; readonly commands: Pick<EditorSurfaceCommandController, "updateDocumentProperties">; readonly restoreFocusRef?: RefObject<HTMLElement | null>; readonly onClose: () => void }) {
  const dialogRef = useRef<HTMLFormElement>(null);
  useDialogFocusLoop(dialogRef, restoreFocusRef);
  const [title, setTitle] = useState(document.document.title);
  const [subtitle, setSubtitle] = useState(document.document.header.subtitle);
  const [description, setDescription] = useState(document.document.header.description);
  const [notes, setNotes] = useState(document.document.header.notes);
  const [preconditions, setPreconditions] = useState(document.document.header.preconditions.join("\n"));
  const [constraints, setConstraints] = useState(document.document.header.constraints.join("\n"));
  const [exceptions, setExceptions] = useState(document.document.header.exceptions.join("\n"));
  const [figureNumber, setFigureNumber] = useState(document.document.footer.figureNumber);
  const [revision, setRevision] = useState(document.document.footer.revision);
  const [footerText, setFooterText] = useState(document.document.footer.text);
  const [timebaseFrequency, setTimebaseFrequency] = useState(document.timeline.physicalTimebase?.referenceFrequencyHz.toString() ?? "");
  const [timebaseUnit, setTimebaseUnit] = useState(document.timeline.physicalTimebase?.unit ?? "ns");
  const [legendShow, setLegendShow] = useState(document.legend.show);
  const [legendOrientation, setLegendOrientation] = useState(document.legend.orientation);
  const [legendUsedRolesOnly, setLegendUsedRolesOnly] = useState(document.legend.usedRolesOnly);
  // Position drafts stay text so an empty or 1e400 entry is rejected on Apply instead of silently becoming 0 or Infinity.
  const [legendPositionX, setLegendPositionX] = useState(String(document.legend.position.x));
  const [legendPositionY, setLegendPositionY] = useState(String(document.legend.position.y));
  // Without stored items the editor shows the effective legend; that seed is compared on Apply so an untouched list is never written back.
  const [initialLegendItemsText] = useState(() => JSON.stringify(document.legend.items ?? seededLegendEntries(document), null, 2));
  const [legendItemsText, setLegendItemsText] = useState(initialLegendItemsText);
  const [enumDefinitions, setEnumDefinitions] = useState<readonly EnumDefinition[]>(document.enumDefinitions ?? []);
  const [legendStatus, setLegendStatus] = useState("");
  const [legendAdvancedOpen, setLegendAdvancedOpen] = useState(false);
  const legendEntries = (() => {
    try {
      const parsed: unknown = JSON.parse(legendItemsText);
      if (!Array.isArray(parsed)) return [] as LegendEntry[];
      return parsed.filter((entry): entry is LegendEntry => typeof entry === "object" && entry !== null && typeof (entry as { id?: unknown }).id === "string" && typeof (entry as { role?: unknown }).role === "string" && typeof (entry as { label?: unknown }).label === "string" && typeof (entry as { visible?: unknown }).visible === "boolean" && Number.isInteger((entry as { order?: unknown }).order));
    } catch {
      return [] as LegendEntry[];
    }
  })();
  const updateLegendEntries = (next: readonly LegendEntry[]) => setLegendItemsText(JSON.stringify(next.map((entry, order) => ({ ...entry, order })), null, 2));
  const lines = (value: string) => value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
  return <ModalBackdrop onDismiss={onClose}><form ref={dialogRef} className="document-properties" role="dialog" aria-modal="true" aria-label="Document Properties" onSubmit={(event) => {
    event.preventDefault();
    let parsed: unknown;
    try {
      parsed = JSON.parse(legendItemsText);
      if (!Array.isArray(parsed) || parsed.some((entry) => typeof entry !== "object" || entry === null || typeof (entry as { id?: unknown }).id !== "string" || typeof (entry as { role?: unknown }).role !== "string" || typeof (entry as { label?: unknown }).label !== "string" || typeof (entry as { visible?: unknown }).visible !== "boolean" || !Number.isInteger((entry as { order?: unknown }).order))) throw new Error("Legend entries must be an array of {id,role,label,visible,order} objects.");
    } catch (error) {
      setLegendStatus(error instanceof Error ? error.message : "Invalid legend entries");
      return;
    }
    const header = { subtitle, description, notes, preconditions: lines(preconditions), constraints: lines(constraints), exceptions: lines(exceptions) };
    const footer = { figureNumber, revision, text: footerText };
    const trimmedFrequency = timebaseFrequency.trim();
    const frequency = trimmedFrequency === "" ? undefined : Number(trimmedFrequency);
    if (frequency !== undefined && (!Number.isFinite(frequency) || frequency <= 0)) {
      setLegendStatus("Timebase frequency must be a positive finite number, or blank to disable physical time.");
      return;
    }
    const physicalTimebase = frequency === undefined ? undefined : { referenceFrequencyHz: frequency, unit: timebaseUnit };
    const positionX = Number(legendPositionX);
    const positionY = Number(legendPositionY);
    if (legendPositionX.trim() === "" || legendPositionY.trim() === "" || !Number.isFinite(positionX) || !Number.isFinite(positionY)) {
      setLegendStatus("Legend position X and Y must be finite numbers.");
      return;
    }
    const itemsChanged = legendItemsText !== initialLegendItemsText;
    const baseLegend = itemsChanged ? { ...document.legend, items: parsed as NonNullable<typeof document.legend.items> } : document.legend;
    const draftLegend = { ...baseLegend, show: legendShow, orientation: legendOrientation, usedRolesOnly: legendUsedRolesOnly, position: { x: positionX, y: positionY } };
    const legendChanged = JSON.stringify(draftLegend) !== JSON.stringify(document.legend);
    const content = viewport.current?.querySelector<HTMLElement>(".split-signal-content");
    const geometry = content ? readLegendSurfaceGeometry(content) : undefined;
    const overlay = content?.querySelector<HTMLElement>(".editor-legend");
    const size = overlay
      ? { width: overlay.getBoundingClientRect().width, height: overlay.getBoundingClientRect().height }
      : content ? measureLegendSize(content, legendOrientation, effectiveLegendEntries({ ...document, legend: draftLegend })) : { width: 0, height: 0 };
    // Same rule as the inspector: only a free position is a pixel point. canvas-corner stores an offset from the corner, so clamping it corrupts the value.
    const clampToSurface = legendChanged && legendShow && geometry && (draftLegend.positionMode ?? "free") === "free";
    const nextLegend = clampToSurface
      ? { ...draftLegend, position: clampLegendToVisibleSurface(draftLegend.position, size, geometry) }
      : draftLegend;
    setLegendPositionX(String(nextLegend.position.x));
    setLegendPositionY(String(nextLegend.position.y));
    const result = commands.updateDocumentProperties(document, { title, header, footer, legend: nextLegend, enumDefinitions, physicalTimebase });
    if (result === undefined) { setLegendStatus("No document properties changed"); return; }
    setLegendStatus(result.ok ? "Properties applied" : result.problems[0]?.message ?? "Properties could not be applied");
  }}>
    <header><h2>Document Properties</h2><EditorIconButton label="Close properties" icon="close" onClick={onClose} /></header>
    <section><h3>Document</h3><label>Title<input aria-label="Document title" value={title} onChange={(event) => setTitle(event.target.value)} /></label><dl><dt>ID</dt><dd>{document.document.id}</dd><dt>Signals</dt><dd>{document.signals.length}</dd><dt>Cycles</dt><dd>{document.timeline.cycleCount}</dd></dl></section>
    <section aria-label="Physical timebase"><h3>Physical Time</h3><p className="inspector-note">Maps source cycles to physical time for Cursor and Measurement ΔTime. Blank frequency keeps readouts in cycles.</p><label>Base frequency (Hz)<input aria-label="Timebase frequency (Hz)" type="number" min="0" step="any" value={timebaseFrequency} onChange={(event) => setTimebaseFrequency(event.target.value)} placeholder="Not set" /></label><label>Display unit<select aria-label="Timebase display unit" value={timebaseUnit} onChange={(event) => setTimebaseUnit(event.target.value as typeof timebaseUnit)}>{["s", "ms", "us", "ns", "ps", "fs"].map((unit) => <option key={unit} value={unit}>{unit}</option>)}</select></label></section>
    <section><h3>Header</h3><label>Subtitle<input aria-label="Document subtitle" value={subtitle} onChange={(event) => setSubtitle(event.target.value)} /></label><label>Description<textarea aria-label="Document description" value={description} onChange={(event) => setDescription(event.target.value)} rows={2} /></label><label>Notes<textarea aria-label="Document notes" value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} /></label><label>Preconditions<textarea aria-label="Document preconditions" value={preconditions} onChange={(event) => setPreconditions(event.target.value)} rows={2} placeholder="One item per line" /></label><label>Constraints<textarea aria-label="Document constraints" value={constraints} onChange={(event) => setConstraints(event.target.value)} rows={2} placeholder="One item per line" /></label><label>Exceptions<textarea aria-label="Document exceptions" value={exceptions} onChange={(event) => setExceptions(event.target.value)} rows={2} placeholder="One item per line" /></label></section>
    <section><h3>Footer</h3><label>Figure Number<input aria-label="Footer figure number" value={figureNumber} onChange={(event) => setFigureNumber(event.target.value)} /></label><label>Revision<input aria-label="Footer revision" value={revision} onChange={(event) => setRevision(event.target.value)} /></label><label>Text<textarea aria-label="Footer text" value={footerText} onChange={(event) => setFooterText(event.target.value)} rows={2} /></label></section>
    <section aria-label="State enum definitions" data-testid="state-enum-definitions"><h3>State Enums</h3><p className="inspector-note">Enum values remain the canonical signal values; labels are presentation names.</p>{enumDefinitions.map((definition, enumIndex) => <fieldset key={definition.id} data-enum-id={definition.id}><legend>{definition.name || "State enum"}</legend><code>{definition.id}</code><label>Name<input aria-label={`Enum name ${definition.id}`} value={definition.name} onChange={(event) => setEnumDefinitions((current) => current.map((item) => item.id === definition.id ? { ...item, name: event.target.value } : item))} /></label>{definition.entries.map((entry, entryIndex) => <div key={`${definition.id}:${entryIndex}`} className="legend-entry-row"><label>Value<input aria-label={`Enum value ${definition.id} ${entryIndex}`} value={String(entry.value)} onChange={(event) => setEnumDefinitions((current) => current.map((item) => item.id !== definition.id ? item : { ...item, entries: item.entries.map((candidate, index) => index !== entryIndex ? candidate : { ...candidate, value: typeof entry.value === "number" && /^-?\d+$/.test(event.target.value) ? Number(event.target.value) : event.target.value }) }))} /></label><label>Label<input aria-label={`Enum label ${definition.id} ${entryIndex}`} value={entry.label} onChange={(event) => setEnumDefinitions((current) => current.map((item) => item.id !== definition.id ? item : { ...item, entries: item.entries.map((candidate, index) => index === entryIndex ? { ...candidate, label: event.target.value } : candidate) }))} /></label><button type="button" aria-label={`Remove enum entry ${definition.id} ${entryIndex}`} onClick={() => setEnumDefinitions((current) => current.map((item) => item.id !== definition.id ? item : { ...item, entries: item.entries.filter((_, index) => index !== entryIndex) }))}>Remove entry</button></div>)}<button type="button" onClick={() => setEnumDefinitions((current) => current.map((item) => item.id === definition.id ? { ...item, entries: [...item.entries, { value: `STATE_${item.entries.length}`, label: `State ${item.entries.length + 1}` }] } : item))}>Add enum entry</button><button type="button" className="danger" onClick={() => setEnumDefinitions((current) => current.filter((item) => item.id !== definition.id))}>Delete enum</button></fieldset>)}<button type="button" onClick={() => setEnumDefinitions((current) => [...current, { id: `enum_${randomId()}`, name: `State Enum ${current.length + 1}`, entries: [] }])}>Add State Enum</button><p className="inspector-note">Enum changes are committed with Document Properties Apply. A definition in use cannot be deleted until it is unassigned.</p></section>
    <section><h3>Legend</h3><label className="checkline">Show Legend<input aria-label="Legend show" type="checkbox" checked={legendShow} onChange={(event) => setLegendShow(event.target.checked)} /></label><label>Orientation<select aria-label="Legend orientation" value={legendOrientation} onChange={(event) => setLegendOrientation(event.target.value as typeof legendOrientation)}><option value="horizontal">Horizontal</option><option value="vertical">Vertical</option></select></label><label className="checkline">Used Roles Only<input aria-label="Legend used roles only" type="checkbox" checked={legendUsedRolesOnly} onChange={(event) => setLegendUsedRolesOnly(event.target.checked)} /></label><div className="legend-position-editor"><label>X<input aria-label="Legend position X" type="number" step="1" value={legendPositionX} onChange={(event) => setLegendPositionX(event.target.value)} /></label><label>Y<input aria-label="Legend position Y" type="number" step="1" value={legendPositionY} onChange={(event) => setLegendPositionY(event.target.value)} /></label></div><div className="legend-entry-editor" data-testid="legend-entry-editor"><strong>Entries</strong>{legendEntries.map((entry, index) => <div className="legend-entry-row" key={entry.id} data-legend-entry-id={entry.id}><code>{entry.id}</code><input aria-label={`Legend label ${entry.id}`} value={entry.label} onChange={(event) => updateLegendEntries(legendEntries.map((item) => item.id === entry.id ? { ...item, label: event.target.value } : item))} /><label className="checkline"><span>Visible</span><input aria-label={`Legend visibility ${entry.id}`} type="checkbox" checked={entry.visible} onChange={(event) => updateLegendEntries(legendEntries.map((item) => item.id === entry.id ? { ...item, visible: event.target.checked } : item))} /></label><EditorIconButton label={`Move ${entry.id} up`} icon="up" disabled={index === 0} onClick={() => { const next = [...legendEntries]; [next[index - 1], next[index]] = [next[index]!, next[index - 1]!]; updateLegendEntries(next); }} /><EditorIconButton label={`Move ${entry.id} down`} icon="down" disabled={index === legendEntries.length - 1} onClick={() => { const next = [...legendEntries]; [next[index], next[index + 1]] = [next[index + 1]!, next[index]!]; updateLegendEntries(next); }} /></div>)}</div><button type="button" aria-expanded={legendAdvancedOpen} onClick={() => setLegendAdvancedOpen((open) => !open)}>{legendAdvancedOpen ? "Hide Advanced Legend JSON" : "Show Advanced Legend JSON"}</button>{legendAdvancedOpen && <label>Entries (stable ID / label / visibility / order)<textarea aria-label="Legend entries JSON" rows={5} value={legendItemsText} onChange={(event) => setLegendItemsText(event.target.value)} spellCheck={false} /></label>}<p className="inspector-note">Legend changes are committed with the Document Properties Apply button.</p>{legendStatus && <output role="status" data-testid="legend-status">{legendStatus}</output>}</section>
    <footer><button type="button" onClick={onClose}>Cancel</button><button type="submit" data-testid="apply-document-properties">Apply Document Properties</button></footer>
  </form></ModalBackdrop>;
}
