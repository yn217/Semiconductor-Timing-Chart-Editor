import type { KeyboardEvent, MutableRefObject } from "react";
import { LEFT_PANE_MIN_WIDTH, type BottomTab, type ViewMode, type WorkspacePreset } from "../workspace/use-workspace-ui-state.js";

export function useEditorWorkspaceActions(input: {
  readonly workspacePreset: WorkspacePreset;
  readonly setWorkspacePreset: (value: WorkspacePreset) => void;
  readonly waveformRestoreRef: MutableRefObject<{ readonly inspectorVisible: boolean; readonly bottomVisible: boolean; readonly preset: Exclude<WorkspacePreset, "waveform"> } | undefined>;
  readonly inspectorVisible: boolean;
  readonly setInspectorVisible: (value: boolean) => void;
  readonly bottomVisible: boolean;
  readonly setBottomVisible: (value: boolean) => void;
  readonly setViewMode: (value: ViewMode) => void;
  readonly setBottomTab: (value: BottomTab) => void;
  readonly setSignalTreeVisible: (value: boolean) => void;
  readonly setLeftPaneWidth: (value: number) => void;
  readonly setFrozenPaneWidth: (value: number) => void;
  readonly setInspectorWidth: (value: number) => void;
  readonly setBottomHeight: (value: number) => void;
  readonly bottomTabs: readonly BottomTab[];
}) {
  const applyWorkspacePreset = (preset: WorkspacePreset) => {
    if (preset === "waveform") {
      if (input.workspacePreset !== "waveform") input.waveformRestoreRef.current = { inspectorVisible: input.inspectorVisible, bottomVisible: input.bottomVisible, preset: input.workspacePreset };
      input.setWorkspacePreset(preset);
      input.setInspectorVisible(false);
      input.setBottomVisible(false);
      return;
    }
    input.setWorkspacePreset(preset);
    if (input.workspacePreset === "waveform" && preset === "edit") {
      const restored = input.waveformRestoreRef.current;
      input.waveformRestoreRef.current = undefined;
      const restoredPreset = restored?.preset ?? "edit";
      input.setWorkspacePreset(restoredPreset);
      input.setInspectorVisible(restored?.inspectorVisible ?? true);
      input.setBottomVisible(restored?.bottomVisible ?? true);
      if (restoredPreset === "review") input.setBottomTab("Problems");
      else if (restoredPreset === "transaction") { input.setViewMode("Transaction"); input.setBottomTab("Transaction"); }
      else input.setBottomTab("Signal");
      return;
    } else {
      input.waveformRestoreRef.current = undefined;
      input.setInspectorVisible(true);
      input.setBottomVisible(true);
    }
    if (preset === "review") input.setBottomTab("Problems");
    else if (preset === "transaction") { input.setViewMode("Transaction"); input.setBottomTab("Transaction"); }
    else input.setBottomTab("Signal");
  };
  const resetWorkspaceLayout = () => {
    input.waveformRestoreRef.current = undefined;
    input.setWorkspacePreset("edit");
    input.setViewMode("Cycle");
    input.setBottomTab("Signal");
    input.setSignalTreeVisible(true);
    input.setInspectorVisible(true);
    input.setBottomVisible(true);
    input.setLeftPaneWidth(LEFT_PANE_MIN_WIDTH);
    input.setFrozenPaneWidth(209);
    input.setInspectorWidth(297);
    input.setBottomHeight(240);
  };
  const selectBottomTab = (tab: BottomTab) => input.setBottomTab(tab);
  const onBottomTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, tab: BottomTab) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft" && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    const index = input.bottomTabs.indexOf(tab);
    const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? input.bottomTabs.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + input.bottomTabs.length) % input.bottomTabs.length;
    const next = input.bottomTabs[nextIndex];
    if (!next) return;
    selectBottomTab(next);
    requestAnimationFrame(() => globalThis.document.querySelector<HTMLButtonElement>(`[data-bottom-tab="${next}"]`)?.focus());
  };
  return { applyWorkspacePreset, resetWorkspaceLayout, selectBottomTab, onBottomTabKeyDown } as const;
}
