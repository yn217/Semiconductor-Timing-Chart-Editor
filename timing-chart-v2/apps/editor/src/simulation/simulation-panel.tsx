import { useEffect, useMemo, useRef, useState } from "react";
import type { CanonicalDocument, DocumentProblem, Signal, SignalId } from "@timing-chart-v2/schema";
import { compareAuthoredTransitions, createComparisonCheckpoint, type TransitionComparisonResult } from "./transition-comparison.js";
import { importVcdTextFile } from "./vcd-file-import.js";
import { mapVcdVariablesToSignals, type VcdSignalMapping } from "./signal-mapping.js";
import type { ParsedVcdText, VcdValueChange } from "./vcd-text-parser.js";

type SimulationPanelProps = Readonly<{
  document: CanonicalDocument;
  onNavigate: (path: string, problem?: DocumentProblem) => void;
}>;

function comparisonKindLabel(result: TransitionComparisonResult): string {
  if (result.equal) return "Match";
  return Object.entries(result.differenceCounts).filter(([, count]) => count > 0).map(([kind, count]) => `${kind}: ${count}`).join(", ");
}

function unsupportedResult(signalId: SignalId, detail: string, retain: boolean): TransitionComparisonResult {
  const difference = { kind: "unsupported-value" as const, signalId, detail };
  return {
    signalId,
    equal: false,
    differences: retain ? [difference] : [],
    totalDifferenceCount: 1,
    differenceCounts: { "value-mismatch": 0, "timing-mismatch": 0, "missing-event": 0, "extra-event": 0, "unsupported-value": 1 },
  };
}

function cycleNumber(cycle: { readonly numerator: bigint; readonly denominator: bigint } | undefined): number | undefined {
  if (!cycle || cycle.denominator <= 0n) return undefined;
  const value = Number(cycle.numerator) / Number(cycle.denominator);
  return Number.isFinite(value) ? value : undefined;
}

function exactCycleLabel(cycle: { readonly numerator: bigint; readonly denominator: bigint } | undefined): string {
  if (!cycle || cycle.denominator <= 0n) return "—";
  return cycle.denominator === 1n ? `${cycle.numerator} cycles` : `${cycle.numerator}/${cycle.denominator} cycles`;
}

function* authoredTransitions(values: readonly { readonly start: number; readonly value: string | number }[]): Generator<{ cycle: number; value: string | number }> {
  for (const value of values) yield { cycle: value.start, value: value.value };
}

export function SimulationPanel({ document, onNavigate }: SimulationPanelProps) {
  const [parsed, setParsed] = useState<ParsedVcdText>();
  const [fileName, setFileName] = useState("");
  const [status, setStatus] = useState("Import a VCD text file to compare it with this document.");
  const [busy, setBusy] = useState(false);
  const [manualSignalByVariable, setManualSignalByVariable] = useState<Readonly<Record<number, string>>>({});
  const [results, setResults] = useState<readonly TransitionComparisonResult[]>();
  const abortRef = useRef<AbortController | undefined>(undefined);
  const generationRef = useRef(0);

  useEffect(() => () => {
    generationRef.current += 1;
    abortRef.current?.abort();
  }, []);
  useEffect(() => { setResults(undefined); }, [document]);

  const mappingResult = useMemo(
    () => parsed ? mapVcdVariablesToSignals(document.signals, parsed.variables) : undefined,
    [document.signals, parsed],
  );
  const mappableSignals = useMemo(
    () => document.signals.filter((signal) => signal.type !== "commentRow"),
    [document.signals],
  );
  const signalById = useMemo(() => new Map<string, Exclude<Signal, { type: "commentRow" }>>(mappableSignals.map((signal) => [signal.id, signal as Exclude<Signal, { type: "commentRow" }>])), [mappableSignals]);

  const importFile = async (file: File | undefined): Promise<void> => {
    if (!file) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const generation = ++generationRef.current;
    setBusy(true);
    setParsed(undefined);
    setResults(undefined);
    setManualSignalByVariable({});
    setFileName(file.name);
    setStatus(`Reading ${file.name}…`);
    try {
      const result = await importVcdTextFile(file, { signal: controller.signal });
      if (generation !== generationRef.current) return;
      if (!result.ok) {
        setStatus(`${result.error.code}: ${result.error.message}`);
        return;
      }
      setParsed(result.value);
      setStatus(`Loaded ${result.value.variables.length.toLocaleString()} variables and ${result.value.changes.length.toLocaleString()} value changes. This import is session-only.`);
    } finally {
      if (generation === generationRef.current) setBusy(false);
    }
  };

  const selectedSignalId = (mapping: VcdSignalMapping, index: number): SignalId | undefined => {
    const manual = manualSignalByVariable[index];
    if (manual) return signalById.has(manual) ? manual as SignalId : undefined;
    return mapping.status === "matched" ? mapping.signalId : undefined;
  };

  const compare = async (): Promise<void> => {
    if (!parsed || mappingResult?.status !== "ok") return;
    const targets = mappingResult.mappings.map((mapping, index) => selectedSignalId(mapping, index)).filter((signalId): signalId is SignalId => signalId !== undefined);
    if (new Set(targets).size !== targets.length) {
      setStatus("Each specification Signal can map to one VCD variable. Resolve duplicate mappings before comparing.");
      return;
    }
    const timebase = document.timeline.physicalTimebase;
    if (!timebase) {
      setStatus("Set a Document physical reference frequency before comparing physical simulation time.");
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const generation = ++generationRef.current;
    const isCurrent = () => generation === generationRef.current && !controller.signal.aborted;
    const checkpoint = createComparisonCheckpoint(controller.signal);
    setBusy(true);
    setResults(undefined);
    setStatus("Comparing simulation and specification…");
    try {
      const changesByCode = new Map<string, VcdValueChange[]>();
      for (const change of parsed.changes) {
        const pause = checkpoint();
        if (pause) await pause;
        const changes = changesByCode.get(change.code);
        if (changes) changes.push(change);
        else changesByCode.set(change.code, [change]);
      }
      const nextResults: TransitionComparisonResult[] = [];
      let remainingDifferenceSamples = 100;
      for (const [index, mapping] of mappingResult.mappings.entries()) {
        const pause = checkpoint();
        if (pause) await pause;
        const signalId = selectedSignalId(mapping, index) as SignalId | undefined;
        if (!signalId) continue;
        const signal = signalById.get(signalId);
        if (!signal || signal.type === "clock") {
          const result = unsupportedResult(signalId, "This comparison slice supports authored Value Signals; Clock and Comment rows require a separate projection.", remainingDifferenceSamples > 0);
          nextResults.push(result);
          remainingDifferenceSamples = Math.max(0, remainingDifferenceSamples - result.differences.length);
          continue;
        }
        const width = signal.type === "bus" ? signal.width ?? mapping.variable.width : 1;
        if (width !== mapping.variable.width) {
          const result = unsupportedResult(signalId, `Width mismatch: specification ${width}, simulation ${mapping.variable.width}.`, remainingDifferenceSamples > 0);
          nextResults.push(result);
          remainingDifferenceSamples = Math.max(0, remainingDifferenceSamples - result.differences.length);
          continue;
        }
        const comparison = await compareAuthoredTransitions(
          { signalId, vcdCode: mapping.variable.code },
          authoredTransitions(signal.values),
          changesByCode.get(mapping.variable.code) ?? [],
          parsed.timescale,
          timebase,
          { width, ...(signal.type === "bus" && signal.displayFormat ? { displayFormat: signal.displayFormat } : {}) },
          { signal: controller.signal, maxRetainedDifferences: remainingDifferenceSamples },
        );
        nextResults.push(comparison);
        remainingDifferenceSamples = Math.max(0, remainingDifferenceSamples - comparison.differences.length);
      }
      if (!isCurrent()) return;
      setResults(nextResults);
      const differentCount = nextResults.filter((result) => !result.equal).length;
      setStatus(nextResults.length === 0
        ? "No signals are mapped. Resolve at least one simulation signal before comparing."
        : differentCount === 0
        ? `Compared ${nextResults.length.toLocaleString()} mapped signals: no differences.`
        : `Compared ${nextResults.length.toLocaleString()} mapped signals: ${differentCount.toLocaleString()} signal(s) have differences.`);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      if (isCurrent()) setStatus(`Comparison failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      if (generation === generationRef.current) setBusy(false);
    }
  };

  const unresolved = mappingResult?.status === "ok"
    ? mappingResult.mappings.filter((mapping, index) => !selectedSignalId(mapping, index))
    : [];
  const selectedMappingCounts = new Map<string, number>();
  if (mappingResult?.status === "ok") mappingResult.mappings.forEach((mapping, index) => {
    const signalId = selectedSignalId(mapping, index);
    if (signalId) selectedMappingCounts.set(signalId, (selectedMappingCounts.get(signalId) ?? 0) + 1);
  });
  const duplicateMappingIds = [...selectedMappingCounts].filter(([, count]) => count > 1).map(([signalId]) => signalId);
  const displayedDifferences: { result: TransitionComparisonResult; difference: TransitionComparisonResult["differences"][number] }[] = [];
  for (const result of results ?? []) {
    for (const difference of result.differences) {
      if (displayedDifferences.length === 100) break;
      displayedDifferences.push({ result, difference });
    }
    if (displayedDifferences.length === 100) break;
  }

  return <section className="simulation-panel" data-testid="simulation-panel" aria-label="Simulation comparison">
    <header className="simulation-panel-header">
      <strong>Simulation comparison</strong>
      <label>Import VCD text <input data-testid="simulation-vcd-file" aria-label="Import VCD text file" type="file" accept=".vcd,.txt,text/plain" disabled={busy} onChange={(event) => { void importFile(event.currentTarget.files?.[0]); event.currentTarget.value = ""; }} /></label>
      {fileName && <span>{fileName}</span>}
    </header>
    <p role="status" data-testid="simulation-status">{status}</p>
    {parsed && mappingResult?.status === "ok" && <>
      <p>Exact mapping uses source hierarchy when present and exact signal names otherwise. Ambiguous mappings require an explicit selection.</p>
      {duplicateMappingIds.length > 0 && <p role="alert" data-testid="simulation-duplicate-mapping">Each specification Signal can map to one VCD variable. Resolve duplicates: {duplicateMappingIds.join(", ")}</p>}
      <datalist id="simulation-signal-options">{mappableSignals.map((signal) => <option key={signal.id} value={signal.id} label={signal.display.name} />)}</datalist>
      <table>
        <thead><tr><th>Simulation signal</th><th>Mapping</th></tr></thead>
        <tbody>{mappingResult.mappings.map((mapping, index) => {
          const selected = selectedSignalId(mapping, index) ?? "";
          const statusText = manualSignalByVariable[index] ? "Manual" : mapping.status;
          return <tr key={`${mapping.variable.code}:${mapping.variable.hierarchicalName}:${index}`} data-vcd-mapping-status={statusText}>
            <td>{mapping.variable.hierarchicalName}</td>
            <td><input type="text" list="simulation-signal-options" aria-label={`Map ${mapping.variable.hierarchicalName} to specification signal`} value={selected} disabled={busy} onChange={(event) => {
              const value = event.currentTarget.value;
              setManualSignalByVariable((current) => {
                const next = { ...current };
                if (value) next[index] = value;
                else delete next[index];
                return next;
              });
              setResults(undefined);
            }} placeholder={mapping.status === "matched" ? `Auto: ${mapping.signalId}` : "Unresolved — enter a Signal ID"} />{manualSignalByVariable[index] && !signalById.has(manualSignalByVariable[index]!) && <small role="status">Unknown Signal ID; mapping will not be compared.</small>}</td>
          </tr>;
        })}</tbody>
      </table>
      {unresolved.length > 0 && <p role="note">{unresolved.length.toLocaleString()} signal mapping(s) must be resolved before those signals can be compared.</p>}
      <button type="button" data-testid="simulation-compare" onClick={() => { void compare(); }} disabled={busy || duplicateMappingIds.length > 0}>Compare mapped signals</button>
      {busy && <button type="button" data-testid="simulation-cancel-comparison" onClick={() => {
        generationRef.current += 1;
        abortRef.current?.abort();
        setBusy(false);
        setStatus("Comparison cancelled.");
      }}>Cancel comparison</button>}
      {results && <section aria-label="Simulation comparison results" data-testid="simulation-results">
        <strong>{results.filter((item) => item.equal).length} matched · {results.filter((item) => !item.equal).length} different/unsupported</strong>
        <ul>{results.filter((item) => !item.equal).slice(0, 100).map((result) => <li key={result.signalId}>{document.signals.find((signal) => signal.id === result.signalId)?.display.name ?? result.signalId}: {comparisonKindLabel(result)}</li>)}</ul>
        <table><thead><tr><th>Signal</th><th>Finding</th><th>Specification cycle</th><th>Specification value</th><th>Simulation cycle</th><th>Simulation value</th><th>Action</th></tr></thead><tbody>
          {displayedDifferences.map(({ result, difference }, index) => {
            const signalIndex = document.signals.findIndex((signal) => signal.id === result.signalId);
            const exactCycle = difference.authoredCycle ?? difference.vcdCycle;
            const cycle = cycleNumber(exactCycle);
            const signal = document.signals[signalIndex];
            const problem: DocumentProblem = {
              code: `SIMULATION_${difference.kind.toUpperCase().replaceAll("-", "_")}`,
              path: signalIndex >= 0 ? `$.signals[${signalIndex}]` : "$.timeline",
              message: difference.detail ?? `${difference.kind}: specification ${difference.authoredValue ?? "—"} at ${exactCycleLabel(difference.authoredCycle)}; simulation ${difference.vcdValue ?? "—"} at ${exactCycleLabel(difference.vcdCycle)}.`,
              ...(signal ? { objectId: signal.id, objectType: "signal", objectLabel: signal.display.name } : {}),
              ...(cycle !== undefined ? { sourceCycle: cycle } : {}),
              severity: "warning",
              operation: "simulation.compare",
              source: "parser",
              stage: "validate",
              recommendation: "Review the simulation waveform and authored transition at this stable Signal and source time.",
            };
            return <tr key={`${result.signalId}:${difference.kind}:${index}`} data-simulation-finding={difference.kind}><td>{signal?.display.name ?? result.signalId}</td><td>{difference.kind}</td><td>{exactCycleLabel(difference.authoredCycle)}</td><td>{difference.authoredValue ?? "—"}</td><td>{exactCycleLabel(difference.vcdCycle)}</td><td>{difference.vcdValue ?? "—"}</td><td><button type="button" onClick={() => onNavigate(problem.path, problem)}>Reveal</button></td></tr>;
          })}
        </tbody></table>
        {results.reduce((sum, result) => sum + result.totalDifferenceCount, 0) > displayedDifferences.length && <p>Showing first {displayedDifferences.length} findings.</p>}
      </section>}
    </>}
    {mappingResult?.status === "resource-limit" && <p role="alert">The signal mapping exceeds the document signal limit ({mappingResult.limit.toLocaleString()}).</p>}
  </section>;
}
