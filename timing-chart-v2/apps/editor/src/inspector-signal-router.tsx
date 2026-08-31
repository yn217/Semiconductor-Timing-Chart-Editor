import type { RefObject, ReactNode } from "react";
import type { CommandResult, SemanticCommand } from "@timing-chart-v2/commands";
import type { CanonicalDocument, Signal } from "@timing-chart-v2/schema";
import { MiniMap } from "./minimap.js";

type InspectorSignalEditorBaseProps = {
  readonly signal: Signal;
  readonly document: Readonly<CanonicalDocument>;
  readonly viewport: RefObject<HTMLDivElement | null>;
  readonly onCommand: (command: SemanticCommand) => CommandResult;
  readonly onReveal: () => void;
  readonly onCancel: () => void;
};
type InspectorSignalEditorProps = InspectorSignalEditorBaseProps & {
  readonly renderClock: (props: InspectorSignalEditorBaseProps & { readonly signal: Extract<Signal, { readonly type: "clock" }> }) => ReactNode;
  readonly renderValue: (props: InspectorSignalEditorBaseProps & { readonly signal: Exclude<Signal, { readonly type: "clock" | "commentRow" }> }) => ReactNode;
};

export function InspectorSignalRouter({ signal, document, viewport, onCommand, onReveal, onCancel, renderClock, renderValue }: InspectorSignalEditorProps) {
  const props: InspectorSignalEditorBaseProps = { signal, document, viewport, onCommand, onReveal, onCancel };
  if (signal.type === "clock") return renderClock({ ...props, signal });
  if (signal.type === "commentRow") return <aside className="inspector" data-testid="inspector"><header><span>Inspector</span></header><section><h3>Comment Row</h3><div className="property-row"><span>Title</span><b>{signal.title}</b></div><div className="property-row"><span>Scope</span><span>{signal.source.instancePath.join(".") || "(root)"}</span></div><p className="inspector-note">Comment Row editing is owned by the Bottom Context Editor.</p></section><MiniMap document={document} viewport={viewport} /></aside>;
  return renderValue({ ...props, signal });
}
