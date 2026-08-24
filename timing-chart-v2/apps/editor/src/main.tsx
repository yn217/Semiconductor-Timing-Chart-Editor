import { StrictMode, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { ProductionWaveDromAdapter, WAVEDROM_VERSION } from "@timing-chart-v2/wavedrom-adapter";
import type { SignalId, ValueSignal } from "@timing-chart-v2/schema";

const probeSignal: ValueSignal = {
  id: "sig_phase3_probe" as SignalId,
  name: "PROBE",
  type: "logic",
  role: "internal",
  source: { instancePath: [], signalName: "PROBE" },
  display: { name: "PROBE" },
  values: [{ start: 0, value: 0 }, { start: 2, value: 1 }, { start: 5, value: "x" }],
};

function ArchitectureProbe() {
  const mount = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const owner = mount.current;
    if (!owner) return;
    const adapter = new ProductionWaveDromAdapter();
    const waveJson = adapter.toWaveJson({ signal: probeSignal, cycleCount: 8 });
    void adapter.renderWave(probeSignal.id, waveJson, owner).catch((error: unknown) => {
      owner.setAttribute("data-wave-error", error instanceof Error ? error.message : "Unknown WaveDrom render failure");
    });
    return () => adapter.dispose(probeSignal.id);
  }, []);
  return <main><h1>Timing Chart Editor V2</h1><p>Phase 3 WaveDrom adapter probe — {WAVEDROM_VERSION}</p><div ref={mount} data-testid="wave-mount" /></main>;
}

const root = document.getElementById("root");
if (!root) throw new Error("Editor root is missing");
createRoot(root).render(<StrictMode><ArchitectureProbe /></StrictMode>);
