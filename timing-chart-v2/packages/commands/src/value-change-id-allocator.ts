import type { SignalValueChange } from "@timing-chart-v2/schema";

export interface ValueChangeIdIndex {
  readonly usedIds: ReadonlySet<string>;
  readonly nextSequence: number;
}

export interface ValueChangeIdAllocation {
  readonly id: string;
  readonly nextIndex: ValueChangeIdIndex;
  /** Existing IDs visited while building a cold index; zero on a cache hit. */
  readonly valuesVisited: number;
}

/** Reuses ID indexes while immutable Signal values arrays remain reachable. */
export class ValueChangeIdAllocator {
  readonly #indexByValues = new WeakMap<readonly SignalValueChange[], Map<string, ValueChangeIdIndex>>();

  getIndex(signalId: string, values: readonly SignalValueChange[]): ValueChangeIdIndex | undefined {
    return this.#indexByValues.get(values)?.get(signalId);
  }

  remember(signalId: string, values: readonly SignalValueChange[], index: ValueChangeIdIndex): void {
    const indexes = this.#indexByValues.get(values) ?? new Map<string, ValueChangeIdIndex>();
    indexes.set(signalId, index);
    this.#indexByValues.set(values, indexes);
  }

  allocate(signalId: string, values: readonly SignalValueChange[]): ValueChangeIdAllocation {
    let index = this.getIndex(signalId, values);
    let valuesVisited = 0;
    if (!index) {
      const usedIds = new Set<string>();
      for (const change of values) {
        valuesVisited += 1;
        if (change.id) usedIds.add(change.id);
      }
      let nextSequence = 0;
      while (usedIds.has(`value_${signalId}_${nextSequence}`)) nextSequence += 1;
      index = { usedIds, nextSequence };
      this.remember(signalId, values, index);
    }

    let sequence = index.nextSequence;
    while (index.usedIds.has(`value_${signalId}_${sequence}`)) sequence += 1;
    return {
      id: `value_${signalId}_${sequence}`,
      nextIndex: { usedIds: index.usedIds, nextSequence: sequence + 1 },
      valuesVisited,
    };
  }
}

export const valueChangeIdAllocator = new ValueChangeIdAllocator();
