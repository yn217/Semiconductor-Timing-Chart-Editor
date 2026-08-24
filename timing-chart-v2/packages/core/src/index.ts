import {
  parseDocument,
  serializeCanonicalDocument,
  validateCanonicalDocument,
  type CanonicalDocument,
  type DocumentProblem,
  type MigrationWarning,
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

  constructor(initial: CanonicalDocument) {
    const problems = validateCanonicalDocument(initial);
    if (problems.length > 0) throw new Error(`Initial canonical document is invalid: ${problems.map((item) => item.code).join(", ")}`);
    this.#snapshot = deepFreeze({ revision: 0, document: cloneValue(initial) }) as CanonicalSnapshot;
  }

  getSnapshot(): CanonicalSnapshot {
    return this.#snapshot;
  }

  commit(next: Readonly<CanonicalDocument>, expectedRevision: number): CanonicalSnapshot {
    if (expectedRevision !== this.#snapshot.revision) throw new Error(`Stale canonical revision ${expectedRevision}; current revision is ${this.#snapshot.revision}.`);
    const problems = validateCanonicalDocument(next);
    if (problems.length > 0) throw new Error(`Rejected invalid canonical commit: ${problems.map((item) => item.code).join(", ")}`);
    this.#snapshot = deepFreeze({ revision: this.#snapshot.revision + 1, document: cloneValue(next) }) as CanonicalSnapshot;
    return this.#snapshot;
  }

  open(input: string | unknown): AtomicOpenResult {
    const parsed = parseDocument(input);
    if (!parsed.ok) return failedOpen(parsed);
    this.#snapshot = deepFreeze({ revision: this.#snapshot.revision + 1, document: cloneValue(parsed.document) }) as CanonicalSnapshot;
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
