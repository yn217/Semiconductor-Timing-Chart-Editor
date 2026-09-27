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

export type WaveMarkupStageMetrics = Readonly<{
  waveDromRenderAnyMs: number;
  onmlStringifyMs: number;
  valueLabelLayoutMs: number;
  markupSafetyMs: number;
  svgMarkupBytes: number;
}>;

function now(): number {
  return globalThis.performance?.now() ?? Date.now();
}

const utf8Encoder = new TextEncoder();

export function renderWaveJsonMarkupWithMetrics(waveJson: WaveJsonSignal, renderIndex = 0, semanticValues: readonly string[] = []): Readonly<{ markup: string; metrics: WaveMarkupStageMetrics }> {
  try {
    let startedAt = now();
    const tree = WaveDrom.renderAny(renderIndex, { signal: [waveJson] }, WaveDrom.waveSkin);
    const waveDromRenderAnyMs = now() - startedAt;
    startedAt = now();
    const serialized = WaveDrom.onml.stringify(tree);
    const onmlStringifyMs = now() - startedAt;
    startedAt = now();
    const laidOut = applyValueLabelLayout(serialized, waveJson, semanticValues);
    const valueLabelLayoutMs = now() - startedAt;
    startedAt = now();
    const markup = assertSafeWaveDromMarkup(laidOut);
    const markupSafetyMs = now() - startedAt;
    const svgMarkupBytes = new TextEncoder().encode(markup).byteLength;
    return { markup, metrics: { waveDromRenderAnyMs, onmlStringifyMs, valueLabelLayoutMs, markupSafetyMs, svgMarkupBytes } };
  } catch (error) {
    if (error instanceof WaveDromAdapterError) throw error;
    throw new WaveDromAdapterError("WAVEDROM_RENDER_FAILED", "Pinned WaveDrom failed to render the generated WaveJSON.", { cause: error });
  }
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
  const validateElement = (element: Element): void => {
    if (unsafeElements.has(element.localName.toLowerCase())) {
      throw new WaveDromAdapterError("UNSAFE_WAVEDROM_SVG", "WaveDrom produced an executable SVG element.");
    }
    for (let index = 0; index < element.attributes.length; index += 1) {
      const attribute = element.attributes.item(index);
      if (!attribute) continue;
      const name = attribute.name.toLowerCase();
      if (name.startsWith("on")) {
        throw new WaveDromAdapterError("UNSAFE_WAVEDROM_SVG", "WaveDrom produced an SVG event-handler attribute.");
      }
      // Only link values need normalization. SVG path data and style values can
      // be much larger than the attribute name and are irrelevant to this URL
      // policy; lowercasing them allocated/scanned every long `d` attribute.
      if ((name === "href" || name === "xlink:href") && !attribute.value.trim().startsWith("#")) {
        throw new WaveDromAdapterError("UNSAFE_WAVEDROM_SVG", "WaveDrom produced an unsafe SVG URL attribute.");
      }
    }
  };
  validateElement(svg);
  const descendants = svg.querySelectorAll("*");
  for (let index = 0; index < descendants.length; index += 1) {
    const element = descendants.item(index);
    if (element) validateElement(element);
  }
}

interface ActiveOwner {
  readonly mount: Element;
  readonly rendered: RenderedWave;
}

interface MarkupCacheEntry {
  readonly key: string;
  readonly markup: string;
  readonly renderIndex: number;
  readonly waveJsonBytes: number;
  readonly semanticValuesBytes: number;
  readonly svgMarkupBytes: number;
  safetyDocument?: Document;
  parsedSvgByDocument?: WeakMap<Document, SVGElement>;
}

const RETAINED_MARKUP_CACHE_LIMIT = 64;

export class ProductionWaveDromAdapter implements WaveDromAdapter {
  readonly #renderIndices = new Map<SignalId, number>();
  readonly #active = new Map<SignalId, ActiveOwner>();
  readonly #markupCache = new Map<SignalId, MarkupCacheEntry>();
  readonly #retainedMarkupCache = new Map<SignalId, MarkupCacheEntry>();
  readonly #renderCallsBySignal = new Map<SignalId, number>();
  readonly #preparedDurationMs = new WeakMap<RenderedWave, number>();
  #nextRenderIndex = 0;
  #renderCalls = 0;
  #waveJsonDurationMs = 0;
  #renderDurationMs = 0;
  #renderStageTotals = {
    sourcePreparationMs: 0,
    metricCollectionOverheadMs: 0,
    cacheKeySerializeMs: 0,
    waveDromRenderAnyMs: 0,
    onmlStringifyMs: 0,
    valueLabelLayoutMs: 0,
    markupSafetyMs: 0,
    templateParseMs: 0,
    svgSafetyDomWalkMs: 0,
    domInstallMs: 0,
    totalSignalWallMs: 0,
    waveJsonBytes: 0,
    semanticValuesBytes: 0,
    svgMarkupBytes: 0,
  };
  #lastRenderStages: Readonly<Record<string, number>> | undefined;
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
    const startedAt = now();
    const result = toWaveJson(source);
    const durationMs = now() - startedAt;
    this.#waveJsonDurationMs += durationMs;
    this.#renderStageTotals.sourcePreparationMs += durationMs;
    return result;
  }

  async renderWave(signalId: SignalId, waveJson: WaveJsonSignal, mount: Element, semanticValues: readonly string[] = []): Promise<RenderedWave> {
    const prepared = await this.prepareWave(signalId, waveJson, mount.ownerDocument, semanticValues);
    return this.installWave(prepared, mount);
  }

  async prepareWave(signalId: SignalId, waveJson: WaveJsonSignal, ownerDocument: Document, semanticValues: readonly string[] = []): Promise<RenderedWave> {
    const startedAt = now();
    const stages = Object.fromEntries(Object.keys(this.#renderStageTotals).map((key) => [key, 0])) as Record<string, number>;
    let stageStartedAt = now();
    this.#renderCalls += 1;
    this.#renderCallsBySignal.set(signalId, (this.#renderCallsBySignal.get(signalId) ?? 0) + 1);
    const serializedWaveJson = JSON.stringify(waveJson);
    const serializedSemanticValues = JSON.stringify(semanticValues);
    const cacheKey = `${WAVEDROM_VERSION}\u0000${serializedWaveJson}\u0000${serializedSemanticValues}`;
    stages.cacheKeySerializeMs = now() - stageStartedAt;
    let renderIndex = this.#renderIndices.get(signalId);
    let cached = this.#markupCache.get(signalId);
    if (renderIndex === undefined) {
      const retained = this.#retainedMarkupCache.get(signalId);
      if (retained?.key === cacheKey) {
        renderIndex = retained.renderIndex;
        cached = retained;
        this.#retainedMarkupCache.delete(signalId);
      } else {
        this.#retainedMarkupCache.delete(signalId);
      }
      if (renderIndex === undefined) renderIndex = this.#nextRenderIndex++;
      this.#renderIndices.set(signalId, renderIndex);
    }
    const markupCacheHit = cached?.key === cacheKey && cached.renderIndex === renderIndex;
    let markup: string;
    let cacheEntry: MarkupCacheEntry;
    if (markupCacheHit && cached) {
      markup = cached.markup;
      cacheEntry = cached;
      stages.waveJsonBytes = cached.waveJsonBytes;
      stages.semanticValuesBytes = cached.semanticValuesBytes;
      stages.svgMarkupBytes = cached.svgMarkupBytes;
      this.#cacheHits += 1;
    } else {
      stageStartedAt = now();
      stages.waveJsonBytes = utf8Encoder.encode(serializedWaveJson).byteLength;
      stages.semanticValuesBytes = utf8Encoder.encode(serializedSemanticValues).byteLength;
      stages.metricCollectionOverheadMs = (stages.metricCollectionOverheadMs ?? 0) + now() - stageStartedAt;
      const generated = renderWaveJsonMarkupWithMetrics(waveJson, renderIndex, semanticValues);
      markup = generated.markup;
      stages.waveDromRenderAnyMs = generated.metrics.waveDromRenderAnyMs;
      stages.onmlStringifyMs = generated.metrics.onmlStringifyMs;
      stages.valueLabelLayoutMs = generated.metrics.valueLabelLayoutMs;
      stages.markupSafetyMs = generated.metrics.markupSafetyMs;
      stages.svgMarkupBytes = generated.metrics.svgMarkupBytes;
      this.#cacheMisses += 1;
      cacheEntry = {
        key: cacheKey,
        markup,
        renderIndex,
        waveJsonBytes: stages.waveJsonBytes,
        semanticValuesBytes: stages.semanticValuesBytes,
        svgMarkupBytes: stages.svgMarkupBytes,
      };
    }
    this.#markupCache.set(signalId, cacheEntry);
    const cachedSvg = markupCacheHit ? cacheEntry.parsedSvgByDocument?.get(ownerDocument) : undefined;
    let svg: Element | null;
    if (cachedSvg) {
      svg = cachedSvg.cloneNode(true) as SVGElement;
      stages.templateParseMs = 0;
    } else {
      const template = ownerDocument.createElement("template");
      stageStartedAt = now();
      template.innerHTML = markup.trim();
      svg = template.content.firstElementChild;
      stages.templateParseMs = now() - stageStartedAt;
    }
    if (!svg || svg.namespaceURI !== "http://www.w3.org/2000/svg" || svg.localName !== "svg") {
      throw new WaveDromAdapterError("INVALID_WAVEDROM_SVG", "WaveDrom did not return an SVG root.");
    }
    const safetyCacheEntry = cacheEntry;
    const svgSafetyCacheHit = Boolean(cachedSvg) || safetyCacheEntry.safetyDocument === ownerDocument;
    if (svgSafetyCacheHit) {
      stages.svgSafetyDomWalkMs = 0;
    } else {
      stageStartedAt = now();
      assertSafeWaveDromSvg(svg);
      stages.svgSafetyDomWalkMs = now() - stageStartedAt;
      safetyCacheEntry.safetyDocument = ownerDocument;
    }
    if (!cachedSvg) {
      const parsedSvgByDocument = safetyCacheEntry.parsedSvgByDocument ??= new WeakMap<Document, SVGElement>();
      parsedSvgByDocument.set(ownerDocument, svg.cloneNode(true) as SVGElement);
    }
    const renderStages = Object.freeze({ ...stages });
    const rendered: RenderedWave = { signalId, ownerKey: signalId, svg: svg as SVGElement, renderIndex, waveJson, markupCacheHit, svgSafetyCacheHit, renderStages };
    this.#preparedDurationMs.set(rendered, now() - startedAt);
    return rendered;
  }

  installWave(prepared: RenderedWave, mount: Element): RenderedWave {
    const preparedDurationMs = this.#preparedDurationMs.get(prepared);
    if (preparedDurationMs === undefined) throw new WaveDromAdapterError("INVALID_PREPARED_WAVE", "WaveDrom SVG must be prepared by this adapter before installation.");
    this.#preparedDurationMs.delete(prepared);
    const existing = this.#active.get(prepared.signalId);
    if (existing && existing.mount !== mount) this.#clearOwner(existing);
    const stageStartedAt = now();
    prepared.svg.setAttribute("data-wave-owner", prepared.signalId);
    prepared.svg.setAttribute("data-wave-render-index", String(prepared.renderIndex));
    // WaveDrom's default SVG is sized from the row height. The browser's default
    // preserveAspectRatio=meet therefore leaves the waveform at its intrinsic
    // brick width when the editor provides a wider screen column. Stretch only
    // the rendered SVG viewport; Local Geometry removes this root screen matrix.
    prepared.svg.setAttribute("preserveAspectRatio", "none");
    mount.setAttribute("data-wave-owner", prepared.signalId);
    mount.replaceChildren(prepared.svg);
    const domInstallMs = now() - stageStartedAt;
    const renderStages = Object.freeze({ ...prepared.renderStages, domInstallMs, totalSignalWallMs: preparedDurationMs + domInstallMs });
    const rendered: RenderedWave = { ...prepared, renderStages };
    this.#active.set(prepared.signalId, { mount, rendered });
    this.#lastRenderStages = renderStages;
    const stageTotals = this.#renderStageTotals as Record<string, number>;
    for (const [key, value] of Object.entries(renderStages)) stageTotals[key] = (stageTotals[key] ?? 0) + value;
    this.#renderDurationMs += renderStages.totalSignalWallMs;
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
    this.#retainedMarkupCache.delete(signalId);
    this.#renderCallsBySignal.delete(signalId);
  }

  retainArtifact(signalId: SignalId): void {
    const owner = this.#active.get(signalId);
    if (owner) this.#clearOwner(owner);
    this.#active.delete(signalId);
    const cached = this.#markupCache.get(signalId);
    this.#markupCache.delete(signalId);
    this.#renderIndices.delete(signalId);
    this.#renderCallsBySignal.delete(signalId);
    if (!cached) return;
    this.#retainedMarkupCache.delete(signalId);
    this.#retainedMarkupCache.set(signalId, cached);
    while (this.#retainedMarkupCache.size > RETAINED_MARKUP_CACHE_LIMIT) {
      const oldestSignalId = this.#retainedMarkupCache.keys().next().value as SignalId | undefined;
      if (oldestSignalId === undefined) break;
      this.#retainedMarkupCache.delete(oldestSignalId);
    }
  }

  metrics(): WaveDromAdapterMetrics {
    return { renderCalls: this.#renderCalls, waveJsonDurationMs: this.#waveJsonDurationMs, renderDurationMs: this.#renderDurationMs, renderStages: Object.freeze({ last: this.#lastRenderStages, totals: Object.freeze({ ...this.#renderStageTotals }) }), renderCallsBySignal: Object.fromEntries(this.#renderCallsBySignal), cacheHits: this.#cacheHits, cacheMisses: this.#cacheMisses, mounts: this.#mounts, disposals: this.#disposals, geometryBuilds: this.#geometryBuilds, geometryMatrixReads: this.#geometryMatrixReads, activeOwners: this.#active.size, allocatedRenderIndices: this.#renderIndices.size };
  }

  #clearOwner(owner: ActiveOwner): void {
    this.#disposals += 1;
    if (owner.rendered.svg.parentElement === owner.mount) owner.rendered.svg.remove();
    if (owner.mount.getAttribute("data-wave-owner") === owner.rendered.signalId) owner.mount.removeAttribute("data-wave-owner");
  }
}
