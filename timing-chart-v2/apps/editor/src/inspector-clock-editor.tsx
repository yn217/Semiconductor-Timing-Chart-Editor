import { useEffect, useRef, useState } from "react";
import type { FormEvent, RefObject } from "react";
import type { ChangeSet } from "@timing-chart-v2/commands";
import { clockFrequency, type CanonicalDocument, type ClockGenerator, type ClockSignal, type EdgeCounterSettings, type Signal, type SignalRole } from "@timing-chart-v2/schema";
import type { EditorSurfaceCommandController } from "./application/editor-surface-command-controller.js";
import { InlineNameInput } from "./inline-name-input.js";
import { InspectorSection } from "./inspector-section.js";
import { MiniMap } from "./minimap.js";
import { useInspectorAccordion } from "./inspector-accordion.js";
import { styleNumber, styleString } from "./inspector-style.js";
import { InspectorHeaderBar, InspectorSelectionHeader } from "./inspector-selection-header.js";
import { DraftStatus } from "./draft-status.js";

function InspectorClockEditor({ signal, document, changeSet, viewport, commands, onReveal, onCancel, onClose }: { readonly signal: ClockSignal; readonly document: Readonly<CanonicalDocument>; readonly changeSet: ChangeSet; readonly viewport: RefObject<HTMLDivElement | null>; readonly commands: Pick<EditorSurfaceCommandController, "updateSignalProperties" | "renameSignal" | "convertClock" | "setReferenceClock" | "setReferenceEdge" | "updateClockGenerator" | "updateEdgeCounter">; readonly onReveal: () => void; readonly onCancel: () => void; readonly onClose: () => void }) {
  const [name, setName] = useState(signal.name);
  const [problem, setProblem] = useState("");
  const [role, setRole] = useState<SignalRole>(signal.role);
  const [visible, setVisible] = useState(signal.display.visible !== false);
  const [spacingBefore, setSpacingBefore] = useState(signal.spacingBefore ?? 0);
  const [spacingAfter, setSpacingAfter] = useState(signal.spacingAfter ?? 0);
  const [align, setAlign] = useState<NonNullable<Signal["display"]["align"]>>(signal.display.align ?? "left");
  const [overflow, setOverflow] = useState<NonNullable<Signal["display"]["overflow"]>>(signal.display.overflow ?? "ellipsis");
  const styleObject = signal.display.style ?? {};
  const [textColor, setTextColor] = useState(styleString(styleObject, "color", "#152033"));
  const [rowBackground, setRowBackground] = useState(styleString(styleObject, "background", "#ffffff"));
  const [fontFamily, setFontFamily] = useState(styleString(styleObject, "fontFamily", "Inter"));
  const [fontSize, setFontSize] = useState(styleNumber(styleObject, "fontSize", 12));
  const [bold, setBold] = useState(styleObject.fontWeight === "bold");
  const [italic, setItalic] = useState(styleObject.fontStyle === "italic");
  const [underline, setUnderline] = useState(styleString(styleObject, "textDecoration", "").includes("underline"));
  const [strikethrough, setStrikethrough] = useState(styleString(styleObject, "textDecoration", "").includes("line-through"));
  const [waveformColor, setWaveformColor] = useState(styleString(styleObject, "waveformColor", "#111111"));
  const [waveformBackground, setWaveformBackground] = useState(styleString(styleObject, "waveformBackground", "#ffffff"));
  const [generator, setGenerator] = useState<ClockGenerator>(signal.generator);
  const [edgeCounter, setEdgeCounter] = useState<EdgeCounterSettings>(signal.edgeCounter);
  const [conversionTarget, setConversionTarget] = useState<"binary" | "bus" | "state">("binary");
  const [conversionConfirm, setConversionConfirm] = useState(false);
  const [referenceEdge, setReferenceEdge] = useState<"rising" | "falling">(document.timeline.edge);
  const convertsReferenceClock = document.timeline.referenceClock === signal.id;
  // #776 (Part B): InspectorClockEditor previously had NO same-Signal Canonical synchronization at all -- Undo/Redo or another surface
  // editing the same Clock left every local field stale (and a stale `generator`/`edgeCounter` could then overwrite the Undo result on
  // the next Apply). Same policy as Part A / #775: a field resyncs only when its canonical source actually changed AND the local draft
  // is still clean; a dirty field is preserved.
  const clockBaseRef = useRef<{ id: ClockSignal["id"]; name: string; role: SignalRole; visible: boolean; spacingBefore: number; spacingAfter: number; align: NonNullable<Signal["display"]["align"]>; overflow: NonNullable<Signal["display"]["overflow"]>; textColor: string; rowBackground: string; fontFamily: string; fontSize: number; bold: boolean; italic: boolean; underline: boolean; strikethrough: boolean; waveformColor: string; waveformBackground: string; generator: ClockGenerator; edgeCounter: EdgeCounterSettings; referenceEdge: "rising" | "falling" } | undefined>(undefined);
  useEffect(() => {
    const nextStyle = signal.display.style ?? {};
    const next = {
      id: signal.id, name: signal.name, role: signal.role, visible: signal.display.visible !== false, spacingBefore: signal.spacingBefore ?? 0, spacingAfter: signal.spacingAfter ?? 0,
      align: signal.display.align ?? "left" as NonNullable<Signal["display"]["align"]>, overflow: signal.display.overflow ?? "ellipsis" as NonNullable<Signal["display"]["overflow"]>,
      textColor: styleString(nextStyle, "color", "#152033"), rowBackground: styleString(nextStyle, "background", "#ffffff"), fontFamily: styleString(nextStyle, "fontFamily", "Inter"),
      fontSize: styleNumber(nextStyle, "fontSize", 12), bold: nextStyle.fontWeight === "bold", italic: nextStyle.fontStyle === "italic",
      underline: styleString(nextStyle, "textDecoration", "").includes("underline"), strikethrough: styleString(nextStyle, "textDecoration", "").includes("line-through"),
      waveformColor: styleString(nextStyle, "waveformColor", "#111111"), waveformBackground: styleString(nextStyle, "waveformBackground", "#ffffff"),
      generator: signal.generator, edgeCounter: signal.edgeCounter, referenceEdge: document.timeline.edge,
    };
    const prev = clockBaseRef.current;
    const sameEntity = prev !== undefined && prev.id === signal.id;
    const jsonEq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
    const merge = <K extends keyof typeof next>(key: K, current: (typeof next)[K], setLocal: (value: (typeof next)[K]) => void, eq: (a: (typeof next)[K], b: (typeof next)[K]) => boolean = (a, b) => a === b) => {
      if (!sameEntity) { setLocal(next[key]); return; }
      if (!eq(prev![key], next[key]) && eq(current, prev![key])) setLocal(next[key]);
    };
    merge("name", name, setName);
    merge("role", role, setRole);
    merge("visible", visible, setVisible);
    merge("spacingBefore", spacingBefore, setSpacingBefore);
    merge("spacingAfter", spacingAfter, setSpacingAfter);
    merge("align", align, setAlign);
    merge("overflow", overflow, setOverflow);
    merge("textColor", textColor, setTextColor);
    merge("rowBackground", rowBackground, setRowBackground);
    merge("fontFamily", fontFamily, setFontFamily);
    merge("fontSize", fontSize, setFontSize);
    merge("bold", bold, setBold);
    merge("italic", italic, setItalic);
    merge("underline", underline, setUnderline);
    merge("strikethrough", strikethrough, setStrikethrough);
    merge("waveformColor", waveformColor, setWaveformColor);
    merge("waveformBackground", waveformBackground, setWaveformBackground);
    merge("generator", generator, setGenerator, jsonEq);
    merge("edgeCounter", edgeCounter, setEdgeCounter, jsonEq);
    merge("referenceEdge", referenceEdge, setReferenceEdge);
    clockBaseRef.current = next;
    if (!sameEntity) { setProblem(""); setConversionConfirm(false); }
  }, [signal, document.timeline.edge]);
  const { state: sections, toggle } = useInspectorAccordion("clock-signal", { "signal-properties": true, hierarchy: true, "label-style": false, waveform: true, generator: true, "edge-counter": true });
  const number = (key: "start" | "period" | "duty" | "phase", value: string) => setGenerator({ ...generator, [key]: Number(value) });
  const relativeFrequency = clockFrequency({ ...signal, generator } as ClockSignal);
  const physicalFrequencyHz = document.timeline.physicalTimebase
    ? clockFrequency({ ...signal, generator } as ClockSignal, document.timeline.physicalTimebase.referenceFrequencyHz)
    : undefined;
  const setCountFrom = (countFrom: EdgeCounterSettings["countFrom"]) => setEdgeCounter((current) => {
    const anchorId = countFrom === "marker" ? current.anchorId ?? document.bookmarks[0]?.id : current.anchorId;
    if (anchorId === undefined) {
      const { anchorId: _anchorId, ...withoutAnchor } = current;
      return { ...withoutAnchor, countFrom };
    }
    return { ...current, countFrom, anchorId };
  });
  const setAnchorId = (anchorId: string | undefined) => setEdgeCounter((current) => {
    if (anchorId === undefined) {
      const { anchorId: _previousAnchorId, ...withoutAnchor } = current;
      return withoutAnchor as EdgeCounterSettings;
    }
    return { ...current, anchorId };
  });
  const generatorChanged = JSON.stringify(generator) !== JSON.stringify(signal.generator);
  const edgeCounterChanged = JSON.stringify(edgeCounter) !== JSON.stringify(signal.edgeCounter);
  const propertiesChanged = name !== signal.name
    || role !== signal.role
    || visible !== (signal.display.visible !== false)
    || spacingBefore !== (signal.spacingBefore ?? 0)
    || spacingAfter !== (signal.spacingAfter ?? 0)
    || align !== (signal.display.align ?? "left")
    || overflow !== (signal.display.overflow ?? "ellipsis")
    || textColor !== styleString(styleObject, "color", "#152033")
    || rowBackground !== styleString(styleObject, "background", "#ffffff")
    || fontFamily !== styleString(styleObject, "fontFamily", "Inter")
    || fontSize !== styleNumber(styleObject, "fontSize", 12)
    || bold !== (styleObject.fontWeight === "bold")
    || italic !== (styleObject.fontStyle === "italic")
    || underline !== styleString(styleObject, "textDecoration", "").includes("underline")
    || strikethrough !== styleString(styleObject, "textDecoration", "").includes("line-through")
    || waveformColor !== styleString(styleObject, "waveformColor", "#111111")
    || waveformBackground !== styleString(styleObject, "waveformBackground", "#ffffff");
  const updateOffset = (axis: "x" | "y", value: number) => setEdgeCounter((current) => ({ ...current, offset: { x: axis === "x" ? value : current.offset.x, y: axis === "y" ? value : current.offset.y } }));
  const applyProperties = (event: FormEvent) => {
    event.preventDefault();
    const decorations = [underline ? "underline" : "", strikethrough ? "line-through" : ""].filter(Boolean).join(" ");
     commands.updateSignalProperties({ signalId: signal.id, name, role, visible, spacingBefore, spacingAfter, displayAlign: align, displayOverflow: overflow, displayStyle: { ...styleObject, color: textColor, background: rowBackground, fontFamily, fontSize, fontWeight: bold ? "bold" : "normal", fontStyle: italic ? "italic" : "normal", textDecoration: decorations, waveformColor, waveformBackground } });
  };
  const convertClock = () => {
    const result = commands.convertClock(signal.id, conversionTarget);
    if (!result.ok) setProblem(result.problems[0]?.message ?? "Clock conversion was rejected.");
    else setConversionConfirm(false);
  };
  return <aside className="inspector" data-testid="inspector" data-inspector-context="clock" onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); if (conversionConfirm) setConversionConfirm(false); else onCancel(); } }}>
    <InspectorHeaderBar onClose={onClose} />
    <InspectorSelectionHeader iconKind="signal" kind={`${signal.role.charAt(0).toUpperCase() + signal.role.slice(1)} · Clock`} title={signal.display.name} detail={[...signal.source.instancePath, signal.source.signalName].join(".") || signal.source.signalName} />
    <div className="inspector-scroll">
    <InspectorSection sectionId="signal-properties" title="Signal Properties" open={sections["signal-properties"] ?? true} onToggle={() => toggle("signal-properties")}><form className="inspector-clock-properties" aria-label="Inspector Clock Properties" onSubmit={applyProperties}>
       <label>Name<InlineNameInput target={signal} value={signal.display.name} ariaLabel="Inspector signal name" onRename={(nextName) => commands.renameSignal(signal.id, nextName)} onCommitted={setName} onDraftChange={setName} /></label>
      <label>Type<select aria-label="Inspector signal type" value="clock" disabled><option value="clock">Clock</option></select></label>
      <label>Role<select aria-label="Inspector signal role" value={role} onChange={(event) => setRole(event.target.value as SignalRole)}><option value="input">Input</option><option value="output">Output</option><option value="internal">Internal</option></select></label>
      <label className="checkline">Show in waveform<input aria-label="Inspector signal visible" type="checkbox" checked={visible} onChange={(event) => setVisible(event.target.checked)} /></label>
      <button type="button" data-testid="set-reference-clock" onClick={() => commands.setReferenceClock(signal.id)} disabled={document.timeline.referenceClock === signal.id}>Use as Reference Clock</button>
      <label>Reference Edge<select aria-label="Reference Edge" value={referenceEdge} onChange={(event) => setReferenceEdge(event.target.value as "rising" | "falling")}><option value="rising">Rising</option><option value="falling">Falling</option></select></label><button type="button" data-testid="apply-reference-edge" onClick={() => commands.setReferenceEdge(referenceEdge)}>Apply Reference Edge</button>
      <label>Spacing Before<input aria-label="Inspector signal spacing before" type="number" min="0" step="1" value={spacingBefore} onChange={(event) => setSpacingBefore(Number(event.target.value))} /></label>
      <label>Spacing After<input aria-label="Inspector signal spacing after" type="number" min="0" step="1" value={spacingAfter} onChange={(event) => setSpacingAfter(Number(event.target.value))} /></label>
      <button type="submit" data-testid="apply-inspector-clock-properties" disabled={!propertiesChanged}>Apply Properties</button>
    </form></InspectorSection>
    <section data-testid="clock-convert-section"><h3>Convert Type</h3><p className="inspector-note">Converting discards the Clock generator, enable waveform, and Edge Counter state.</p>{!conversionConfirm ? <><label>Target Type<select aria-label="Clock conversion target" value={conversionTarget} onChange={(event) => setConversionTarget(event.target.value as "binary" | "bus" | "state")}><option value="binary">Binary</option><option value="bus">Bus</option><option value="state">State</option></select></label><button type="button" data-testid="open-clock-conversion" onClick={() => setConversionConfirm(true)}>Convert Clock</button></> : <div role="alertdialog" aria-label="Confirm Clock conversion"><p>Clock-only generator, enable waveform, and Edge Counter state will be discarded.</p>{convertsReferenceClock && <p data-testid="reference-clock-conversion-warning">This is the document Reference Clock. Converting it also removes the Reference Clock designation and switches the timeline to clockless mode; no replacement Clock is selected automatically.</p>}<button type="button" data-testid="confirm-clock-conversion" onClick={convertClock}>Apply Conversion</button><button type="button" data-testid="cancel-clock-conversion" onClick={() => setConversionConfirm(false)}>Cancel</button></div>}</section>
    {/* #470: "Source / Hierarchy" is hidden from the normal Inspector -- see
        the identical removal (and rationale) in the value-signal editor,
        apps/editor/src/panels/inspector-panel.tsx. `signal.source` metadata
        itself is untouched in Canonical/schema/persistence. */}
    <InspectorSection sectionId="label-style" title="Label Style" open={sections["label-style"] ?? false} onToggle={() => toggle("label-style")}><label>Text Color<input aria-label="Inspector text color" type="color" value={textColor} onChange={(event) => setTextColor(event.target.value)} /></label><label>Background<input aria-label="Inspector label background" type="color" value={rowBackground} onChange={(event) => setRowBackground(event.target.value)} /></label><label>Font<input aria-label="Inspector label font" value={fontFamily} onChange={(event) => setFontFamily(event.target.value)} /></label><label>Size<input aria-label="Inspector label size" type="number" min="6" max="48" value={fontSize} onChange={(event) => setFontSize(Number(event.target.value))} /></label><div className="inspector-style-checks"><label className="checkline">Bold<input aria-label="Inspector label bold" type="checkbox" checked={bold} onChange={(event) => setBold(event.target.checked)} /></label><label className="checkline">Italic<input aria-label="Inspector label italic" type="checkbox" checked={italic} onChange={(event) => setItalic(event.target.checked)} /></label><label className="checkline">Underline<input aria-label="Inspector label underline" type="checkbox" checked={underline} onChange={(event) => setUnderline(event.target.checked)} /></label><label className="checkline">Strikethrough<input aria-label="Inspector label strikethrough" type="checkbox" checked={strikethrough} onChange={(event) => setStrikethrough(event.target.checked)} /></label></div><label>Align<select aria-label="Inspector label align" value={align} onChange={(event) => setAlign(event.target.value as typeof align)}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label><label>Overflow<select aria-label="Inspector label overflow" value={overflow} onChange={(event) => setOverflow(event.target.value as typeof overflow)}><option value="ellipsis">Ellipsis</option><option value="expand">Expand</option><option value="wrap">Wrap</option></select></label></InspectorSection>
    <InspectorSection sectionId="waveform" title="Waveform / Timing" open={sections.waveform ?? true} onToggle={() => toggle("waveform")}><label>Waveform Color<input aria-label="Inspector waveform color" type="color" value={waveformColor} onChange={(event) => setWaveformColor(event.target.value)} /></label><label>Row Background<input aria-label="Inspector waveform background" type="color" value={waveformBackground} onChange={(event) => setWaveformBackground(event.target.value)} /></label></InspectorSection>
    <InspectorSection sectionId="generator" title="Clock Generator" open={sections.generator ?? true} onToggle={() => toggle("generator")}><form className="inspector-clock-generator" aria-label="Inspector Clock Generator" onSubmit={(event) => { event.preventDefault(); commands.updateClockGenerator(signal.id, generator); }}>
      <label>Start<input aria-label="Inspector clock start" type="number" min="0" step="1" value={generator.start} onChange={(event) => number("start", event.target.value)} /></label><label>Period<input aria-label="Inspector clock period" type="number" min="1" step="1" value={generator.period} onChange={(event) => number("period", event.target.value)} /></label><label>Duty<input aria-label="Inspector clock duty" type="number" min="0.01" max="1" step="0.01" value={generator.duty} onChange={(event) => number("duty", event.target.value)} /></label><label>Phase<input aria-label="Inspector clock phase" type="number" step="0.5" value={generator.phase} onChange={(event) => number("phase", event.target.value)} /></label><output data-testid="inspector-clock-derived-frequency" aria-label="Derived clock frequency">Relative frequency: {relativeFrequency === undefined ? "—" : relativeFrequency.toFixed(4)} cycles per reference cycle</output>{physicalFrequencyHz !== undefined && <output data-testid="inspector-clock-physical-frequency" aria-label="Physical clock frequency" data-hz={String(physicalFrequencyHz)}>Physical frequency: {Number(physicalFrequencyHz.toPrecision(4)).toLocaleString()} Hz</output>}<label>Initial<select aria-label="Inspector clock initial" value={generator.initial} onChange={(event) => setGenerator({ ...generator, initial: Number(event.target.value) as 0 | 1 })}><option value="0">0</option><option value="1">1</option></select></label><label>Polarity<select aria-label="Inspector clock polarity" value={generator.polarity} onChange={(event) => setGenerator({ ...generator, polarity: event.target.value as ClockGenerator["polarity"] })}><option value="positive">Positive</option><option value="negative">Negative</option></select></label>{generatorChanged && <DraftStatus testId="inspector-clock-generator-unapplied" />}<button type="submit" data-testid="apply-inspector-clock" disabled={!generatorChanged}>Apply Clock Generator</button>
    </form></InspectorSection>
    <InspectorSection sectionId="edge-counter" title="Edge Counter" open={sections["edge-counter"] ?? true} onToggle={() => toggle("edge-counter")}><form className="inspector-edge-counter" aria-label="Inspector Edge Counter" onSubmit={(event) => { event.preventDefault(); commands.updateEdgeCounter(signal.id, edgeCounter); }}>
      <label className="checkline">Show<input aria-label="Inspector edge counter show" type="checkbox" checked={edgeCounter.show} onChange={(event) => setEdgeCounter({ ...edgeCounter, show: event.target.checked })} /></label><label>Mode<select aria-label="Inspector edge counter mode" value={edgeCounter.mode} onChange={(event) => setEdgeCounter({ ...edgeCounter, mode: event.target.value as EdgeCounterSettings["mode"] })}><option value="rising">Rising</option><option value="falling">Falling</option><option value="both">Both</option></select></label><label>Start Number<input aria-label="Inspector edge counter start" type="number" value={edgeCounter.startNumber} onChange={(event) => setEdgeCounter({ ...edgeCounter, startNumber: Number(event.target.value) })} /></label><label>Count From<select aria-label="Inspector edge counter count from" value={edgeCounter.countFrom} onChange={(event) => setCountFrom(event.target.value as EdgeCounterSettings["countFrom"])}><option value="signal-start">Signal start</option><option value="selected-edge">Selected edge</option><option value="marker" disabled={document.bookmarks.length === 0}>Marker</option><option value="visible-range-start">Visible range start</option></select></label>{edgeCounter.countFrom === "marker" && <label>Marker<select aria-label="Inspector edge counter marker" value={edgeCounter.anchorId ?? ""} onChange={(event) => setAnchorId(event.target.value || undefined)} disabled={document.bookmarks.length === 0}><option value="">Select Bookmark</option>{document.bookmarks.map((bookmark) => <option key={bookmark.id} value={bookmark.id}>{bookmark.name} · cycle {bookmark.start}</option>)}</select></label>}<label>Every N<input aria-label="Inspector edge counter every" type="number" min="1" value={edgeCounter.labelEvery} onChange={(event) => setEdgeCounter({ ...edgeCounter, labelEvery: Number(event.target.value) })} /></label><label>Position<select aria-label="Inspector edge counter position" value={edgeCounter.position} onChange={(event) => setEdgeCounter({ ...edgeCounter, position: event.target.value as EdgeCounterSettings["position"] })}><option value="above">Above</option><option value="below">Below</option></select></label><label>X offset<input aria-label="Inspector edge counter X offset" type="number" value={edgeCounter.offset.x} onChange={(event) => updateOffset("x", Number(event.target.value))} /></label><label>Y offset<input aria-label="Inspector edge counter Y offset" type="number" value={edgeCounter.offset.y} onChange={(event) => updateOffset("y", Number(event.target.value))} /></label><button type="submit" data-testid="apply-inspector-edge-counter" disabled={!edgeCounterChanged}>Apply Edge Counter</button>
    </form></InspectorSection>
    {problem && <div className="editor-problem" role="alert" data-testid="clock-conversion-problem">{problem}</div>}</div>
    <div className="inspector-sticky-footer">
      {edgeCounterChanged && <DraftStatus testId="inspector-edge-counter-unapplied" />}
      <span className="inspector-footer-buttons"><button type="button" data-testid="cancel-inspector-draft" aria-label="Discard unapplied Inspector draft" title="Discard unapplied changes and restore the last applied values" onClick={onCancel}>Revert draft</button></span>
    </div>
    <MiniMap document={document} changeSet={changeSet} viewport={viewport} />
  </aside>;
}

export { InspectorClockEditor };
