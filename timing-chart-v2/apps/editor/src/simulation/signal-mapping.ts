import { DOCUMENT_RESOURCE_BUDGET, type Signal, type SignalId } from "@timing-chart-v2/schema";
import type { VcdVariable } from "./vcd-text-parser.js";

export type VcdSignalMapping = Readonly<{
  variable: VcdVariable;
  status: "matched" | "missing" | "ambiguous";
  signalId?: SignalId;
  reason?: "multiple-canonical-candidates" | "multiple-vcd-candidates";
}>;

export type VcdSignalMappingResult =
  | Readonly<{ status: "ok"; mappings: readonly VcdSignalMapping[] }>
  | Readonly<{ status: "resource-limit"; limit: number }>;

type CanonicalCandidate = Readonly<{ signal: Exclude<Signal, { type: "commentRow" }> }>;

function nameKey(name: string): string {
  return name;
}

function hierarchyKey(path: readonly string[], name: string): string {
  return JSON.stringify([path, name]);
}

function completeHierarchy(path: readonly string[], name: string): boolean {
  return path.length > 0 && path.every((part) => part.length > 0) && name.length > 0;
}

/**
 * Maps parsed VCD declarations to canonical waveform signals using exact source identity.
 * Work is O(canonical signals + VCD variables); ambiguous identities are never guessed.
 */
export function mapVcdVariablesToSignals(
  signals: readonly Signal[],
  variables: readonly VcdVariable[],
): VcdSignalMappingResult {
  const limit = DOCUMENT_RESOURCE_BUDGET.signalCount;
  if (signals.length > limit || variables.length > limit) return { status: "resource-limit", limit };

  const byName = new Map<string, CanonicalCandidate[]>();
  const byHierarchy = new Map<string, CanonicalCandidate[]>();
  const byIncompleteName = new Map<string, CanonicalCandidate[]>();
  for (const signal of signals) {
    if (signal.type === "commentRow" || signal.source.signalName.length === 0) continue;
    const hasHierarchy = completeHierarchy(signal.source.instancePath, signal.source.signalName);
    const candidate: CanonicalCandidate = { signal };
    const nameCandidates = byName.get(nameKey(signal.source.signalName)) ?? [];
    nameCandidates.push(candidate);
    byName.set(nameKey(signal.source.signalName), nameCandidates);
    if (hasHierarchy) {
      const key = hierarchyKey(signal.source.instancePath, signal.source.signalName);
      const hierarchyCandidates = byHierarchy.get(key) ?? [];
      hierarchyCandidates.push(candidate);
      byHierarchy.set(key, hierarchyCandidates);
    } else {
      const incompleteCandidates = byIncompleteName.get(nameKey(signal.source.signalName)) ?? [];
      incompleteCandidates.push(candidate);
      byIncompleteName.set(nameKey(signal.source.signalName), incompleteCandidates);
    }
  }

  const candidateCountByVariable: number[] = [];
  const uniqueCandidateByVariable: (CanonicalCandidate | undefined)[] = [];
  variables.forEach((variable) => {
    const hasHierarchy = completeHierarchy(variable.scope, variable.reference);
    const name = nameKey(variable.reference);
    const exactCandidates = hasHierarchy
      ? byHierarchy.get(hierarchyKey(variable.scope, variable.reference)) ?? []
      : byName.get(name) ?? [];
    // A complete exact hierarchy match is authoritative. Incomplete-name
    // candidates are a fallback only when no canonical signal has that full
    // hierarchy; otherwise an unrelated flat signal with the same name must
    // not turn an exact match into a false ambiguity.
    const fallbackCandidates = hasHierarchy && exactCandidates.length === 0
      ? byIncompleteName.get(name) ?? []
      : [];
    const candidateCount = exactCandidates.length + fallbackCandidates.length;
    candidateCountByVariable.push(candidateCount);
    uniqueCandidateByVariable.push(candidateCount === 1 ? (exactCandidates[0] ?? fallbackCandidates[0]) : undefined);
  });

  const vcdCandidatesBySignal = new Map<SignalId, number[]>();
  uniqueCandidateByVariable.forEach((candidate, variableIndex) => {
    if (!candidate) return;
    const signalId = candidate.signal.id;
    const indexes = vcdCandidatesBySignal.get(signalId) ?? [];
    indexes.push(variableIndex);
    vcdCandidatesBySignal.set(signalId, indexes);
  });

  const mappings = variables.map((variable, index): VcdSignalMapping => {
    const candidateCount = candidateCountByVariable[index]!;
    if (candidateCount === 0) return { variable, status: "missing" };
    if (candidateCount > 1) {
      return { variable, status: "ambiguous", reason: "multiple-canonical-candidates" };
    }
    const signal = uniqueCandidateByVariable[index]!.signal;
    if ((vcdCandidatesBySignal.get(signal.id)?.length ?? 0) > 1) {
      return { variable, status: "ambiguous", reason: "multiple-vcd-candidates" };
    }
    return { variable, status: "matched", signalId: signal.id };
  });

  return { status: "ok", mappings };
}
