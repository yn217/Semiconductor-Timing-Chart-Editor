import { renderWaveJsonMarkup } from "@timing-chart-v2/wavedrom-adapter";
import type { WaveJsonSignal } from "@timing-chart-v2/wavedrom-adapter";

type RenderRequest = Readonly<{
  waveJson: WaveJsonSignal;
  renderIndex: number;
  semanticValues: readonly string[];
}>;

const workerScope = self as unknown as DedicatedWorkerGlobalScope;
workerScope.onmessage = (event: MessageEvent<RenderRequest>) => {
  const startedAt = performance.now();
  const markup = renderWaveJsonMarkup(event.data.waveJson, event.data.renderIndex, event.data.semanticValues);
  workerScope.postMessage({ markup, durationMs: performance.now() - startedAt });
};
