import {
  parseDocument,
  serializeValidatedCanonicalDocument,
  validateCanonicalDocument,
  validateDocumentResourceBudget,
  type CanonicalDocument,
  type DocumentProblem,
  type MigrationWarning,
  type ParsedCanonicalDocument,
  isTrustedParsedCanonicalDocument,
  type ParseDocumentResult,
} from "@timing-chart-v2/schema";

export { deriveTimingDiagnostics, deriveTimingDiagnosticsIfInputsChanged, TIMING_DIAGNOSTIC_CATEGORIES, TIMING_DIAGNOSTIC_CODES, TIMING_DIAGNOSTIC_RULES, type TimingDiagnostic, type TimingDiagnosticCategory, type TimingDiagnosticCode, type TimingDiagnosticOptions, type TimingDiagnosticRule } from "./diagnostics.js";

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

const deeplyFrozenObjects = new WeakSet<object>();

function deepFreeze<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === "object") {
    if (deeplyFrozenObjects.has(value)) return value;
    for (const entry of Object.values(value)) deepFreeze(entry);
    Object.freeze(value);
    deeplyFrozenObjects.add(value);
  }
  return value;
}

function sameOwnKeys(left: object, right: object): boolean {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return leftKeys.length === rightKeys.length && leftKeys.every((key) => Object.hasOwn(right, key));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Only permits a structural-sharing-preserving Signal name change. */
function isSignalRenameOnly(previous: CanonicalDocument, next: CanonicalDocument, signalId: string): boolean {
  if (!isRecord(next) || !sameOwnKeys(previous, next) || !Array.isArray(previous.signals) || !Array.isArray(next.signals)) return false;
  for (const key of Object.keys(previous)) {
    if (key !== "signals" && !Object.is(previous[key as keyof CanonicalDocument], next[key as keyof CanonicalDocument])) return false;
  }
  if (previous.signals.length !== next.signals.length) return false;

  let targetCount = 0;
  let changedCount = 0;
  for (let index = 0; index < previous.signals.length; index += 1) {
    const before = previous.signals[index]!;
    const after = next.signals[index]!;
    if (before.id === signalId) targetCount += 1;
    if (before === after) continue;
    changedCount += 1;
    if (!isRecord(after) || before.id !== signalId || after.id !== signalId || !sameOwnKeys(before, after)) return false;
    if (typeof after.name !== "string" || after.name.trim() !== after.name || after.name.length === 0 || after.name === before.name) return false;
    for (const key of Object.keys(before)) {
      // A Comment Row's title mirrors its name (commentRow.update keeps name = title), so a rename carries it along.
      if (key === "title" && after.type === "commentRow" && (after as { title?: unknown }).title === after.name) continue;
      if (key !== "name" && key !== "display" && !Object.is(before[key as keyof typeof before], after[key as keyof typeof after])) return false;
    }
    if (!isRecord(before.display) || !isRecord(after.display) || !sameOwnKeys(before.display, after.display) || after.display.name !== after.name || after.display.name === before.display.name) return false;
    for (const key of Object.keys(before.display)) {
      if (key !== "name" && !Object.is(before.display[key], after.display[key])) return false;
    }
  }
  return targetCount === 1 && changedCount === 1;
}

/** Only permits changing one Signal's role; all validation-sensitive data remains shared and unchanged. */
export function isSignalRoleChangeOnly(previous: CanonicalDocument, next: CanonicalDocument, signalId: string): boolean {
  if (!isRecord(next) || !sameOwnKeys(previous, next) || !Array.isArray(previous.signals) || !Array.isArray(next.signals)) return false;
  for (const key of Object.keys(previous)) {
    if (key !== "signals" && !Object.is(previous[key as keyof CanonicalDocument], next[key as keyof CanonicalDocument])) return false;
  }
  if (previous.signals.length !== next.signals.length) return false;

  let targetCount = 0;
  let changedCount = 0;
  for (let index = 0; index < previous.signals.length; index += 1) {
    const before = previous.signals[index]!;
    const after = next.signals[index]!;
    if (before.id === signalId) targetCount += 1;
    if (before === after) continue;
    changedCount += 1;
    if (!isRecord(after) || before.id !== signalId || after.id !== signalId || !sameOwnKeys(before, after)) return false;
    if (after.role === before.role || !(after.role === "input" || after.role === "output" || after.role === "internal")) return false;
    for (const key of Object.keys(before)) {
      if (key === "role") continue;
      if (key !== "display" && !Object.is(before[key as keyof typeof before], after[key as keyof typeof after])) return false;
    }
    if (!isRecord(before.display) || !isRecord(after.display) || !sameOwnKeys(before.display, after.display)) return false;
    for (const key of Object.keys(before.display)) if (!Object.is(before.display[key], after.display[key])) return false;
  }
  return targetCount === 1 && changedCount === 1;
}

function isParsedCanonicalDocument(value: CanonicalDocument | ParsedCanonicalDocument): value is ParsedCanonicalDocument {
  return isTrustedParsedCanonicalDocument(value);
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
    // Keep structural/canonical validation and the product policy as distinct
    // layers, but require both before a candidate can enter the session. This
    // is the authoritative boundary shared by commands, batches, history
    // restoration, and document replacement commands.
    return [...validateCanonicalDocument(candidate), ...validateDocumentResourceBudget(candidate)];
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

  commitSignalRename(next: Readonly<CanonicalDocument>, expectedRevision: number, signalId: string): CanonicalSnapshot {
    if (expectedRevision !== this.#snapshot.revision) throw new CanonicalCommitError("stale", `Stale canonical revision ${expectedRevision}; current revision is ${this.#snapshot.revision}.`);
    this.#validationRuns += 1;
    if (!isSignalRenameOnly(this.#snapshot.document, next as CanonicalDocument, signalId)) {
      const problem: DocumentProblem = { code: "INVALID_INCREMENTAL_SIGNAL_RENAME", path: "$.signals", message: "Incremental rename commit changed fields outside the target Signal name." };
      throw new CanonicalCommitError("validation", problem.message, [problem]);
    }
    // This scoped proof is the single validation for this planner-generated
    // operation. Every unmodified canonical branch is the prior validated,
    // deeply frozen branch; the changed fields are checked above.
    this.#snapshot = deepFreeze({ revision: this.#snapshot.revision + 1, document: next }) as CanonicalSnapshot;
    this.#commits += 1;
    return this.#snapshot;
  }

  commitSignalRoleChange(next: Readonly<CanonicalDocument>, expectedRevision: number, signalId: string): CanonicalSnapshot {
    if (expectedRevision !== this.#snapshot.revision) throw new CanonicalCommitError("stale", `Stale canonical revision ${expectedRevision}; current revision is ${this.#snapshot.revision}.`);
    this.#validationRuns += 1;
    if (!isSignalRoleChangeOnly(this.#snapshot.document, next as CanonicalDocument, signalId)) {
      const problem: DocumentProblem = { code: "INVALID_INCREMENTAL_SIGNAL_ROLE_CHANGE", path: "$.signals", message: "Incremental role commit changed fields outside the target Signal role." };
      throw new CanonicalCommitError("validation", problem.message, [problem]);
    }
    // A role-only planner result cannot affect IDs, references, timeline/value
    // ranges, or any resource-budget count. Every other branch remains the
    // previously validated and deeply frozen value.
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
    // The snapshot is owned by this session and can only be established by
    // validated construction, validated Open, or validated commit. Keep the
    // trust boundary explicit and avoid validating it a second time here.
    try {
      return { ok: true, text: serializeValidatedCanonicalDocument(this.#snapshot.document) };
    } catch (error) {
      const problems = (error as { problems?: unknown })?.problems;
      return {
        ok: false,
        problems: Array.isArray(problems) ? problems as readonly DocumentProblem[] : [{ code: "SAVE_SERIALIZE_FAILED", path: "$", message: error instanceof Error ? error.message : "Document could not be serialized." }],
      };
    }
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
    annotationGroups: [],
    legend: { show: true, orientation: "horizontal", usedRolesOnly: true, position: { x: 0, y: 0 } },
    layout: { roleColumnWidth: 32, signalNameWidth: 168, signalNameAlign: "left", rowHeight: 28, signalSpacing: 6, overflow: "ellipsis" },
    transactions: [],
    constraints: [],
    checkSettings: {},
  };
}
