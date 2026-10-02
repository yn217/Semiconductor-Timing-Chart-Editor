import type { GroupId, RowId, Signal, SignalGroup, SignalId, Transaction, TransactionId } from "@timing-chart-v2/schema";

type ClipboardDocumentIndexes = Readonly<{
  signals: readonly Signal[];
  signalGroups: readonly SignalGroup[];
  transactions: readonly Transaction[];
}>;

type SignalIndexes = Readonly<{
  signals: readonly Signal[];
  groups: readonly SignalGroup[];
  byId: ReadonlyMap<SignalId, Signal>;
  order: ReadonlyMap<SignalId, number>;
  owner: ReadonlyMap<SignalId, Readonly<{ groupId: GroupId; index: number }>>;
  groupsById: ReadonlyMap<GroupId, SignalGroup>;
}>;

type TransactionIndexes = Readonly<{
  transactions: readonly Transaction[];
  byId: ReadonlyMap<TransactionId, Transaction>;
  order: ReadonlyMap<TransactionId, number>;
}>;

/** Reuse immutable clipboard lookup indexes until the corresponding collection changes. */
export function createClipboardIndexes() {
  let signalCache: SignalIndexes | undefined;
  let transactionCache: TransactionIndexes | undefined;
  return {
    signals(current: ClipboardDocumentIndexes): SignalIndexes {
      if (signalCache?.signals === current.signals && signalCache.groups === current.signalGroups) return signalCache;
      const byId = new Map(current.signals.map((signal) => [signal.id, signal] as const));
      const order = new Map(current.signals.map((signal, index) => [signal.id, index] as const));
      const owner = new Map<SignalId, { groupId: GroupId; index: number }>();
      for (const group of current.signalGroups) group.rows.forEach((rowId, index) => { if (byId.has(rowId as SignalId)) owner.set(rowId as SignalId, { groupId: group.id, index }); });
      signalCache = { signals: current.signals, groups: current.signalGroups, byId, order, owner, groupsById: new Map(current.signalGroups.map((group) => [group.id, group] as const)) };
      return signalCache;
    },
    transactions(current: ClipboardDocumentIndexes): TransactionIndexes {
      if (transactionCache?.transactions === current.transactions) return transactionCache;
      transactionCache = {
        transactions: current.transactions,
        byId: new Map(current.transactions.map((transaction) => [transaction.id, transaction] as const)),
        order: new Map(current.transactions.map((transaction, index) => [transaction.id, index] as const)),
      };
      return transactionCache;
    },
  };
}

/** Resolve a Group's Signal rows in canonical row order using the caller's existing ID index. */
export function resolveGroupSignalsInRowOrder(rowIds: readonly RowId[], signalsById: ReadonlyMap<SignalId, Signal>): readonly Signal[] {
  const signals: Signal[] = [];
  for (const rowId of rowIds) {
    const signal = signalsById.get(rowId as SignalId);
    if (signal !== undefined) signals.push(signal);
  }
  return signals;
}

/** Resolve a clipboard insertion target through the caller's existing ID indexes. */
export function resolveClipboardSignalGroupTarget(input: {
  readonly groups: readonly SignalGroup[];
  readonly groupsById: ReadonlyMap<GroupId, SignalGroup>;
  readonly ownerBySignalId: ReadonlyMap<SignalId, Readonly<{ groupId: GroupId; index: number }>>;
  readonly selectedGroupId?: GroupId;
  readonly selectedSignalId?: SignalId;
  readonly sourceGroupId?: GroupId;
  readonly fallbackToLast?: boolean;
}): SignalGroup | undefined {
  const selectedGroup = input.selectedGroupId === undefined ? undefined : input.groupsById.get(input.selectedGroupId);
  if (selectedGroup) return selectedGroup;
  const selectedOwner = input.selectedSignalId === undefined ? undefined : input.ownerBySignalId.get(input.selectedSignalId);
  const signalGroup = selectedOwner === undefined ? undefined : input.groupsById.get(selectedOwner.groupId);
  if (signalGroup) return signalGroup;
  const sourceGroup = input.sourceGroupId === undefined ? undefined : input.groupsById.get(input.sourceGroupId);
  return sourceGroup ?? (input.fallbackToLast === false ? undefined : input.groups.at(-1));
}
