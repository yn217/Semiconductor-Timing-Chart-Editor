import { describe, expect, it } from "vitest";
import { planCommand } from "@timing-chart-v2/commands";
import { deriveTimingDiagnostics, deriveTimingDiagnosticsIfInputsChanged } from "@timing-chart-v2/core";
import { generatePerformanceDocument } from "@timing-chart-v2/testing";
import type { CanonicalDocument, CommandId, Signal, SignalId } from "@timing-chart-v2/schema";

/**
 * #788 evidence: application-level accepted commit = plan the command + derive timing diagnostics for the resulting ChangeSet (the
 * exact pair use-editor-application-owner runs after an accepted command). A 1,000,000-value-change document (100 Signals x 10,000
 * changes) must keep rename / style / property commits cheap; a style-only commit reuses the previous diagnostics outright.
 */
const id = (value: string) => value as CommandId;
const build = (): CanonicalDocument => {
  const base = generatePerformanceDocument({ signalCount: 100, cycleCount: 10_000, profile: "standard" });
  const signals = base.signals.map((signal): Signal => signal.type === "clock" ? signal : { ...signal, values: Array.from({ length: 10_000 }, (_, index) => ({ start: index, value: index % 2 })) } as Signal);
  return { ...base, signals };
};

describe("timing diagnostics commit scale (#788)", () => {
  it("rename / style / property commits on 1M value changes stay far below an interaction budget; style-only reuses diagnostics", () => {
    const document = build();
    const valueChanges = document.signals.reduce((total, signal) => total + ("values" in signal ? signal.values.length : 0), 0);
    expect(valueChanges).toBeGreaterThanOrEqual(900_000);
    const full = performance.now();
    const diagnostics = deriveTimingDiagnostics(document);
    const fullMs = performance.now() - full;
    const target = document.signals.find((signal) => signal.type !== "clock")!;
    const commands = [
      { label: "rename", command: { id: id("cmd_rename"), type: "signal.rename", signalId: target.id as SignalId, name: "RENAMED" } },
      { label: "style", command: { id: id("cmd_style"), type: "signal.updateProperties", signalId: target.id as SignalId, name: target.name, role: target.role, displayAlign: "center" } },
      { label: "property", command: { id: id("cmd_vis"), type: "signal.setVisibility", signalId: target.id as SignalId, visible: false } },
      { label: "value-edit", command: { id: id("cmd_value"), type: "signal.updateValue", signalId: target.id as SignalId, start: 5_000, value: 1 } },
    ] as const;
    const rows: string[] = [];
    for (const { label, command } of commands) {
      const started = performance.now();
      const planned = planCommand(document, command as never);
      expect(planned.ok, label).toBe(true);
      if (!planned.ok) continue;
      const planMs = performance.now() - started;
      const derived = performance.now();
      const update = deriveTimingDiagnosticsIfInputsChanged(document, planned.document, diagnostics, { timingDiagnosticsUnchanged: planned.changeSet.timingDiagnosticsUnchanged === true });
      const deriveMs = performance.now() - derived;
      rows.push(`${label}: plan ${planMs.toFixed(1)} ms + diagnostics ${deriveMs.toFixed(2)} ms (recomputed=${update.recomputed}, unchanged=${planned.changeSet.timingDiagnosticsUnchanged === true})`);
      if (label === "style") expect(update.recomputed, "a style-only commit must reuse the diagnostics").toBe(false);
      expect(planMs + deriveMs, `${label} accepted-commit latency`).toBeLessThan(500);
      expect(deriveMs, `${label} diagnostics derivation`).toBeLessThan(50);
    }
    console.log(`[#788] ${valueChanges} value changes; full deriveTimingDiagnostics ${fullMs.toFixed(0)} ms; ${rows.join(" | ")}`);
  }, 120_000);
});
