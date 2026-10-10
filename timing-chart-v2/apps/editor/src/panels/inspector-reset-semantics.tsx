import { useEffect, useRef, useState } from "react";
import type { ResetSemantics, ValueSignal } from "@timing-chart-v2/schema";
import type { EditorSurfaceCommandController } from "../application/editor-surface-command-controller.js";
import { InspectorSection, PropertyToggle } from "../inspector-section.js";

type ResetDraft = {
  enabled: boolean;
  polarity: ResetSemantics["polarity"];
  synchronization: ResetSemantics["synchronization"];
  assertCycle: string;
  deassertCycle: string;
};

function draftFor(signal: ValueSignal): ResetDraft {
  return {
    enabled: signal.resetSemantics !== undefined,
    polarity: signal.resetSemantics?.polarity ?? "active-low",
    synchronization: signal.resetSemantics?.synchronization ?? "asynchronous",
    assertCycle: signal.resetSemantics?.assertCycle !== undefined ? String(signal.resetSemantics.assertCycle) : "",
    deassertCycle: signal.resetSemantics?.deassertCycle !== undefined ? String(signal.resetSemantics.deassertCycle) : "",
  };
}

export function InspectorResetSemantics({ signal, commands, open, onToggle }: {
  readonly signal: ValueSignal;
  readonly commands: EditorSurfaceCommandController;
  readonly open: boolean;
  readonly onToggle: () => void;
}) {
  const [draft, setDraft] = useState(() => draftFor(signal));
  const [status, setStatus] = useState("");
  const base = useRef(draftFor(signal));
  useEffect(() => {
    const next = draftFor(signal);
    const previous = base.current;
    setDraft((current) => {
      if (current.enabled === previous.enabled) current = { ...current, enabled: next.enabled };
      if (current.polarity === previous.polarity) current = { ...current, polarity: next.polarity };
      if (current.synchronization === previous.synchronization) current = { ...current, synchronization: next.synchronization };
      if (current.assertCycle === previous.assertCycle) current = { ...current, assertCycle: next.assertCycle };
      if (current.deassertCycle === previous.deassertCycle) current = { ...current, deassertCycle: next.deassertCycle };
      return current;
    });
    base.current = next;
  }, [signal.id, signal.resetSemantics]);
  const committed: ResetSemantics | undefined = draft.enabled ? {
    polarity: draft.polarity,
    synchronization: draft.synchronization,
    ...(draft.assertCycle.trim() === "" ? {} : { assertCycle: Number(draft.assertCycle) }),
    ...(draft.deassertCycle.trim() === "" ? {} : { deassertCycle: Number(draft.deassertCycle) }),
  } : undefined;
  const changed = JSON.stringify(committed) !== JSON.stringify(signal.resetSemantics);
  const apply = () => {
    const result = commands.updateResetSemantics(signal.id, committed);
    setStatus(!result.ok && result.reason !== "no-op" ? result.problems[0]?.message ?? "Could not apply Reset semantics." : "");
  };
  const update = <K extends keyof ResetDraft>(key: K, value: ResetDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setStatus("");
  };

  return <InspectorSection sectionId="reset-semantics" title="Reset Semantics" open={open} onToggle={onToggle}>
    <PropertyToggle label="Enabled" ariaLabel="Reset semantics enabled" checked={draft.enabled} onChange={(value) => update("enabled", value)} />
    {draft.enabled && <>
      <label>Polarity<select aria-label="Reset polarity" value={draft.polarity} onChange={(event) => update("polarity", event.target.value as ResetSemantics["polarity"])}><option value="active-low">Active Low</option><option value="active-high">Active High</option></select></label>
      <label>Synchronization<select aria-label="Reset synchronization" value={draft.synchronization} onChange={(event) => update("synchronization", event.target.value as ResetSemantics["synchronization"])}><option value="asynchronous">Async</option><option value="synchronous">Sync</option></select></label>
      <div className="inspector-property-pair">
        <label>Assert Cycle<input aria-label="Reset assert cycle" type="number" min="0" step="1" value={draft.assertCycle} onChange={(event) => update("assertCycle", event.target.value)} /></label>
        <label>Deassert Cycle<input aria-label="Reset deassert cycle" type="number" min="0" step="1" value={draft.deassertCycle} onChange={(event) => update("deassertCycle", event.target.value)} /></label>
      </div>
    </>}
    {status && <div className="editor-problem" role="alert">{status}</div>}
    <button type="button" data-testid="apply-reset-semantics" disabled={!changed} onClick={apply}>Apply Reset Semantics</button>
  </InspectorSection>;
}
