import type { SemanticAnchor } from "./types.js";

export type TransitionAnchorKind = "threshold" | "ratio";
export type MeasurementProfile = "cycle" | "30-70" | "10-90" | "20-80" | "50%" | "custom";
export type MeasurementMarker = "none" | "bar" | "arrow";
export type MeasurementArrowLayout = "inward" | "outward" | "auto";
export type MeasurementExtensionLines = "none" | "start" | "end" | "both";

export interface MeasurementLayout {
  readonly startMarker: MeasurementMarker;
  readonly endMarker: MeasurementMarker;
  readonly arrowLayout: MeasurementArrowLayout;
  readonly extensionLines: MeasurementExtensionLines;
  readonly lane?: number;
}

export const DEFAULT_MEASUREMENT_LAYOUT: MeasurementLayout = Object.freeze({ startMarker: "bar", endMarker: "bar", arrowLayout: "auto", extensionLines: "both" });

export const MEASUREMENT_PROFILES = ["cycle", "30-70", "10-90", "20-80", "50%", "custom"] as const satisfies readonly MeasurementProfile[];

export function measurementProfilePair(profile: MeasurementProfile): { readonly start: number; readonly end: number } | undefined {
  switch (profile) {
    case "30-70": return { start: 0.3, end: 0.7 };
    case "10-90": return { start: 0.1, end: 0.9 };
    case "20-80": return { start: 0.2, end: 0.8 };
    case "50%": return { start: 0.5, end: 0.5 };
    default: return undefined;
  }
}

/** Returns the fraction used to resolve a transition against rendered geometry.
 * `threshold` is the pre-profile persisted spelling retained for old documents. */
export function anchorTransitionFraction(anchor: SemanticAnchor | undefined): number | undefined {
  return anchor?.transition?.value ?? anchor?.threshold;
}

export function anchorTransitionKind(anchor: SemanticAnchor | undefined): TransitionAnchorKind | undefined {
  return anchor?.transition?.kind ?? (anchor?.threshold === undefined ? undefined : "threshold");
}
