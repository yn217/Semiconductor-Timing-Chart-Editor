import type { TransactionGroup } from "@timing-chart-v2/schema";

/**
 * Draft name and sort order for a new Transaction Group.
 *
 * `order` is one past the highest existing order so that deleting a Group
 * never lets a new one collide with a survivor. `name` is the lowest unused
 * "Group N", mirroring `nextSignalGroupName` for Signal Groups.
 */
export function nextTransactionGroupDraft(groups: readonly Pick<TransactionGroup, "name" | "order">[] | undefined): { name: string; order: number } {
  const list = groups ?? [];
  const order = list.reduce((max, group) => Math.max(max, group.order + 1), 0);
  const used = new Set(list.map((group) => group.name));
  let ordinal = 1;
  while (used.has(`Group ${ordinal}`)) ordinal += 1;
  return { name: `Group ${ordinal}`, order };
}

export { compareLaneIds } from "@timing-chart-v2/projection";
