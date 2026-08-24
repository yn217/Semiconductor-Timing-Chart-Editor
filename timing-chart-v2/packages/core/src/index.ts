import type { CanonicalDocument } from "@timing-chart-v2/schema";

export interface CanonicalSnapshot {
  readonly revision: number;
  readonly document: Readonly<CanonicalDocument>;
}

export interface CanonicalStore {
  getSnapshot(): CanonicalSnapshot;
}

export interface CanonicalMutationPort {
  commit(next: Readonly<CanonicalDocument>, expectedRevision: number): CanonicalSnapshot;
}

export interface ValidationProblem {
  readonly code: string;
  readonly message: string;
  readonly entityId?: string;
}

export interface CanonicalValidator {
  validate(candidate: Readonly<CanonicalDocument>): readonly ValidationProblem[];
}
