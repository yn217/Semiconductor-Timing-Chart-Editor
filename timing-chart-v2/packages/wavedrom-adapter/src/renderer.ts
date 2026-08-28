import type { LocalGeometryMap } from "@timing-chart-v2/geometry";
import type { SignalId } from "@timing-chart-v2/schema";
import WaveDrom from "wavedrom";
import { toWaveJson } from "./conversion.js";
import { extractLocalGeometry } from "./geometry-extractor.js";
import {
  WAVEDROM_VERSION,
  WaveDromAdapterError,
  type CanonicalSignalSource,
  type RenderedWave,
  type WaveDromAdapter,
  type WaveDromAdapterMetrics,
  type WaveJsonSignal,
} from "./types.js";

if (WaveDrom.version !== WAVEDROM_VERSION) {
  throw new WaveDromAdapterError("WAVEDROM_VERSION_MISMATCH", `Expected WaveDrom ${WAVEDROM_VERSION}, received ${WaveDrom.version}.`);
}

export function renderWaveJsonMarkup(waveJson: WaveJsonSignal, renderIndex = 0): string {
  try {
    const tree = WaveDrom.renderAny(renderIndex, { signal: [waveJson] }, WaveDrom.waveSkin);
    return WaveDrom.onml.stringify(tree);
  } catch (error) {
    throw new WaveDromAdapterError("WAVEDROM_RENDER_FAILED", "Pinned WaveDrom failed to render the generated WaveJSON.", { cause: error });
  }
}

interface ActiveOwner {
  readonly mount: Element;
  readonly rendered: RenderedWave;
}

interface MarkupCacheEntry {
  readonly key: string;
  readonly markup: string;
}

export class ProductionWaveDromAdapter implements WaveDromAdapter {
  readonly #renderIndices = new Map<SignalId, number>();
  readonly #active = new Map<SignalId, ActiveOwner>();
  readonly #markupCache = new Map<SignalId, MarkupCacheEntry>();
  readonly #renderCallsBySignal = new Map<SignalId, number>();
  #nextRenderIndex = 0;
  #renderCalls = 0;
  #cacheHits = 0;
  #cacheMisses = 0;
  #mounts = 0;
  #disposals = 0;
  #geometryBuilds = 0;
  #geometryMatrixReads = 0;

  toWaveJson(source: CanonicalSignalSource): WaveJsonSignal {
    return toWaveJson(source);
  }

  async renderWave(signalId: SignalId, waveJson: WaveJsonSignal, mount: Element): Promise<RenderedWave> {
    const existing = this.#active.get(signalId);
    if (existing && existing.mount !== mount) this.#clearOwner(existing);
    let renderIndex = this.#renderIndices.get(signalId);
    if (renderIndex === undefined) {
      renderIndex = this.#nextRenderIndex;
      this.#nextRenderIndex += 1;
      this.#renderIndices.set(signalId, renderIndex);
    }
    this.#renderCalls += 1;
    this.#renderCallsBySignal.set(signalId, (this.#renderCallsBySignal.get(signalId) ?? 0) + 1);
    const cacheKey = `${WAVEDROM_VERSION}\u0000${JSON.stringify(waveJson)}`;
    const cached = this.#markupCache.get(signalId);
    let markup: string;
    if (cached?.key === cacheKey) {
      markup = cached.markup;
      this.#cacheHits += 1;
    } else {
      markup = renderWaveJsonMarkup(waveJson, renderIndex);
      this.#markupCache.set(signalId, { key: cacheKey, markup });
      this.#cacheMisses += 1;
    }
    const template = mount.ownerDocument.createElement("template");
    template.innerHTML = markup.trim();
    const svg = template.content.firstElementChild;
    if (!svg || svg.namespaceURI !== "http://www.w3.org/2000/svg" || svg.localName !== "svg") {
      throw new WaveDromAdapterError("INVALID_WAVEDROM_SVG", "WaveDrom did not return an SVG root.");
    }
    svg.setAttribute("data-wave-owner", signalId);
    svg.setAttribute("data-wave-render-index", String(renderIndex));
    // WaveDrom's default SVG is sized from the row height. The browser's default
    // preserveAspectRatio=meet therefore leaves the waveform at its intrinsic
    // brick width when the editor provides a wider screen column. Stretch only
    // the rendered SVG viewport; Local Geometry removes this root screen matrix.
    svg.setAttribute("preserveAspectRatio", "none");
    mount.setAttribute("data-wave-owner", signalId);
    mount.replaceChildren(svg);
    const rendered: RenderedWave = { signalId, ownerKey: signalId, svg: svg as SVGElement, renderIndex, waveJson };
    this.#active.set(signalId, { mount, rendered });
    this.#mounts += 1;
    return rendered;
  }

  extractLocalGeometry(rendered: RenderedWave): LocalGeometryMap {
    const geometry = extractLocalGeometry(rendered);
    this.#geometryBuilds += 1;
    this.#geometryMatrixReads += 2;
    return geometry;
  }

  dispose(signalId: SignalId): void {
    const owner = this.#active.get(signalId);
    if (owner) this.#clearOwner(owner);
    this.#active.delete(signalId);
    this.#renderIndices.delete(signalId);
    this.#markupCache.delete(signalId);
    this.#renderCallsBySignal.delete(signalId);
  }

  metrics(): WaveDromAdapterMetrics {
    return { renderCalls: this.#renderCalls, renderCallsBySignal: Object.fromEntries(this.#renderCallsBySignal), cacheHits: this.#cacheHits, cacheMisses: this.#cacheMisses, mounts: this.#mounts, disposals: this.#disposals, geometryBuilds: this.#geometryBuilds, geometryMatrixReads: this.#geometryMatrixReads, activeOwners: this.#active.size, allocatedRenderIndices: this.#renderIndices.size };
  }

  #clearOwner(owner: ActiveOwner): void {
    this.#disposals += 1;
    if (owner.rendered.svg.parentElement === owner.mount) owner.rendered.svg.remove();
    if (owner.mount.getAttribute("data-wave-owner") === owner.rendered.signalId) owner.mount.removeAttribute("data-wave-owner");
  }
}
