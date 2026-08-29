export interface GoldenContractMeta {
  readonly file: string;
  readonly title: string;
  readonly cycles?: number;
  readonly signalCount?: number;
  readonly transactionCount?: number;
  readonly coverage: readonly string[];
}

export interface GoldenObservedCounts {
  readonly cycles: number;
  readonly signals: number;
  readonly transactions: number;
}

export function assertGoldenSemanticContract(meta: GoldenContractMeta, observed: GoldenObservedCounts): void {
  if (meta.cycles !== undefined && observed.cycles !== meta.cycles) throw new Error(`${meta.file}: expected ${meta.cycles} cycles, received ${observed.cycles}`);
  if (meta.signalCount !== undefined && observed.signals !== meta.signalCount) throw new Error(`${meta.file}: expected ${meta.signalCount} signals, received ${observed.signals}`);
  if (meta.transactionCount !== undefined && observed.transactions !== meta.transactionCount) throw new Error(`${meta.file}: expected ${meta.transactionCount} transactions, received ${observed.transactions}`);
}

export function assertGoldenSvgContract(meta: GoldenContractMeta, svg: string): void {
  if (!svg.includes(meta.title)) throw new Error(`${meta.file}: exported SVG is missing the sample title.`);
  if (!svg.includes('data-export-scene="v2"')) throw new Error(`${meta.file}: exported SVG is missing the V2 export scene marker.`);
  if (meta.signalCount !== undefined) {
    const signals = (svg.match(/data-signal-id=/g) ?? []).length;
    if (signals < meta.signalCount) throw new Error(`${meta.file}: exported SVG contains ${signals} signals; expected at least ${meta.signalCount}.`);
  }
  if (meta.transactionCount !== undefined && meta.transactionCount > 0) {
    const transactions = (svg.match(/data-transaction-id=/g) ?? []).length;
    if (transactions !== meta.transactionCount) throw new Error(`${meta.file}: exported SVG contains ${transactions} transactions; expected ${meta.transactionCount}.`);
  }
}
