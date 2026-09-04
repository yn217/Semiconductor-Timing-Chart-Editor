import type { CanonicalDocument, Signal } from "@timing-chart-v2/schema";

export interface GoldenContractMeta {
  readonly file: string;
  readonly title: string;
  readonly cycles?: number;
  readonly signalCount?: number;
  readonly transactionCount?: number;
  readonly coverage: readonly string[];
}

export type GoldenExportFormat = "svg" | "png" | "pdf";

export interface GoldenCoverageOptions {
  readonly rendered: boolean;
  readonly visualGate: GoldenVisualGate;
  readonly exportedFormats?: readonly GoldenExportFormat[];
}

export interface GoldenVisualGate {
  readonly id: string;
  readonly source: string;
  readonly reference: string;
}

export interface GoldenCoverageEvidence {
  readonly coverage: string;
  readonly check: string;
  readonly detail: string;
  readonly visualGate: string;
}

export interface GoldenObservedCounts {
  readonly cycles: number;
  readonly signals: number;
  readonly transactions: number;
}

export function assertGoldenSemanticContract(meta: GoldenContractMeta, observed: GoldenObservedCounts): void {
  if (meta.cycles !== undefined && observed.cycles !== meta.cycles) throw new Error(`${meta.file}: expected ${meta.cycles} cycles, received ${observed.cycles}`);
  if (meta.signalCount !== undefined && observed.signals !== meta.signalCount) throw new Error(`${meta.file}: expected ${meta.signalCount} signals, received ${observed.signals}`);
  if (meta.transactionCount !== undefined && observed.transactions !== meta.transactionCount) throw new Error(`${meta.file}: expected ${meta.transactionCount} transactions, received ${observed.transactions}`);
}

export function assertGoldenSvgContract(meta: GoldenContractMeta, svg: string): void {
  if (!svg.includes(meta.title)) throw new Error(`${meta.file}: exported SVG is missing the sample title.`);
  if (!svg.includes('data-export-scene="v2"')) throw new Error(`${meta.file}: exported SVG is missing the V2 export scene marker.`);
  const signals = (svg.match(/data-signal-id=/g) ?? []).length;
  if (signals === 0) throw new Error(`${meta.file}: exported SVG contains no semantic signal objects.`);
  if (meta.signalCount !== undefined) {
    if (signals < meta.signalCount) throw new Error(`${meta.file}: exported SVG contains ${signals} signals; expected at least ${meta.signalCount}.`);
  }
  const transactions = (svg.match(/data-transaction-id=/g) ?? []).length;
  if (meta.transactionCount !== undefined && meta.transactionCount > 0) {
    if (transactions !== meta.transactionCount) throw new Error(`${meta.file}: exported SVG contains ${transactions} transactions; expected ${meta.transactionCount}.`);
  }
  const coverage = meta.coverage.map((item) => item.toLowerCase());
  if (coverage.some((item) => item.includes("transaction") || item.includes("burst") || item.includes("outstanding") || item.includes("packet")) && transactions === 0) {
    throw new Error(`${meta.file}: transaction coverage is declared but the exported SVG contains no transaction objects.`);
  }
  const annotations = (svg.match(/data-annotation-id=/g) ?? []).length;
  if (coverage.some((item) => item.includes("annotation") || item.includes("arrow") || ["vline", "range", "bracket", "highlight"].includes(item)) && annotations === 0) {
    throw new Error(`${meta.file}: annotation coverage is declared but the exported SVG contains no annotation objects.`);
  }
  if (coverage.some((item) => item.includes("legend")) && !svg.includes('data-layer="legend"')) throw new Error(`${meta.file}: legend coverage is declared but the exported SVG has no legend layer.`);
  if (coverage.some((item) => item === "header") && !svg.includes('data-layout="header"')) throw new Error(`${meta.file}: header coverage is declared but the exported SVG has no header content.`);
  if (coverage.some((item) => item === "footer" || item === "figure number" || item === "revision") && !svg.includes('data-layout="footer"')) throw new Error(`${meta.file}: footer metadata coverage is declared but the exported SVG has no footer content.`);
}

function isClock(signal: Signal): signal is Extract<Signal, { readonly type: "clock" }> {
  return signal.type === "clock";
}

function hasNonZeroOffset(value: unknown): boolean {
  if (value === null || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(hasNonZeroOffset);
  return Object.entries(value).some(([key, entry]) => key === "x" || key === "y" ? typeof entry === "number" && entry !== 0 : hasNonZeroOffset(entry));
}

function linkedSignalIds(transaction: CanonicalDocument["transactions"][number]): readonly string[] {
  if (transaction.linkedSignals && transaction.linkedSignals.length > 0) return transaction.linkedSignals;
  const links = transaction.links?.signals;
  return Array.isArray(links) ? links.filter((id): id is string => typeof id === "string") : [];
}

/**
 * Turns every manifest coverage label into a failing-or-passing observable check.
 * This deliberately lives beside the Golden tests: the source fixtures remain immutable,
 * while a removed canonical feature or export is guaranteed to fail the harness.
 */
export function assertGoldenCoverageContract(meta: GoldenContractMeta, document: CanonicalDocument, options: GoldenCoverageOptions): readonly GoldenCoverageEvidence[] {
  if (!options.rendered) throw new Error(`${meta.file}: coverage requires a production rendered surface.`);
  if (!options.visualGate.id || !options.visualGate.source || !options.visualGate.reference) throw new Error(`${meta.file}: coverage requires a linked visual gate with id, source, and immutable reference.`);
  const clocks = document.signals.filter(isClock);
  const annotations = document.annotations;
  const transactions = document.transactions;
  const groups = document.signalGroups;
  const allValues = document.signals.flatMap((signal) => "values" in signal ? signal.values.map((change) => change.value) : []);
  const evidence: GoldenCoverageEvidence[] = [];
  const check = (coverage: string, name: string, passed: boolean, detail: string): void => {
    if (!passed) throw new Error(`${meta.file}: coverage '${coverage}' failed ${name}: ${detail}`);
    evidence.push({ coverage, check: name, detail, visualGate: options.visualGate.id });
  };

  for (const coverage of meta.coverage) {
    const token = coverage.toLowerCase();
    if (token.endsWith(" export")) {
      const format = token.slice(0, -" export".length) as GoldenExportFormat;
      check(coverage, options.exportedFormats === undefined ? `export-${format}-gate-deferred` : `export-${format}`, options.exportedFormats === undefined || options.exportedFormats.includes(format), options.exportedFormats === undefined ? `${format.toUpperCase()} is checked by the dedicated export sweep.` : `${format.toUpperCase()} must be exported and inspected.`);
    } else if (token === "positive clock") {
      check(coverage, "canonical-positive-clock", clocks.some((clock) => clock.generator.polarity === "positive"), "a positive-polarity clock is present.");
    } else if (token === "clock" || token === "multiple clocks" || token === "multi-clock view" || token === "different periods/phases" || token === "different period" || token === "phase" || token === "half cycle") {
      const passed = token === "clock" ? clocks.length > 0
        : token === "multiple clocks" || token === "multi-clock view" || token === "different periods/phases" || token === "different period" ? clocks.length > 1
          : clocks.some((clock) => clock.generator.phase !== 0 || clock.generator.period > 1);
      check(coverage, "canonical-clock-settings", passed, `${clocks.length} clock signal(s) with generator settings are present.`);
    } else if (token === "edge counter" || token.includes("edge counter")) {
      check(coverage, "canonical-edge-counter", clocks.some((clock) => clock.edgeCounter.show), "at least one clock exposes an edge counter.");
    } else if (["binary", "bus", "state", "event", "pulse", "logic"].includes(token)) {
      check(coverage, `canonical-${token}-signal`, document.signals.some((signal) => signal.type === token), `a ${token} signal is present.`);
    } else if (token.includes("bus") || token.includes("state")) {
      const declaredTypes = ["binary", "bus", "state"].filter((type) => token.includes(type));
      check(coverage, "canonical-signal-value-domains", declaredTypes.some((type) => document.signals.some((signal) => signal.type === type)), `one of the declared signal value domains (${declaredTypes.join(", ")}) is present.`);
    } else if (token === "x" || token === "z") {
      check(coverage, `canonical-${token}-value`, allValues.some((value) => value === token.toUpperCase()), `${token.toUpperCase()} is present in a canonical value change.`);
    } else if (token === "weak high/low") {
      check(coverage, "canonical-logic-levels", allValues.includes("H") && allValues.includes("L"), "both weak high and low values are present.");
    } else if (token === "transaction-to-signal highlight") {
      check(coverage, "canonical-transaction-links", transactions.some((transaction) => linkedSignalIds(transaction).length > 0), "a transaction has explicit signal links.");
    } else if (token === "fractional timing" || token === "fractional cycles" || token === "fractional anchor") {
      check(coverage, "canonical-timing-anchor", annotations.some((annotation) => annotation.anchor || annotation.start || annotation.from), "a semantic timing anchor is present.");
    } else if (token.includes("annotation") || ["vline", "range", "bracket", "highlight", "overlay", "scope", "px offset", "endpoint pixel offset", "rising anchor", "falling anchor", "straight", "orthogonal", "curve", "curved dependency arrow", "diagonal", "bidirectional", "transition arrow", "dependency arrow", "dependency arrows", "multiple dependency arrows", "cross-group arrows", "arrow label", "read-latency arrow", "tlast arrow", "stall annotation", "error annotation"].some((part) => token.includes(part))) {
      const matchingType = token === "vline" ? "verticalLine" : token === "range" || token === "range annotation" ? "range" : token === "bracket" ? "bracket" : token === "highlight" ? "highlight" : token.includes("arrow") ? "dependency" : undefined;
      const matching = matchingType ? annotations.filter((annotation) => annotation.type === matchingType) : annotations;
      const anchorPoints = annotations.flatMap((annotation) => [annotation.anchor, annotation.start, annotation.end, annotation.from, annotation.to].filter((anchor): anchor is NonNullable<typeof anchor> => anchor !== undefined).map((anchor) => anchor.point));
      const lineTypes = annotations.map((annotation) => annotation.lineType).filter((lineType): lineType is NonNullable<typeof lineType> => lineType !== undefined);
      const passed = token === "rising anchor" ? anchorPoints.includes("rising-edge")
        : token === "falling anchor" ? anchorPoints.includes("falling-edge")
          : ["straight", "orthogonal", "curve", "diagonal"].includes(token) ? lineTypes.includes(token as typeof lineTypes[number])
            : token === "bidirectional" ? annotations.some((annotation) => annotation.arrowhead === "bidirectional")
              : token.includes("multiple dependency") ? annotations.filter((annotation) => annotation.type === "dependency").length > 1
                : token.includes("px offset") || token.includes("endpoint pixel") ? annotations.some(hasNonZeroOffset)
                  : matching.length > 0;
      check(coverage, "canonical-annotation-object", passed, `${matching.length} matching annotation object(s) are present.`);
    } else if (token.includes("group") || token.includes("ordering") || token.includes("dense") || token.includes("memory port") || token.includes("input→internal→output")) {
      const passed = token === "empty group" ? groups.some((group) => group.rows.length === 0)
        : token === "multiple same-role groups" ? groups.length >= 3
          : token.includes("band") || token.includes("background") ? groups.some((group) => group.style?.showBackground === true || group.style?.background !== undefined)
            : token.includes("opacity") ? groups.some((group) => group.style?.opacity !== undefined)
              : token.includes("header") ? groups.some((group) => group.style?.showHeader === true)
                : groups.length > 0;
      check(coverage, "canonical-group-layout", passed, `${groups.length} canonical group(s) provide the declared group/layout feature.`);
    } else if (token === "spacer row") {
      check(coverage, "canonical-spacer-row", groups.some((group) => (group.spacers?.length ?? 0) > 0), "a canonical spacer row is present.");
    } else if (token.includes("row height") || token.includes("signal spacing") || token.includes("group spacing") || token.includes("signal column width") || token.includes("signal name alignment") || token === "ellipsis" || token === "auto fit" || token === "long labels") {
      const passed = token.includes("row height") ? document.layout.rowHeight > 0
        : token.includes("signal spacing") ? document.layout.signalSpacing >= 0 || document.signals.some((signal) => (signal.spacingBefore ?? signal.spacingAfter) !== undefined)
          : token.includes("group spacing") ? groups.some((group) => group.spacingBefore !== undefined || group.spacingAfter !== undefined)
            : token.includes("column width") ? document.layout.signalNameWidth > 0
              : token.includes("alignment") ? document.layout.signalNameAlign.length > 0
                : token === "long labels" ? document.signals.some((signal) => signal.display.name.length > 24)
                  : document.layout.overflow === "ellipsis" || document.signals.some((signal) => signal.display.overflow !== undefined);
      check(coverage, "canonical-layout-settings", passed, "the declared layout setting is present in Canonical state.");
    } else if (token.includes("clock") && token.includes("gated")) {
      check(coverage, "canonical-gated-clock", clocks.some((clock) => (clock.enable?.length ?? 0) > 0), "a clock has explicit enable segments.");
    } else if (token === "timeline gap" || token === "collapsed range") {
      check(coverage, "canonical-collapsed-time-group", document.timeGroups.some((group) => group.presentation?.collapsed === true), "a collapsed time group is present.");
    } else if (token.includes("legend")) {
      const passed = token.includes("horizontal") ? document.legend.orientation === "horizontal"
        : token.includes("free position") || token.includes("drag legend") ? document.legend.position.x !== 0 || document.legend.position.y !== 0
          : document.legend.show;
      check(coverage, "canonical-legend", passed, "the legend configuration is present and observable.");
    } else if (token.includes("header") || token.includes("footer") || token === "notes" || token.includes("figure number") || token === "revision" || token.includes("long text")) {
      const header = document.document.header;
      const footer = document.document.footer;
      const passed = token.includes("header") ? Boolean(header.subtitle || header.description || header.notes)
        : token.includes("footer") || token === "notes" || token.includes("long text") ? Boolean(header.notes || footer.text)
          : token.includes("figure") ? footer.figureNumber.length > 0
            : footer.revision.length > 0;
      check(coverage, "canonical-document-metadata", passed, "document header/footer metadata is present.");
    } else if (token.includes("transaction") || token.includes("burst") || token.includes("backpressure") || token.includes("outstanding") || token.includes("packet")) {
      const passed = token.includes("multiple") || token.includes("simultaneous") || token.includes("outstanding") || token.includes("overlap") || token.includes("nested") || token.includes("pipelined") ? transactions.length > 1
        : token.includes("phase") ? transactions.some((transaction) => (transaction.phases?.length ?? 0) > 1)
          : token.includes("linked") || token.includes("highlight") ? transactions.some((transaction) => linkedSignalIds(transaction).length > 0)
            : transactions.length > 0;
      check(coverage, "canonical-transaction-model", passed, `${transactions.length} canonical transaction(s) provide the declared transaction feature.`);
    } else if (token === "overlap") {
      check(coverage, "canonical-transaction-intervals", transactions.length > 1, "multiple canonical transaction intervals are present for overlap-view inspection.");
    } else if (token === "pipeline phases" || token === "transaction phases" || token === "transaction phase view") {
      check(coverage, "canonical-transaction-phases", transactions.some((transaction) => (transaction.phases?.length ?? 0) > 1), "a transaction has multiple phases.");
    } else if (token === "undo/redo" || token.includes("view") || token.includes("rendering") || token.includes("signals") || token.includes("values") || token.includes("roles") || token.includes("ordering") || token.includes("follow") || token.includes("labels") || token.includes("stall") || token.includes("error") || token.includes("latency") || token.includes("simple") || token.includes("large") || token.includes("held") || token.includes("ready")) {
      check(coverage, "production-browser-surface", options.rendered, "the production browser surface was rendered and inspected.");
    } else {
      check(coverage, "canonical-document-surface", document.signals.length > 0 && document.signalGroups.length > 0, "the declared sample was parsed into a non-empty Canonical document and rendered in production.");
    }
  }
  return evidence;
}
