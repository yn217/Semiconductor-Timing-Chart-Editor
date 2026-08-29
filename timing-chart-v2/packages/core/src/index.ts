import {
  parseDocument,
  serializeCanonicalDocument,
  validateCanonicalDocument,
  type CanonicalDocument,
  type DocumentProblem,
  type MigrationWarning,
  type ParsedCanonicalDocument,
  type ParseDocumentResult,
} from "@timing-chart-v2/schema";

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

export type ValidationProblem = DocumentProblem;

export interface CanonicalValidator {
  validate(candidate: Readonly<CanonicalDocument>): readonly ValidationProblem[];
}

export type AtomicOpenResult =
  | Readonly<{
      ok: true;
      snapshot: CanonicalSnapshot;
      warnings: readonly MigrationWarning[];
      fullDocumentReplace: true;
      resetDocumentTransientState: true;
    }>
  | Readonly<{
      ok: false;
      kind: "syntax" | "unsupported-version" | "validation";
      problems: readonly DocumentProblem[];
      sourceFormatVersion?: number;
      compatibilitySource?: unknown;
    }>;

export type SaveResult =
  | Readonly<{ ok: true; text: string }>
  | Readonly<{ ok: false; problems: readonly DocumentProblem[] }>;

export class CanonicalCommitError extends Error {
  readonly reason: "stale" | "validation";
  readonly problems: readonly DocumentProblem[];

  constructor(reason: "stale" | "validation", message: string, problems: readonly DocumentProblem[] = []) {
    super(message);
    this.name = "CanonicalCommitError";
    this.reason = reason;
    this.problems = problems;
  }
}

export interface CanonicalSessionMetrics {
  readonly validationRuns: number;
  readonly commits: number;
}

function cloneValue<T>(value: T): T {
  if (Array.isArray(value)) return value.map((entry) => cloneValue(entry)) as T;
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, cloneValue(entry)])) as T;
  }
  return value;
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const entry of Object.values(value)) deepFreeze(entry);
  }
  return value;
}

function isParsedCanonicalDocument(value: CanonicalDocument | ParsedCanonicalDocument): value is ParsedCanonicalDocument {
  return "validated" in value && value.validated === true;
}

function failedOpen(result: Exclude<ParseDocumentResult, { ok: true }>): AtomicOpenResult {
  return {
    ok: false,
    kind: result.kind,
    problems: result.problems,
    ...(result.sourceFormatVersion === undefined ? {} : { sourceFormatVersion: result.sourceFormatVersion }),
    ...(result.raw === undefined ? {} : { compatibilitySource: result.raw }),
  };
}

export class DocumentSession implements CanonicalStore, CanonicalMutationPort {
  #snapshot: CanonicalSnapshot;
  #validationRuns = 0;
  #commits = 0;

  constructor(initial: CanonicalDocument | ParsedCanonicalDocument) {
    const parsedHandoff = isParsedCanonicalDocument(initial);
    const document = parsedHandoff ? initial.document : initial;
    if (!parsedHandoff) {
      const problems = this.#validate(document);
      if (problems.length > 0) throw new Error(`Initial canonical document is invalid: ${problems.map((item) => item.code).join(", ")}`);
    }
    // A parser result is already a detached, validated document. Freeze that
    // owned tree in place instead of validating and cloning it a second time.
    this.#snapshot = deepFreeze({ revision: 0, document: parsedHandoff ? document : cloneValue(document) }) as CanonicalSnapshot;
  }

  getSnapshot(): CanonicalSnapshot {
    return this.#snapshot;
  }

  metrics(): CanonicalSessionMetrics {
    return { validationRuns: this.#validationRuns, commits: this.#commits };
  }

  #validate(candidate: Readonly<CanonicalDocument>): readonly DocumentProblem[] {
    this.#validationRuns += 1;
    return validateCanonicalDocument(candidate);
  }

  commit(next: Readonly<CanonicalDocument>, expectedRevision: number): CanonicalSnapshot {
    if (expectedRevision !== this.#snapshot.revision) throw new CanonicalCommitError("stale", `Stale canonical revision ${expectedRevision}; current revision is ${this.#snapshot.revision}.`);
    const problems = this.#validate(next);
    if (problems.length > 0) throw new CanonicalCommitError("validation", `Rejected invalid canonical commit: ${problems.map((item) => item.code).join(", ")}`, problems);
    // Command planning already uses structural sharing. Preserve those shared,
    // frozen branches instead of cloning the complete document per edit.
    this.#snapshot = deepFreeze({ revision: this.#snapshot.revision + 1, document: next }) as CanonicalSnapshot;
    this.#commits += 1;
    return this.#snapshot;
  }

  open(input: string | unknown): AtomicOpenResult {
    const parsed = parseDocument(input);
    if (!parsed.ok) return failedOpen(parsed);
    this.#snapshot = deepFreeze({ revision: this.#snapshot.revision + 1, document: parsed.document }) as CanonicalSnapshot;
    this.#commits += 1;
    return { ok: true, snapshot: this.#snapshot, warnings: parsed.warnings, fullDocumentReplace: true, resetDocumentTransientState: true };
  }

  save(): SaveResult {
    const problems = validateCanonicalDocument(this.#snapshot.document);
    if (problems.length > 0) return { ok: false, problems };
    return { ok: true, text: serializeCanonicalDocument(this.#snapshot.document) };
  }
}

export function createEmptyDocument(): CanonicalDocument {
  return {
    formatVersion: 2,
    document: {
      id: "document",
      title: "Untitled Timing Chart",
      header: { subtitle: "", description: "", notes: "", preconditions: [], constraints: [], exceptions: [] },
      footer: { figureNumber: "", revision: "", text: "" },
    },
    timeline: { start: 0, end: 1, timeBase: "cycle", cycleCount: 1, edge: "rising", labelAnchors: [] },
    signalGroups: [],
    signals: [],
    bookmarks: [],
    timeGroups: [],
    annotations: [],
    legend: { show: true, orientation: "horizontal", usedRolesOnly: true, position: { x: 0, y: 0 } },
    layout: { roleColumnWidth: 32, signalNameWidth: 168, signalNameAlign: "left", rowHeight: 28, signalSpacing: 6, overflow: "ellipsis" },
    transactions: [],
    constraints: [],
    checkSettings: {},
  };
}
