import type { RefObject } from "react";
import type { SemanticCommand } from "@timing-chart-v2/commands";
import type { CanonicalDocument, TransactionId } from "@timing-chart-v2/schema";

/**
 * Coarse Timeline / Viewport / Interaction owner.
 *
 * The first cut is a typed port so the existing monolith can be migrated
 * without changing behaviour.  Existing runtime/timeline-viewport-runtime.ts
 * should remain the geometry owner behind these callbacks.
 */
export interface MinimalCycleTimelineSource {
  readonly timelineDocument: Readonly<CanonicalDocument>;
  readonly viewportRef: RefObject<HTMLDivElement | null>;
  readonly surfaceHostRef: RefObject<HTMLDivElement | null>;
  readonly rulerRef: RefObject<HTMLDivElement | null>;
  readonly gridLayerRef: RefObject<HTMLDivElement | null>;

  readonly zoom: number;
  readonly gridEnabled: boolean;
  readonly snapEnabled: boolean;
  readonly rulerEnabled: boolean;

  readonly selectedCycle: number;
  readonly selectedTransactionId?: TransactionId;

  readonly changeZoom: (delta: number) => void;
  readonly setZoomAbsolute: (zoom: number) => void;
  readonly fitAll: () => void;
  readonly fitSelection: () => void;
  readonly navigateToCycle: (cycle: number) => void;

  readonly transactionBoundaryX: (cycle: number) => number | undefined;
  readonly snapTransactionCycle: (clientX: number) => number | undefined;

  readonly executeTimelineCommand: (command: SemanticCommand) => unknown;
}

export interface MinimalCycleTimelinePort {
  readonly document: Readonly<CanonicalDocument>;
  readonly refs: Readonly<{
    viewport: RefObject<HTMLDivElement | null>;
    surfaceHost: RefObject<HTMLDivElement | null>;
    ruler: RefObject<HTMLDivElement | null>;
    gridLayer: RefObject<HTMLDivElement | null>;
  }>;

  readonly state: Readonly<{
    zoom: number;
    gridEnabled: boolean;
    snapEnabled: boolean;
    rulerEnabled: boolean;
    selectedCycle: number;
    selectedTransactionId?: TransactionId;
  }>;

  readonly view: Readonly<{
    zoomBy: (delta: number) => void;
    setZoom: (zoom: number) => void;
    fitAll: () => void;
    fitSelection: () => void;
    navigateToCycle: (cycle: number) => void;
  }>;

  readonly geometry: Readonly<{
    transactionBoundaryX: (cycle: number) => number | undefined;
    snapTransactionCycle: (clientX: number) => number | undefined;
  }>;

  readonly execute: (command: SemanticCommand) => unknown;
}

export function createMinimalCycleTimelinePort(
  source: MinimalCycleTimelineSource,
): MinimalCycleTimelinePort {
  return {
    document: source.timelineDocument,
    refs: {
      viewport: source.viewportRef,
      surfaceHost: source.surfaceHostRef,
      ruler: source.rulerRef,
      gridLayer: source.gridLayerRef,
    },
    state: {
      zoom: source.zoom,
      gridEnabled: source.gridEnabled,
      snapEnabled: source.snapEnabled,
      rulerEnabled: source.rulerEnabled,
      selectedCycle: source.selectedCycle,
      ...(source.selectedTransactionId === undefined
        ? {}
        : { selectedTransactionId: source.selectedTransactionId }),
    },
    view: {
      zoomBy: source.changeZoom,
      setZoom: source.setZoomAbsolute,
      fitAll: source.fitAll,
      fitSelection: source.fitSelection,
      navigateToCycle: source.navigateToCycle,
    },
    geometry: {
      transactionBoundaryX: source.transactionBoundaryX,
      snapTransactionCycle: source.snapTransactionCycle,
    },
    execute: source.executeTimelineCommand,
  };
}

