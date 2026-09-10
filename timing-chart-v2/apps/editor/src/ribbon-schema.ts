import type { ReactNode } from "react";

export type RibbonPresentationSize = "large" | "medium" | "small" | "icon";
export type RibbonOverflowPolicy = "never" | "allowed" | "preferred";
export type RibbonPresentation = Readonly<{ preferredSize: RibbonPresentationSize; compactSize?: RibbonPresentationSize; overflow: RibbonOverflowPolicy; priority?: number }>;

/** Deterministic degradation shared by Home, View and contextual ribbons. */
export function resolveRibbonPresentation(presentation: RibbonPresentation, available: RibbonPresentationSize): RibbonPresentationSize | "overflow" {
  if (presentation.overflow === "preferred" && available !== "large") return "overflow";
  const rank: readonly RibbonPresentationSize[] = ["large", "medium", "small", "icon"];
  const preferredIndex = rank.indexOf(presentation.preferredSize);
  const availableIndex = rank.indexOf(available);
  if (preferredIndex >= availableIndex) return presentation.preferredSize;
  if (presentation.compactSize && rank.indexOf(presentation.compactSize) >= availableIndex) return presentation.compactSize;
  return presentation.overflow === "never" ? "icon" : "overflow";
}

/**
 * Data-driven ribbon group/item schema. A group's buttons/toggles are
 * defined as an array of these specs, not hand-written per-button JSX --
 * this is what lets the main ribbon and the narrow-width overflow menu
 * render from one source instead of drifting apart (see the Home overflow
 * menu's pre-existing Cut-gate mismatch this replaces).
 */
export type RibbonItemSpec =
  | {
      readonly kind: "button";
      readonly id: string;
      readonly icon: string;
      readonly label: string;
      readonly v1Label?: string;
      readonly ariaLabel?: string;
      readonly testId?: string;
      readonly disabled?: boolean;
      readonly title?: string;
      readonly presentation?: RibbonPresentation;
      /** #439: opt into the one shared "wide" size class (see ribbon.css)
       * when `label` contains a single word that won't fit the default
       * Home button width without breaking mid-word. Omit for the default
       * width -- most labels need nothing here. */
      readonly size?: "wide";
      readonly onClick: () => void;
    }
  | {
      readonly kind: "toggle";
      readonly id: string;
      readonly label: string;
      readonly testId?: string;
      readonly checked: boolean;
      readonly onChange: () => void;
      readonly presentation?: RibbonPresentation;
    }
  | {
      readonly kind: "split";
      readonly id: string;
      readonly icon: string;
      readonly label: string;
      readonly menuAriaLabel: string;
      readonly onClick: () => void;
      readonly onMenuClick: () => void;
      readonly ariaLabel?: string;
      readonly testId?: string;
      readonly disabled?: boolean;
      readonly title?: string;
      readonly presentation?: RibbonPresentation;
    }
  | {
      readonly kind: "custom";
      readonly id: string;
      readonly render: () => ReactNode;
    };

export type RibbonGroupSpec = {
  readonly id: string;
  readonly majorGroup: string;
  readonly caption: string;
  readonly items: readonly RibbonItemSpec[];
};
