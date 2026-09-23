import { useState } from "react";
import type { ComponentProps } from "react";
import { AIOperationPanel } from "../ai-operation-panel.js";
import type { AIBridgeStatus, AISelectionEntityType } from "../ai-bridge-client.js";
import type { AIViewIntent } from "../ai-proposal-provider.js";
import type { DocumentProblem } from "@timing-chart-v2/schema";

type PanelProps = ComponentProps<typeof AIOperationPanel>;

export function useEditorAiAssistantModel(input: Pick<PanelProps, "document" | "documentEpoch" | "revision" | "mode" | "selectedSignalId" | "selectedGroupId" | "selectedAnnotationId" | "selectedTransactionId" | "range" | "onCommand"> & {
  readonly onCommandBatch: NonNullable<PanelProps["onCommandBatch"]>;
  readonly getZoom: NonNullable<PanelProps["getZoom"]>;
  readonly onFitAll: () => void;
  readonly onFitSelection: () => void;
  readonly onOpenTimeline: () => void;
  readonly onSetSelection: (target: Readonly<{ entityType: AISelectionEntityType; entityId: string }>) => void;
  readonly setRuntimeDiagnostics: (updater: (current: readonly DocumentProblem[]) => readonly DocumentProblem[]) => void;
}) {
  const [bridgeEnabled, setBridgeEnabled] = useState(false);
  const [bridgeToken, setBridgeToken] = useState("");
  const [bridgeStatus, setBridgeStatus] = useState<AIBridgeStatus>("disabled");
  const onViewIntent = (intent: AIViewIntent) => { if (intent === "fit-all") input.onFitAll(); else if (intent === "fit-selection") input.onFitSelection(); else input.onOpenTimeline(); };
  const onDiagnostic: PanelProps["onDiagnostic"] = (next) => {
    const nextDiagnostics = next === undefined ? [] : Array.isArray(next) ? next : [next];
    input.setRuntimeDiagnostics((current) => [...current.filter((item) => !item.detail?.startsWith("ai-proposal:")), ...nextDiagnostics]);
  };
  const panelProps = {
    document: input.document,
    documentEpoch: input.documentEpoch,
    revision: input.revision,
    mode: input.mode,
    selectedSignalId: input.selectedSignalId,
    selectedGroupId: input.selectedGroupId,
    selectedAnnotationId: input.selectedAnnotationId,
    selectedTransactionId: input.selectedTransactionId,
    range: input.range,
    onCommand: input.onCommand,
    onCommandBatch: input.onCommandBatch,
    onViewIntent,
    onSetSelection: input.onSetSelection,
    onDiagnostic,
    icon: null,
    bridgeHost: "127.0.0.1",
    bridgePort: 4610,
    bridgeEnabled,
    onBridgeEnabledChange: setBridgeEnabled,
    bridgeToken,
    onBridgeTokenChange: setBridgeToken,
    onBridgeStatusChange: setBridgeStatus,
    getZoom: input.getZoom,
  } satisfies Omit<PanelProps, "provider">;
  return { ...panelProps, aiBridgeStatus: bridgeStatus };
}
