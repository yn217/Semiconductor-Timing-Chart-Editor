import type { Signal, SignalId } from "@timing-chart-v2/schema";

/** Copy a Signal as a new entity and remap every nested stable change-point identity. */
export function copySignalWithFreshValueChangeIds(
  source: Signal,
  id: SignalId,
  allocateValueChangeId: () => string,
): Signal {
  if (source.type === "commentRow") return { ...source, id };
  if (source.type === "clock") {
    return {
      ...source,
      id,
      ...(source.enable === undefined ? {} : {
        enable: source.enable.map((change) => ({ ...change, id: allocateValueChangeId() })),
      }),
    };
  }
  return {
    ...source,
    id,
    values: source.values.map((change) => ({ ...change, id: allocateValueChangeId() })),
  };
}
