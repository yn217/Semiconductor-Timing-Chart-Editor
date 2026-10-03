import { describe, expect, it, vi } from "vitest";
import type { CommandResult, CanonicalDocument, Transaction, TransactionGroup } from "@timing-chart-v2/schema";
import type { EditorSurfaceCommandController } from "../../apps/editor/src/application/editor-surface-command-controller.js";
import { buildTransactionRibbonGroups } from "../../apps/editor/src/ribbon/transaction-ribbon-groups.js";
import { canonicalFixture } from "../fixtures/canonical.js";

describe("Transaction Ribbon selection lookup", () => {
  it("uses the selected stable-ID entity supplied by the indexed owner without scanning the collection", () => {
    const transaction: Transaction = {
      id: "txn_selected" as Transaction["id"],
      name: "Selected",
      start: 2,
      end: 6,
      groupId: "group_selected" as TransactionGroup["id"],
    };
    const group: TransactionGroup = { id: transaction.groupId!, name: "Selected group", order: 0 };
    const transactions = new Proxy([transaction], {
      get(target, property, receiver) {
        if (property === "find") throw new Error("Ribbon render must not scan all Transactions for the selected ID");
        return Reflect.get(target, property, receiver) as unknown;
      },
    });
    const document = { ...canonicalFixture(), transactions, transactionGroups: [group] } as CanonicalDocument;
    const deleteTransactionGroup = vi.fn(() => ({ ok: true } as CommandResult));
    const commands = { deleteTransactionGroup } as unknown as EditorSurfaceCommandController;

    const groups = buildTransactionRibbonGroups({
      document,
      range: { start: 0, end: 1 },
      commands,
      selectedTransactionId: transaction.id,
      selectedTransaction: transaction,
      onTransactionCreated: () => undefined,
      viewMode: "Transaction",
      activeContext: "Transaction",
      cyclesPerTc: 10,
      onCyclesPerTcChange: () => undefined,
    });

    const ungroup = groups.find((item) => item.id === "transaction-group")?.items.find((item) => item.id === "transaction-ungroup");
    expect(ungroup?.kind).toBe("button");
    if (ungroup?.kind !== "button") throw new Error("Ungroup command missing");
    expect(ungroup.disabled).toBe(false);
    ungroup.onClick();
    expect(deleteTransactionGroup).toHaveBeenCalledWith(group.id);
  });
});
