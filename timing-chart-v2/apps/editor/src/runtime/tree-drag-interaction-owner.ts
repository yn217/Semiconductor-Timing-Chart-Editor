import type { SemanticCommand } from "@timing-chart-v2/commands";
import type { CanonicalDocument, GroupId, RowId, SignalId, SpacerId } from "@timing-chart-v2/schema";
import { nextCommandId } from "../command-id.js";

type Dragged = Readonly<{ kind: "signal" | "spacer" | "group"; id: string }>;

export type TreeDragInteractionContext = Readonly<{
  rendererHost: HTMLElement;
  getDocument: () => CanonicalDocument;
  execute: (command: SemanticCommand) => void;
}>;

/** Owns Signal/Group Left Tree drag-and-drop: drag state, hover-target drop
 * position, drop validation, and the semantic reorder command commit.
 * `dragover` only ever mutates presentation dataset flags; a canonical
 * mutation happens exactly once, on a valid `drop`. */
export class TreeDragInteractionOwner {
  #dragged: Dragged | undefined;

  constructor(private readonly context: TreeDragInteractionContext) {}

  get active(): boolean { return this.#dragged !== undefined; }

  private clearDropState(): void {
    for (const element of this.context.rendererHost.querySelectorAll<HTMLElement>("[data-drop-position], [data-dragging]")) {
      delete element.dataset.dropPosition;
      delete element.dataset.dragging;
      element.setAttribute("aria-grabbed", "false");
    }
  }

  onDragStart = (event: DragEvent): void => {
    const element = event.target instanceof Element ? event.target : null;
    const branch = element?.closest<HTMLElement>("[data-role='tree-branch'][draggable='true']");
    const row = element?.closest<HTMLElement>("[data-role='left-row'][data-row-id]");
    if (branch?.dataset.groupId) this.#dragged = { kind: "group", id: branch.dataset.groupId };
    else if (row?.dataset.rowId) this.#dragged = { kind: row.dataset.kind === "spacer" ? "spacer" : "signal", id: row.dataset.rowId };
    else return;
    const owner = this.#dragged.kind === "group" ? branch : row;
    if (owner) {
      owner.dataset.dragging = "true";
      owner.setAttribute("aria-grabbed", "true");
    }
    event.dataTransfer?.setData("text/plain", `${this.#dragged.kind}:${this.#dragged.id}`);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
  };

  onDragOver = (event: DragEvent): void => {
    if (!this.#dragged) return;
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-role='left-row'][data-row-id]") : null;
    const groupHeader = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-role='left-group-header'][data-group-id]") : null;
    if (!target && !(this.#dragged.kind === "spacer" && groupHeader)) return;
    event.preventDefault();
    for (const row of this.context.rendererHost.querySelectorAll<HTMLElement>("[data-drop-position]")) delete row.dataset.dropPosition;
    if (!target && groupHeader) {
      groupHeader.dataset.dropPosition = "inside";
      if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
      return;
    }
    if (!target) return;
    const bounds = target.getBoundingClientRect();
    target.dataset.dropPosition = event.clientY >= bounds.top + bounds.height / 2 ? "after" : "before";
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
  };

  onDrop = (event: DragEvent): void => {
    const dragged = this.#dragged;
    if (!dragged) return;
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-role='left-row'][data-row-id]") : null;
    const groupHeader = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-role='left-group-header'][data-group-id]") : null;
    if (dragged.kind === "spacer" && groupHeader?.dataset.groupId) {
      const document = this.context.getDocument();
      const sourceGroup = document.signalGroups.find((group) => group.rows.includes(dragged.id as RowId));
      const targetGroup = document.signalGroups.find((group) => group.id === groupHeader.dataset.groupId);
      if (sourceGroup && targetGroup) {
        event.preventDefault();
        const index = sourceGroup.id === targetGroup.id ? targetGroup.rows.length - 1 : targetGroup.rows.length;
        this.context.execute({ id: nextCommandId("drag_spacer"), type: "spacer.move", spacerId: dragged.id as SpacerId, targetGroupId: targetGroup.id, index });
      }
      this.#dragged = undefined;
      this.clearDropState();
      return;
    }
    if (!target?.dataset.rowId || !target.dataset.groupId) return;
    event.preventDefault();
    const after = target.dataset.dropPosition === "after";
    const document = this.context.getDocument();
    if (dragged.kind === "signal" || dragged.kind === "spacer") {
      const sourceGroup = document.signalGroups.find((group) => group.rows.includes(dragged.id as RowId));
      const targetGroup = document.signalGroups.find((group) => group.id === target.dataset.groupId);
      if (sourceGroup && targetGroup && dragged.id !== target.dataset.rowId) {
        const sourceIndex = sourceGroup.rows.indexOf(dragged.id as SignalId);
        let index = targetGroup.rows.indexOf(target.dataset.rowId as SignalId) + (after ? 1 : 0);
        if (sourceGroup.id === targetGroup.id && sourceIndex < index) index -= 1;
        if (dragged.kind === "spacer") this.context.execute({ id: nextCommandId("drag_spacer"), type: "spacer.move", spacerId: dragged.id as SpacerId, targetGroupId: targetGroup.id, index });
        else this.context.execute({ id: nextCommandId("drag_signal"), type: "signal.move", signalId: dragged.id as SignalId, targetGroupId: targetGroup.id, index });
      }
    } else {
      const sourceIndex = document.signalGroups.findIndex((group) => group.id === dragged.id);
      const targetIndex = document.signalGroups.findIndex((group) => group.id === target.dataset.groupId);
      if (sourceIndex >= 0 && targetIndex >= 0 && sourceIndex !== targetIndex) {
        let index = targetIndex + (after ? 1 : 0);
        if (sourceIndex < index) index -= 1;
        this.context.execute({ id: nextCommandId("drag_group"), type: "group.move", groupId: dragged.id as GroupId, index });
      }
    }
    this.#dragged = undefined;
    this.clearDropState();
  };

  onDragEnd = (): void => { this.cancel(); };

  /** Drop all document-scoped drag state when Open/New replaces the document. */
  cancel = (): void => { this.#dragged = undefined; this.clearDropState(); };
}
