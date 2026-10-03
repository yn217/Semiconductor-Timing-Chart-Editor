import type { Signal } from "@timing-chart-v2/schema";

export function SignalTreeFooter({ signalCount, selectedSignal }: {
  readonly signalCount: number;
  readonly selectedSignal: Signal | undefined;
}) {
  return (
    <div className="left-panel-tail">
      <span data-testid="left-tree-signal-count">{signalCount} signals</span>
      {selectedSignal && (
        <span className="scope-breadcrumb" data-testid="scope-breadcrumb">
          Scope: {selectedSignal.source.instancePath.length
            ? selectedSignal.source.instancePath.join(" / ")
            : "(root)"}
        </span>
      )}
    </div>
  );
}
