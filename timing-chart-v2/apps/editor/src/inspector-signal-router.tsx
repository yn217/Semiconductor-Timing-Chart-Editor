import type { RefObject, ReactNode } from "react";
import type { ChangeSet } from "@timing-chart-v2/commands";
import type { CanonicalDocument, Signal } from "@timing-chart-v2/schema";
import { MiniMap } from "./minimap.js";
import { InspectorHeaderBar, InspectorSelectionHeader } from "./inspector-selection-header.js";
import type { EditorSurfaceCommandController } from "./application/editor-surface-command-controller.js";

type InspectorSignalEditorBaseProps = {
  readonly signal: Signal;
  readonly document: Readonly<CanonicalDocument>;
  readonly changeSet: ChangeSet;
  readonly viewport: RefObject<HTMLDivElement | null>;
  readonly commands: EditorSurfaceCommandController;
  readonly onReveal: () => void;
  readonly onCancel: () => void;
  readonly onClose: () => void;
};
type InspectorSignalEditorProps = InspectorSignalEditorBaseProps & {
  readonly renderClock: (props: InspectorSignalEditorBaseProps & { readonly signal: Extract<Signal, { readonly type: "clock" }> }) => ReactNode;
  readonly renderValue: (props: InspectorSignalEditorBaseProps & { readonly signal: Exclude<Signal, { readonly type: "clock" | "commentRow" }> }) => ReactNode;
};

export function InspectorSignalRouter({ signal, document, changeSet, viewport, commands, onReveal, onCancel, onClose, renderClock, renderValue }: InspectorSignalEditorProps) {
  const props: InspectorSignalEditorBaseProps = { signal, document, changeSet, viewport, commands, onReveal, onCancel, onClose };
  if (signal.type === "clock") return renderClock({ ...props, signal });
  if (signal.type === "commentRow") return <aside className="inspector" data-testid="inspector">
    <InspectorHeaderBar onClose={onClose} />
    <InspectorSelectionHeader kind="Signal" title={signal.title} detail="Comment Row" />
    <section><div className="property-row"><span>Scope</span><span>{signal.source.instancePath.join(".") || "(root)"}</span></div><p className="inspector-note">Comment Row editing is owned by the Bottom Context Editor.</p></section><MiniMap document={document} viewport={viewport} /></aside>;
  return renderValue({ ...props, signal });
}
