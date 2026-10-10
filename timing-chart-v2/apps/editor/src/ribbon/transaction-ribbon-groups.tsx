import type { CanonicalDocument, Transaction, TransactionGroup, TransactionId } from "@timing-chart-v2/schema";
import type { EditorSurfaceCommandController } from "../application/editor-surface-command-controller.js";
import { nextTransactionGroupDraft } from "../application/transaction-group-naming.js";
import { nextEntityId } from "../entity-id.js";
import { TransactionTimeScalePanel } from "../transaction-time-scale-panel.js";
import type { RibbonGroupSpec } from "../ribbon-schema.js";
import type { ActiveContext } from "../workspace/use-workspace-ui-state.js";

export type TransactionRibbonContext = Readonly<{
  document: CanonicalDocument;
  range: { readonly start: number; readonly end: number };
  commands: EditorSurfaceCommandController;
  selectedTransactionId: TransactionId | undefined;
  selectedTransaction: Transaction | undefined;
  onTransactionCreated: (id: TransactionId) => void;
  viewMode: "Cycle" | "Transaction" | "Split";
  activeContext: ActiveContext;
  cyclesPerTc: number;
  onCyclesPerTcChange: (value: number) => void;
}>;

/**
 * Home Ribbon groups owned by the Transaction domain (#615): Create/Duplicate, and, only while the
 * Transaction pane is the active context, Group and Time Scale. Signal-domain groups live in the
 * Ribbon itself; the two are merged by composeRibbon.
 */
export function buildTransactionRibbonGroups(context: TransactionRibbonContext): readonly RibbonGroupSpec[] {
  const { document, range, commands, selectedTransactionId, selectedTransaction, onTransactionCreated, viewMode, activeContext, cyclesPerTc, onCyclesPerTcChange } = context;
  const addTransaction = () => {
    const id = nextEntityId("transaction", document) as TransactionId;
    const result = commands.createTransaction({ id, name: `Transaction ${document.transactions.length + 1}`, start: range.start, end: Math.max(range.start + 1, Math.min(document.timeline.cycleCount, range.end)), laneId: "lane_0" });
    if (result.ok) onTransactionCreated(id);
  };
  const duplicateTransaction = () => {
    const source = selectedTransaction;
    if (!source) return;
    const id = nextEntityId("transaction", document) as TransactionId;
    const result = commands.duplicateTransaction({ ...source, id, name: `${source.name} Copy` });
    if (result.ok) onTransactionCreated(id);
  };
  // #397 Transaction Mode GUI Closure Section 8: Ribbon-level parity for the
  // Group header's own "Ungroup" button -- lets the user act on the
  // selected Transaction's Group without hunting for the small header
  // control, using the same already-existing `transactionGroup.delete`
  // command (atomically ungroups every member Transaction).
  const selectedTransactionGroupId = selectedTransaction?.groupId;
  const ungroupSelectedTransaction = () => {
    if (selectedTransactionGroupId !== undefined) commands.deleteTransactionGroup(selectedTransactionGroupId);
  };
  // #429 Ribbon cleanup: parity for the Left Tree's own "+" Add Group
  // button -- same `transactionGroup.create` command/ID generation.
  const addTransactionGroup = () => {
    const id = nextEntityId("transactionGroup", document) as TransactionGroup["id"];
    commands.createTransactionGroup({ id, ...nextTransactionGroupDraft(document.transactionGroups) });
  };
  return [
    {
      // #429 Ribbon cleanup: this one "Transaction" group used to mix
      // Transaction/Group/Time Scale commands with no visual distinction --
      // split into three coherently-captioned groups (Transaction/Group/
      // Time) over the same already-existing commands, no new model.
      id: "transaction", majorGroup: "Transaction", caption: "Transaction", items: [
        { kind: "button", id: "transaction-create", icon: "i-plus", label: "Create", ariaLabel: "Create Transaction", onClick: addTransaction },
        // #439: "wide" -- see the Clipboard group's "Duplicate" above.
        { kind: "button", id: "transaction-duplicate", icon: "i-duplicate", label: "Duplicate", ariaLabel: "Duplicate Transaction", size: "wide", onClick: duplicateTransaction, disabled: !selectedTransactionId },
      ],
    },
    ...(viewMode === "Transaction" || (viewMode === "Split" && activeContext === "Transaction") ? [{
      id: "transaction-group", majorGroup: "Group", caption: "Group", items: [
        { kind: "button", id: "transaction-group-add", icon: "i-plus", label: "Add", ariaLabel: "Add Transaction Group", onClick: addTransactionGroup },
        { kind: "button", id: "transaction-ungroup", icon: "i-ungroup", label: "Ungroup", ariaLabel: "Ungroup selected Transaction", title: "Remove the selected Transaction's Group (keeps the Transaction, ungrouped)", onClick: ungroupSelectedTransaction, disabled: selectedTransactionGroupId === undefined },
      ],
    } as const] : []),
    ...(viewMode === "Transaction" || (viewMode === "Split" && activeContext === "Transaction") ? [{
      id: "transaction-time", majorGroup: "Transaction Time", caption: "Time Scale", items: [
        { kind: "custom", id: "transaction-time-scale", render: () => <TransactionTimeScalePanel key="transaction-time-scale" document={document} cyclesPerTc={cyclesPerTc} onChangeCyclesPerTc={onCyclesPerTcChange} onSetScale={commands.setTransactionTimeScale} /> },
      ],
    } as const] : []),
  ];
}
