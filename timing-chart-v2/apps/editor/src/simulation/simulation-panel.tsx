import { useEffect, useMemo, useRef, useState } from "react";
import type { CanonicalDocument, DocumentProblem, SignalId } from "@timing-chart-v2/schema";
import { compareAuthoredTransitions, type TransitionComparisonResult } from "./transition-comparison.js";
import { importVcdTextFile } from "./vcd-file-import.js";
import { mapVcdVariablesToSignals, type VcdSignalMapping } from "./signal-mapping.js";
import type { ParsedVcdText, VcdValueChange } from "./vcd-text-parser.js";

type SimulationPanelProps = Readonly<{
  document: CanonicalDocument;
  onNavigate: (path: string, problem?: DocumentProblem) => void;
}>;

function comparisonKindLabel(result: TransitionComparisonResult): string {
  if (result.equal) return "Match";
  const counts = new Map<string, number>();
  for (const difference of result.differences) counts.set(difference.kind, (counts.get(difference.kind) ?? 0) + 1);
  return [...counts].map(([kind, count]) => `${kind}: ${count}`).join(", ");
}

function cycleNumber(numerator: bigint | undefined, denominator: bigint | undefined): number | undefined {
  if (numerator === undefined || denominator === undefined || denominator <= 0n) return undefined;
  const value = Number(numerator) / Number(denominator);
  return Number.isFinite(value) ? value : undefined;
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

  const selectedSignalId = (mapping: VcdSignalMapping, index: number): string | undefined => {
    const manual = manualSignalByVariable[index];
    if (manual && document.signals.some((signal) => signal.id === manual && signal.type !== "commentRow")) return manual;
    return mapping.status === "matched" ? mapping.signalId : undefined;
  };

  const compare = (): void => {
    if (!parsed || mappingResult?.status !== "ok") return;
    const timebase = document.timeline.physicalTimebase;
    if (!timebase) {
      setStatus("Set a Document physical reference frequency before comparing physical simulation time.");
      return;
    }
    const changesByCode = new Map<string, VcdValueChange[]>();
    for (const change of parsed.changes) {
      const changes = changesByCode.get(change.code);
      if (changes) changes.push(change);
      else changesByCode.set(change.code, [change]);
    }
    const nextResults: TransitionComparisonResult[] = [];
    mappingResult.mappings.forEach((mapping, index) => {
      const signalId = selectedSignalId(mapping, index) as SignalId | undefined;
      if (!signalId) return;
      const signal = document.signals.find((candidate) => candidate.id === signalId);
      if (!signal || signal.type === "commentRow" || signal.type === "clock") {
        nextResults.push({ signalId, equal: false, differences: [{ kind: "unsupported-value", signalId, detail: "This comparison slice supports authored Value Signals; Clock and Comment rows require a separate projection." }] });
        return;
      }
      const width = signal.type === "bus" ? signal.width ?? mapping.variable.width : 1;
      if (width !== mapping.variable.width) {
        nextResults.push({ signalId, equal: false, differences: [{ kind: "unsupported-value", signalId, detail: `Width mismatch: specification ${width}, simulation ${mapping.variable.width}.` }] });
        return;
      }
      nextResults.push(compareAuthoredTransitions(
        { signalId, vcdCode: mapping.variable.code },
        signal.values.map(({ start, value }) => ({ cycle: start, value })),
        changesByCode.get(mapping.variable.code) ?? [],
        parsed.timescale,
        timebase,
        { width, ...(signal.type === "bus" && signal.displayFormat ? { displayFormat: signal.displayFormat } : {}) },
      ));
    });
    setResults(nextResults);
    const differentCount = nextResults.filter((result) => !result.equal).length;
    setStatus(nextResults.length === 0
      ? "No signals are mapped. Resolve at least one simulation signal before comparing."
      : differentCount === 0
      ? `Compared ${nextResults.length.toLocaleString()} mapped signals: no differences.`
      : `Compared ${nextResults.length.toLocaleString()} mapped signals: ${differentCount.toLocaleString()} signal(s) have differences.`);
  };

  const unresolved = mappingResult?.status === "ok"
    ? mappingResult.mappings.filter((mapping, index) => !selectedSignalId(mapping, index))
    : [];
  const displayedDifferences = results?.flatMap((result) => result.differences.map((difference) => ({ result, difference }))).slice(0, 100) ?? [];

  return <section className="simulation-panel" data-testid="simulation-panel" aria-label="Simulation comparison">
    <header className="simulation-panel-header">
      <strong>Simulation comparison</strong>
      <label>Import VCD text <input data-testid="simulation-vcd-file" aria-label="Import VCD text file" type="file" accept=".vcd,.txt,text/plain" disabled={busy} onChange={(event) => { void importFile(event.currentTarget.files?.[0]); event.currentTarget.value = ""; }} /></label>
      {fileName && <span>{fileName}</span>}
    </header>
    <p role="status" data-testid="simulation-status">{status}</p>
    {parsed && mappingResult?.status === "ok" && <>
      <p>Exact mapping uses source hierarchy when present and exact signal names otherwise. Ambiguous mappings require an explicit selection.</p>
      <table>
        <thead><tr><th>Simulation signal</th><th>Mapping</th></tr></thead>
        <tbody>{mappingResult.mappings.map((mapping, index) => {
          const selected = selectedSignalId(mapping, index) ?? "";
          const statusText = manualSignalByVariable[index] ? "Manual" : mapping.status;
          return <tr key={`${mapping.variable.code}:${mapping.variable.hierarchicalName}:${index}`} data-vcd-mapping-status={statusText}>
            <td>{mapping.variable.hierarchicalName}</td>
            <td><select aria-label={`Map ${mapping.variable.hierarchicalName} to specification signal`} value={selected} onChange={(event) => {
              const value = event.currentTarget.value;
              setManualSignalByVariable((current) => {
                const next = { ...current };
                if (value) next[index] = value;
                else delete next[index];
                return next;
              });
              setResults(undefined);
            }}>
              <option value="">{mapping.status === "matched" ? `Auto: ${mapping.signalId}` : `Unresolved (${mapping.status})`}</option>
              {mappableSignals.map((signal) => <option key={signal.id} value={signal.id}>{signal.display.name} · {signal.id}</option>)}
            </select></td>
          </tr>;
        })}</tbody>
      </table>
      {unresolved.length > 0 && <p role="note">{unresolved.length.toLocaleString()} signal mapping(s) must be resolved before those signals can be compared.</p>}
      <button type="button" data-testid="simulation-compare" onClick={compare} disabled={busy}>Compare mapped signals</button>
      {results && <section aria-label="Simulation comparison results" data-testid="simulation-results">
        <strong>{results.filter((item) => item.equal).length} matched · {results.filter((item) => !item.equal).length} different/unsupported</strong>
        <ul>{results.filter((item) => !item.equal).map((result) => <li key={result.signalId}>{document.signals.find((signal) => signal.id === result.signalId)?.display.name ?? result.signalId}: {comparisonKindLabel(result)}</li>)}</ul>
        <table><thead><tr><th>Signal</th><th>Finding</th><th>Cycle</th><th>Action</th></tr></thead><tbody>
          {displayedDifferences.map(({ result, difference }, index) => {
            const signalIndex = document.signals.findIndex((signal) => signal.id === result.signalId);
            const exactCycle = difference.authoredCycle ?? difference.vcdCycle;
            const cycle = cycleNumber(exactCycle?.numerator, exactCycle?.denominator);
            const signal = document.signals[signalIndex];
            const problem: DocumentProblem = {
              code: `SIMULATION_${difference.kind.toUpperCase().replaceAll("-", "_")}`,
              path: signalIndex >= 0 ? `$.signals[${signalIndex}]` : "$.timeline",
              message: difference.detail ?? `${difference.kind}: specification ${difference.authoredValue ?? "—"} at ${cycleNumber(difference.authoredCycle?.numerator, difference.authoredCycle?.denominator) ?? "—"}; simulation ${difference.vcdValue ?? "—"} at ${cycleNumber(difference.vcdCycle?.numerator, difference.vcdCycle?.denominator) ?? "—"}.`,
              ...(signal ? { objectId: signal.id, objectType: "signal", objectLabel: signal.display.name } : {}),
              ...(cycle !== undefined ? { sourceCycle: cycle } : {}),
              severity: "warning",
              operation: "simulation.compare",
              source: "parser",
              stage: "validate",
              recommendation: "Review the simulation waveform and authored transition at this stable Signal and source time.",
            };
            return <tr key={`${result.signalId}:${difference.kind}:${index}`}><td>{signal?.display.name ?? result.signalId}</td><td>{difference.kind}</td><td>{cycle ?? "—"}</td><td><button type="button" onClick={() => onNavigate(problem.path, problem)}>Reveal</button></td></tr>;
          })}
        </tbody></table>
        {results.reduce((sum, result) => sum + result.differences.length, 0) > displayedDifferences.length && <p>Showing first {displayedDifferences.length} findings.</p>}
      </section>}
    </>}
    {mappingResult?.status === "resource-limit" && <p role="alert">The signal mapping exceeds the document signal limit ({mappingResult.limit.toLocaleString()}).</p>}
  </section>;
}
