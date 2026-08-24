export type StableId<Kind extends string> = string & { readonly __kind: Kind };

export type SignalId = StableId<"signal">;
export type GroupId = StableId<"group">;
export type RowId = SignalId | StableId<"spacer">;
export type AnnotationId = StableId<"annotation">;
export type TransactionId = StableId<"transaction">;
export type BookmarkId = StableId<"bookmark">;
export type TimeGroupId = StableId<"time-group">;
export type CommandId = StableId<"command">;

/** Phase 0 root contract only. Phase 1 owns the complete persistent schema. */
export interface CanonicalDocument {
  readonly formatVersion: number;
}

export interface SemanticAnchor {
  readonly signalId?: SignalId;
  readonly cycle: number;
  readonly point: "cycle-start" | "cycle-center" | "cycle-end" | "transition-start" | "transition-center" | "transition-end" | "rising-edge" | "falling-edge" | "value-start";
  readonly offset?: Readonly<{ x: number; y: number }>;
}
