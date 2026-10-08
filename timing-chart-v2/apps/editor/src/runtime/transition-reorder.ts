import type { ValueSignal } from "@timing-chart-v2/schema";

export type TransitionChange = ValueSignal["values"][number];

export const transitionIdentity = (change: TransitionChange): string => {
  if (!change.id) throw new Error("Signal value changes must have a stable ID before entering editor runtime.");
  return change.id;
};

/** Reorder one contiguous selected block and rebuild starts from its original durations. */
export function reorderTransitionBlock(ordered: readonly TransitionChange[], selectedKeys: ReadonlySet<string>, targetIndex: number, cycleCount: number): { readonly values: readonly TransitionChange[]; readonly firstIndex: number; readonly blockSize: number } | undefined {
  const indexes = ordered.map((change, index) => selectedKeys.has(transitionIdentity(change)) ? index : -1).filter((index) => index >= 0);
  const first = indexes[0];
  const last = indexes.at(-1);
  if (first === undefined || last === undefined || indexes.length !== last - first + 1 || targetIndex < 0 || targetIndex >= ordered.length || (targetIndex >= first && targetIndex <= last)) return undefined;
  const durations = new Map(ordered.map((change, index) => [transitionIdentity(change), (ordered[index + 1]?.start ?? cycleCount) - change.start]));
  const block = ordered.slice(first, last + 1);
  const remainder = [...ordered.slice(0, first), ...ordered.slice(last + 1)];
  const insertion = targetIndex < first ? targetIndex : targetIndex - (last - first + 1) + 1;
  remainder.splice(insertion, 0, ...block);
  let nextStart = ordered[0]?.start ?? 0;
  const values = remainder.map((change) => {
    const duration = durations.get(transitionIdentity(change));
    const next = { ...change, start: nextStart };
    nextStart += duration !== undefined && Number.isFinite(duration) ? duration : 0;
    return next;
  });
  return { values, firstIndex: insertion, blockSize: block.length };
}
