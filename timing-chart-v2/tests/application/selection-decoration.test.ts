import { describe, expect, it } from "vitest";
import { applySelectionDecorationToHost } from "../../apps/editor/src/application/selection-decoration.js";
import type { SelectionState } from "../../apps/editor/src/application/use-selection-owner.js";

function mountedSignalRow(id: string) {
  const attributes = new Map<string, string>();
  const row = { dataset: { rowId: id }, setAttribute: (name: string, value: string) => attributes.set(name, value) };
  return { row, attributes };
}

function hostWithRows(...rows: ReturnType<typeof mountedSignalRow>[]) {
  return {
    dataset: {} as DOMStringMap,
    querySelectorAll: (selector: string) => selector === "[data-row-id], [data-signal-id]" ? rows.map(({ row }) => row) : [],
    querySelector: () => null,
  } as unknown as HTMLElement;
}

describe("stable-ID selection decoration after presentation remount", () => {
  it("reapplies selected and accessible state to a new row without a selection change", () => {
    const selection = {
      signalId: "sig_clock", signalIds: new Set(["sig_clock"]), groupId: undefined, spacerId: undefined,
      annotationId: undefined, annotationIds: new Set(), transactionId: undefined, legendSelected: false, transactionIds: new Set(),
    } as unknown as SelectionState;
    const first = mountedSignalRow("sig_clock");
    applySelectionDecorationToHost(hostWithRows(first), selection);
    expect(first.row.dataset.selected).toBe("true");

    // Model a mode owner replacing the DOM node while canonical selection remains the exact same object.
    const remounted = mountedSignalRow("sig_clock");
    const remountedHost = hostWithRows(remounted);
    applySelectionDecorationToHost(remountedHost, selection, selection);
    expect(remounted.row.dataset.selected).toBe("true");
    expect(remounted.attributes.get("aria-selected")).toBe("true");
    expect(remountedHost.dataset.selectedSignalId).toBe("sig_clock");
  });
});
