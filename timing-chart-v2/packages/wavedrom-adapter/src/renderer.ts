import type { LocalGeometryMap } from "@timing-chart-v2/geometry";
import type { SignalId } from "@timing-chart-v2/schema";
import WaveDrom from "wavedrom";
import { toWaveJson } from "./conversion.js";
import { extractLocalGeometry } from "./geometry-extractor.js";
import { applyValueLabelLayout } from "./value-label-layout.js";
import {
  WAVEDROM_VERSION,
  WaveDromAdapterError,
  type CanonicalSignalSource,
  type GeometryExtractionMetrics,
  type RenderedWave,
  type WaveDromAdapter,
  type WaveDromAdapterMetrics,
  type WaveJsonSignal,
} from "./types.js";

if (WaveDrom.version !== WAVEDROM_VERSION) {
  throw new WaveDromAdapterError("WAVEDROM_VERSION_MISMATCH", `Expected WaveDrom ${WAVEDROM_VERSION}, received ${WaveDrom.version}.`);
}

export function renderWaveJsonMarkup(waveJson: WaveJsonSignal, renderIndex = 0, semanticValues: readonly string[] = []): string {
  try {
    const tree = WaveDrom.renderAny(renderIndex, { signal: [waveJson] }, WaveDrom.waveSkin);
    return assertSafeWaveDromMarkup(applyValueLabelLayout(WaveDrom.onml.stringify(tree), waveJson, semanticValues));
  } catch (error) {
    if (error instanceof WaveDromAdapterError) throw error;
    throw new WaveDromAdapterError("WAVEDROM_RENDER_FAILED", "Pinned WaveDrom failed to render the generated WaveJSON.", { cause: error });
  }
}

/**
 * The pinned renderer normally emits SVG-only markup, but this is the final
 * trust boundary before imperative template parsing. Reject executable markup
 * instead of silently stripping user-visible engineering text.
 */
export function assertSafeWaveDromMarkup(markup: string): string {
  const executableElement = /<\s*(?:script|foreignObject|iframe|object|embed|img)\b/i;
  const eventHandler = /<[^>]*\bon[a-z][\w:-]*\s*=/i;
  const unsafeUrl = /(?:href|xlink:href)\s*=\s*["']\s*(?!#)[^"']+/i;
  if (executableElement.test(markup) || eventHandler.test(markup) || unsafeUrl.test(markup)) {
    throw new WaveDromAdapterError("UNSAFE_WAVEDROM_SVG", "WaveDrom produced executable SVG markup.");
  }
  return markup;
}

/**
 * Validate the materialized SVG as well as its serialized source. This keeps
 * the trust boundary at the exact DOM node that is about to enter the editor.
 */
export function assertSafeWaveDromSvg(svg: Element): void {
  const unsafeElements = new Set(["script", "foreignObject", "iframe", "object", "embed", "img"]);
  for (const element of [svg, ...Array.from(svg.querySelectorAll("*"))]) {
    if (unsafeElements.has(element.localName.toLowerCase())) {
      throw new WaveDromAdapterError("UNSAFE_WAVEDROM_SVG", "WaveDrom produced an executable SVG element.");
    }
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim().toLowerCase();
      if (name.startsWith("on")) {
        throw new WaveDromAdapterError("UNSAFE_WAVEDROM_SVG", "WaveDrom produced an SVG event-handler attribute.");
      }
      if ((name === "href" || name === "xlink:href") && !value.startsWith("#")) {
        throw new WaveDromAdapterError("UNSAFE_WAVEDROM_SVG", "WaveDrom produced an unsafe SVG URL attribute.");
      }
    }
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
  #renderDurationMs = 0;
  #cacheHits = 0;
  #cacheMisses = 0;
  #mounts = 0;
  #disposals = 0;
  #geometryBuilds = 0;
  #geometryMatrixReads = 0;
  #lastGeometryMetrics: GeometryExtractionMetrics | undefined;
  #geometryDurationMs = 0;
  #geometryUsesVisited = 0;
  #geometryEntriesEmitted = 0;
  #duplicateKeyChecks = 0;
  #duplicateKeyCollisions = 0;
  #transitionBrickLookups = 0;
  #skinPathParses = 0;
  #matrixReads = 0;

  toWaveJson(source: CanonicalSignalSource): WaveJsonSignal {
    return toWaveJson(source);
  }

  async renderWave(signalId: SignalId, waveJson: WaveJsonSignal, mount: Element, semanticValues: readonly string[] = []): Promise<RenderedWave> {
    const startedAt = globalThis.performance?.now() ?? Date.now();
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
    const cacheKey = `${WAVEDROM_VERSION}\u0000${JSON.stringify(waveJson)}\u0000${JSON.stringify(semanticValues)}`;
    const cached = this.#markupCache.get(signalId);
    let markup: string;
    if (cached?.key === cacheKey) {
      markup = cached.markup;
      this.#cacheHits += 1;
    } else {
      markup = renderWaveJsonMarkup(waveJson, renderIndex, semanticValues);
      this.#markupCache.set(signalId, { key: cacheKey, markup });
      this.#cacheMisses += 1;
    }
    const template = mount.ownerDocument.createElement("template");
    template.innerHTML = markup.trim();
    const svg = template.content.firstElementChild;
    if (!svg || svg.namespaceURI !== "http://www.w3.org/2000/svg" || svg.localName !== "svg") {
      throw new WaveDromAdapterError("INVALID_WAVEDROM_SVG", "WaveDrom did not return an SVG root.");
    }
    assertSafeWaveDromSvg(svg);
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
    this.#renderDurationMs += (globalThis.performance?.now() ?? Date.now()) - startedAt;
    this.#mounts += 1;
    return rendered;
  }

  extractLocalGeometry(rendered: RenderedWave): LocalGeometryMap {
    const extractionMetrics = { signalId: rendered.signalId, usesVisited: 0, geometryEntriesEmitted: 0, duplicateKeyChecks: 0, duplicateKeyCollisions: 0, transitionBrickLookups: 0, skinPathParses: 0, matrixReads: 0, durationMs: 0 };
    const geometry = extractLocalGeometry(rendered, extractionMetrics);
    this.#geometryBuilds += 1;
    this.#geometryMatrixReads += 2;
    this.#lastGeometryMetrics = Object.freeze({ ...extractionMetrics });
    this.#geometryDurationMs += extractionMetrics.durationMs;
    this.#geometryUsesVisited += extractionMetrics.usesVisited;
    this.#geometryEntriesEmitted += extractionMetrics.geometryEntriesEmitted;
    this.#duplicateKeyChecks += extractionMetrics.duplicateKeyChecks;
    this.#duplicateKeyCollisions += extractionMetrics.duplicateKeyCollisions;
    this.#transitionBrickLookups += extractionMetrics.transitionBrickLookups;
    this.#skinPathParses += extractionMetrics.skinPathParses;
    this.#matrixReads += extractionMetrics.matrixReads;
    return geometry;
  }

  geometryMetrics() {
    return Object.freeze({ last: this.#lastGeometryMetrics, totalDurationMs: this.#geometryDurationMs, totalUsesVisited: this.#geometryUsesVisited, totalGeometryEntriesEmitted: this.#geometryEntriesEmitted, totalDuplicateKeyChecks: this.#duplicateKeyChecks, totalDuplicateKeyCollisions: this.#duplicateKeyCollisions, totalTransitionBrickLookups: this.#transitionBrickLookups, totalSkinPathParses: this.#skinPathParses, totalMatrixReads: this.#matrixReads });
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
    return { renderCalls: this.#renderCalls, renderDurationMs: this.#renderDurationMs, renderCallsBySignal: Object.fromEntries(this.#renderCallsBySignal), cacheHits: this.#cacheHits, cacheMisses: this.#cacheMisses, mounts: this.#mounts, disposals: this.#disposals, geometryBuilds: this.#geometryBuilds, geometryMatrixReads: this.#geometryMatrixReads, activeOwners: this.#active.size, allocatedRenderIndices: this.#renderIndices.size };
  }

  #clearOwner(owner: ActiveOwner): void {
    this.#disposals += 1;
    if (owner.rendered.svg.parentElement === owner.mount) owner.rendered.svg.remove();
    if (owner.mount.getAttribute("data-wave-owner") === owner.rendered.signalId) owner.mount.removeAttribute("data-wave-owner");
  }
}
