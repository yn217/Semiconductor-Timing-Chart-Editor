import { useState } from "react";

const inspectorAccordionState = new Map<string, Readonly<Record<string, boolean>>>();

export function useInspectorAccordion(scope: string, defaults: Readonly<Record<string, boolean>>) {
  const [state, setState] = useState<Readonly<Record<string, boolean>>>(() => inspectorAccordionState.get(scope) ?? defaults);
  const toggle = (section: string) => setState((current) => {
    const next = { ...current, [section]: !current[section] };
    inspectorAccordionState.set(scope, next);
    return next;
  });
  return { state, toggle };
}
