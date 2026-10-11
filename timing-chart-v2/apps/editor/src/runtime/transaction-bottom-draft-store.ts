import type { TransactionGroup, TransactionId } from "@timing-chart-v2/schema";

export type TransactionRowDraft = Readonly<{
  name: string;
  start: number;
  end: number;
  laneId: string;
  groupId: TransactionGroup["id"] | undefined;
  color: string;
  description: string;
}>;

export type StoredTransactionDraft = Readonly<{ base: TransactionRowDraft; draft: TransactionRowDraft }>;
export type TransactionCreateDraft = Readonly<{ name: string; start: number; end: number; laneId: string }>;

function sameDraft(left: TransactionRowDraft, right: TransactionRowDraft): boolean {
  return left.name === right.name && left.start === right.start && left.end === right.end && left.laneId === right.laneId && left.groupId === right.groupId && left.color === right.color && left.description === right.description;
}

const DEFAULT_CREATE_DRAFT: TransactionCreateDraft = { name: "Transaction", start: 1, end: 5, laneId: "" };

/** Document-scoped owner for unapplied Transaction Bottom edits. */
export class TransactionBottomDraftStore {
  private readonly drafts = new Map<TransactionId, StoredTransactionDraft>();
  private createDraft: TransactionCreateDraft | undefined;
  private version = 0;
  private resetRevision = 0;
  private readonly listeners = new Set<() => void>();
  private readonly resetListeners = new Set<() => void>();

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  readonly subscribeReset = (listener: () => void): (() => void) => {
    this.resetListeners.add(listener);
    return () => { this.resetListeners.delete(listener); };
  };

  readonly getVersion = (): number => this.version;
  readonly getResetRevision = (): number => this.resetRevision;
  readonly hasUnappliedDrafts = (): boolean => this.drafts.size > 0 || this.createDraft !== undefined;
  readonly get = (id: TransactionId): StoredTransactionDraft | undefined => this.drafts.get(id);
  readonly getCreateDraft = (fallback: TransactionCreateDraft = DEFAULT_CREATE_DRAFT): TransactionCreateDraft => this.createDraft ?? fallback;

  readonly set = (id: TransactionId, base: TransactionRowDraft, draft: TransactionRowDraft): void => {
    if (sameDraft(base, draft)) this.drafts.delete(id);
    else this.drafts.set(id, { base, draft });
    this.publish();
  };

  readonly remove = (id: TransactionId): void => {
    if (this.drafts.delete(id)) this.publish();
  };

  readonly removeMissingTransactions = (ids: ReadonlySet<TransactionId>): void => {
    let changed = false;
    for (const id of this.drafts.keys()) {
      if (!ids.has(id)) changed = this.drafts.delete(id) || changed;
    }
    if (changed) this.publish();
  };

  readonly setCreateDraft = (draft: TransactionCreateDraft, baseline: TransactionCreateDraft = DEFAULT_CREATE_DRAFT): void => {
    if (draft.name === baseline.name && draft.start === baseline.start && draft.laneId === baseline.laneId && draft.end === baseline.end) this.createDraft = undefined;
    else this.createDraft = draft;
    this.publish();
  };

  readonly clearCreateDraft = (): void => {
    if (this.createDraft === undefined) return;
    this.createDraft = undefined;
    this.publish();
  };

  readonly clearAll = (): void => {
    if (this.drafts.size === 0 && this.createDraft === undefined) return;
    this.drafts.clear();
    this.createDraft = undefined;
    this.version += 1;
    this.resetRevision += 1;
    for (const listener of this.listeners) listener();
    for (const listener of this.resetListeners) listener();
  };

  private publish(): void {
    this.version += 1;
    for (const listener of this.listeners) listener();
  }
}
