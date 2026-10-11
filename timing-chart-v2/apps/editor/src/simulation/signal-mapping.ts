import { DOCUMENT_RESOURCE_BUDGET, type Signal, type SignalId } from "@timing-chart-v2/schema";
import type { VcdVariable } from "./vcd-text-parser.js";

export type VcdSignalMapping = Readonly<{
  variable: VcdVariable;
  status: "matched" | "missing" | "ambiguous";
  signalId?: SignalId;
  candidateSignalIds: readonly SignalId[];
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

  const candidateSetsByIdentity = new Map<string, readonly CanonicalCandidate[]>();
  const candidatesByVariable = variables.map((variable) => {
    const hasHierarchy = completeHierarchy(variable.scope, variable.reference);
    const identityKey = hierarchyKey(hasHierarchy ? variable.scope : [], variable.reference);
    const existing = candidateSetsByIdentity.get(identityKey);
    if (existing) return existing;

    const name = nameKey(variable.reference);
    const nameCandidates = byName.get(name) ?? [];
    let candidates: readonly CanonicalCandidate[];
    if (!hasHierarchy) {
      candidates = nameCandidates;
    } else {
      const exactHierarchy = byHierarchy.get(hierarchyKey(variable.scope, variable.reference)) ?? [];
      const fallbackCandidates = byIncompleteName.get(name) ?? [];
      candidates = exactHierarchy.length === 0
        ? fallbackCandidates
        : fallbackCandidates.length === 0
          ? exactHierarchy
          : [...exactHierarchy, ...fallbackCandidates];
    }
    candidateSetsByIdentity.set(identityKey, candidates);
    return candidates;
  });

  const vcdCandidatesBySignal = new Map<SignalId, number[]>();
  candidatesByVariable.forEach((candidates, variableIndex) => {
    if (candidates.length !== 1) return;
    const signalId = candidates[0]!.signal.id;
    const indexes = vcdCandidatesBySignal.get(signalId) ?? [];
    indexes.push(variableIndex);
    vcdCandidatesBySignal.set(signalId, indexes);
  });

  const candidateIdsBySet = new WeakMap<readonly CanonicalCandidate[], readonly SignalId[]>();
  const mappings = variables.map((variable, index): VcdSignalMapping => {
    const candidates = candidatesByVariable[index]!;
    let candidateSignalIds = candidateIdsBySet.get(candidates);
    if (!candidateSignalIds) {
      candidateSignalIds = candidates.map(({ signal }) => signal.id);
      candidateIdsBySet.set(candidates, candidateSignalIds);
    }
    if (candidates.length === 0) return { variable, status: "missing", candidateSignalIds };
    if (candidates.length > 1) {
      return { variable, status: "ambiguous", candidateSignalIds, reason: "multiple-canonical-candidates" };
    }
    const signal = candidates[0]!.signal;
    if ((vcdCandidatesBySignal.get(signal.id)?.length ?? 0) > 1) {
      return { variable, status: "ambiguous", candidateSignalIds, reason: "multiple-vcd-candidates" };
    }
    return { variable, status: "matched", signalId: signal.id, candidateSignalIds };
  });

  return { status: "ok", mappings };
}
