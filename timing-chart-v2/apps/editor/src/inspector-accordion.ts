import { useState } from "react";

const inspectorAccordionState = new Map<string, Readonly<Record<string, boolean>>>();

/** Drop entity-keyed UI state when the canonical document generation changes. */
export function resetInspectorAccordionState(): void {
  inspectorAccordionState.clear();
}

export function useInspectorAccordion(scope: string, defaults: Readonly<Record<string, boolean>>) {
  const [state, setState] = useState<Readonly<Record<string, boolean>>>(() => inspectorAccordionState.get(scope) ?? defaults);
  const toggle = (section: string) => setState((current) => {
    const next = { ...current, [section]: !current[section] };
    inspectorAccordionState.set(scope, next);
    return next;
  });
  return { state, toggle };
}
