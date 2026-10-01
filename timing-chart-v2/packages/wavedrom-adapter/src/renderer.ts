import type { LocalGeometryMap } from "@timing-chart-v2/geometry";
import type { SignalId } from "@timing-chart-v2/schema";
import WaveDrom from "wavedrom";
import { toWaveJson } from "./conversion.js";
import { extractLocalGeometry } from "./geometry-extractor.js";
import { applyValueLabelLayout, canShareValueLabelGeometry } from "./value-label-layout.js";
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

export function renderWaveJsonMarkupWithMetrics(waveJson: WaveJsonSignal, renderIndex = 0, semanticValues: readonly string[] = []): Readonly<{ markup: string; rootAttributes: Readonly<Record<string, string>>; metrics: WaveMarkupStageMetrics }> {
  try {
    let startedAt = now();
    const tree = WaveDrom.renderAny(renderIndex, { signal: [waveJson] }, WaveDrom.waveSkin) as [string, Record<string, unknown>, ...unknown[]];
    const waveDromRenderAnyMs = now() - startedAt;
    const root = tree[1];
    if (tree[0] !== "svg" || root === null || typeof root !== "object" || Array.isArray(root)) {
      throw new WaveDromAdapterError("INVALID_WAVEDROM_SVG", "WaveDrom did not return SVG root attributes.");
    }
    const rootAttributes = Object.freeze(Object.fromEntries(Object.entries(root).map(([name, value]) => [name, String(value)])));
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
    return { markup, rootAttributes, metrics: { waveDromRenderAnyMs, onmlStringifyMs, valueLabelLayoutMs, markupSafetyMs, svgMarkupBytes } };
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
  // This check runs on WaveDrom's serialized output immediately before it is
  // parsed. Validate the serialized artifact once rather than walking every
  // materialized SVG node again in prepareWave; cached SVG artifacts are
  // derived only from this validated string.
  const tags = markup.match(/<[^>]*>/g) ?? [];
  for (const tag of tags) {
    if (/^<\s*(?:script|foreignObject|iframe|object|embed|img)(?:\s|\/?>)/i.test(tag)
      || /(?:^|\s)on[^\s=/>]*(?=\s|=|\/?>)/i.test(tag)) {
      throw new WaveDromAdapterError("UNSAFE_WAVEDROM_SVG", "WaveDrom produced executable SVG markup.");
    }
    const links = /(?:^|\s)(?:href|xlink:href)(?=\s|=|\/?>)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/ig;
    for (const match of tag.matchAll(links)) {
      const value = (match[1] ?? match[2] ?? match[3] ?? "").trim();
      if (!value.startsWith("#")) {
        throw new WaveDromAdapterError("UNSAFE_WAVEDROM_SVG", "WaveDrom produced an unsafe SVG URL attribute.");
      }
    }
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
  readonly artifact: MarkupCacheEntry;
}

interface SvgImageResource {
  readonly url: string;
  decoded?: Promise<void>;
  decodePending?: boolean;
  releasePending?: boolean;
}

interface MarkupCacheEntry {
  readonly markup: string;
  readonly rootAttributes: Readonly<Record<string, string>>;
  readonly waveJsonBytes: number;
  readonly semanticValuesBytes: number;
  readonly svgMarkupBytes: number;
  references: number;
  parsedSvgByDocument?: WeakMap<Document, SVGElement>;
  valueLabelTemplatesByDocument?: WeakMap<Document, readonly Readonly<{ template: SVGElement; segmentStart: number; segmentEnd: number }>[]>;
  svgImageResourcesByDocument?: Map<Document, SvgImageResource>;
}

interface SignalMarkupBinding {
  readonly key: string;
  readonly renderIndex: number;
  readonly artifact: MarkupCacheEntry;
}

const EMPTY_SEMANTIC_VALUES: readonly string[] = Object.freeze([]);

interface WaveMarkupArtifactIdentity {
  readonly semanticValues: readonly string[];
  readonly key: string;
  readonly shareLabels: boolean;
  readonly artifactWaveJson: WaveJsonSignal;
  readonly artifactSemanticValues: readonly string[];
  readonly serializedWaveJson?: string;
  readonly serializedSemanticValues?: string;
}

function createWaveMarkupArtifactIdentity(waveJson: WaveJsonSignal, semanticValues: readonly string[]): WaveMarkupArtifactIdentity {
  const shareLabels = canShareValueLabelGeometry(waveJson, semanticValues);
  const artifactWaveJson = shareLabels ? { ...waveJson, data: waveJson.data!.map(() => " ") } : waveJson;
  const artifactSemanticValues = shareLabels ? waveJson.data!.map(() => " ") : semanticValues;
  const serializedArtifactWaveJson = JSON.stringify(artifactWaveJson);
  const serializedArtifactSemanticValues = JSON.stringify(artifactSemanticValues);
  const key = `${WAVEDROM_VERSION}\u0000${serializedArtifactWaveJson}\u0000${serializedArtifactSemanticValues}`;
  return {
    semanticValues, key, shareLabels, artifactWaveJson, artifactSemanticValues,
    ...(!shareLabels ? { serializedWaveJson: serializedArtifactWaveJson, serializedSemanticValues: serializedArtifactSemanticValues } : {}),
  };
}

const RETAINED_MARKUP_CACHE_LIMIT = 64;
const SHARED_MARKUP_CACHE_LIMIT = 64;
const sharedDefinitionSprites = new WeakMap<Document, SVGSVGElement>();
const sharedDefinitionTemplates = new WeakMap<Document, SVGElement>();

/**
 * The pinned WaveDrom skin's definitions (transition bricks and markers) are
 * invariant across render owners. Keeping a copy in every installed SVG
 * multiplies a large, identical subtree by the number of Signals. SVG
 * fragment references resolve within the containing document, so keep one
 * inert document-level sprite and remove only definitions that exactly match
 * that pinned skin. Unexpected definitions remain local rather than being
 * discarded.
 */
function prepareSharedWaveDromDefinitions(svg: SVGElement, ownerDocument: Document): SVGElement | undefined {
  if (typeof svg.querySelector !== "function" || typeof ownerDocument.querySelector !== "function") return;
  const localDefinitions = svg.querySelector("defs");
  let sharedDefinitions = sharedDefinitionTemplates.get(ownerDocument)
    ?? ownerDocument.querySelector<SVGSVGElement>("svg[data-wavedrom-definition-sprite]")?.querySelector("defs")
    ?? undefined;
  if (!sharedDefinitions && localDefinitions) {
    sharedDefinitions = localDefinitions.cloneNode(true) as SVGElement;
    sharedDefinitionTemplates.set(ownerDocument, sharedDefinitions);
  }
  if (sharedDefinitions && localDefinitions?.isEqualNode(sharedDefinitions)) localDefinitions.remove();
  return sharedDefinitions;
}

function installSharedWaveDromDefinitions(ownerDocument: Document, definitions: SVGElement): void {
  if (!ownerDocument.body || typeof ownerDocument.createElementNS !== "function" || typeof ownerDocument.querySelector !== "function") return;
  let sprite = sharedDefinitionSprites.get(ownerDocument)
    ?? ownerDocument.querySelector<SVGSVGElement>("svg[data-wavedrom-definition-sprite]")
    ?? undefined;
  if (!sprite) {
    sprite = ownerDocument.createElementNS("http://www.w3.org/2000/svg", "svg");
    sprite.setAttribute("data-wavedrom-definition-sprite", "true");
    sprite.setAttribute("aria-hidden", "true");
    sprite.setAttribute("focusable", "false");
    sprite.setAttribute("width", "0");
    sprite.setAttribute("height", "0");
    sprite.style.cssText = "position:absolute;left:-10000px;top:-10000px;width:0;height:0;overflow:hidden;pointer-events:none";
    ownerDocument.body.append(sprite);
  }
  sharedDefinitionSprites.set(ownerDocument, sprite);
  if (!sprite.querySelector("defs")) sprite.append(definitions.cloneNode(true));
}

function parseWaveDromSvgMarkup(ownerDocument: Document, markup: string): SVGElement {
  const template = ownerDocument.createElement("template");
  template.innerHTML = markup.trim();
  const parsed = template.content.firstElementChild;
  if (!parsed || parsed.namespaceURI !== "http://www.w3.org/2000/svg" || parsed.localName !== "svg") {
    throw new WaveDromAdapterError("INVALID_WAVEDROM_SVG", "WaveDrom did not return an SVG root.");
  }
  return parsed as SVGElement;
}

type ValueLabelTemplate = Readonly<{ template: SVGElement; segmentStart: number; segmentEnd: number }>;

function valueLabelTemplates(entry: MarkupCacheEntry, source: SVGElement, ownerDocument: Document, wave: string, expectedCount: number): readonly ValueLabelTemplate[] | undefined {
  const templatesByDocument = entry.valueLabelTemplatesByDocument ??= new WeakMap<Document, readonly ValueLabelTemplate[]>();
  const cached = templatesByDocument.get(ownerDocument);
  if (cached) return cached.length === expectedCount ? cached : undefined;
  const nodes = source.querySelectorAll<SVGElement>('text[text-anchor="middle"]');
  if (nodes.length !== expectedCount) return;
  const slots = [...wave].flatMap((token, index) => token === "=" ? [index] : []);
  if (slots.length !== expectedCount) return;
  const grid = Array.from(source.querySelectorAll<SVGElement>('line[id^="gmark_"]'), (line) => Number(line.getAttribute("x1")));
  if (grid.length < wave.length + 1 || grid.some((value) => !Number.isFinite(value))) return;
  const templates = Object.freeze(Array.from(nodes, (node, index) => {
    const slot = slots[index]!;
    const endSlot = slots[index + 1] ?? wave.length;
    return { template: node.cloneNode(true) as SVGElement, segmentStart: grid[slot]!, segmentEnd: grid[endSlot]! };
  }));
  if (templates.some(({ template }) => !template.querySelector("tspan"))) return;
  templatesByDocument.set(ownerDocument, templates);
  return templates;
}

function bindValueLabel(text: SVGElement, label: string, semanticValue: string, metadata: ValueLabelTemplate, index: number, ownerDocument: Document): void {
  const tspan = text.querySelector("tspan");
  if (!tspan) throw new WaveDromAdapterError("INVALID_WAVEDROM_LABELS", "WaveDrom data label template did not contain a tspan.");
  tspan.textContent = label;
  text.setAttribute("data-value-label-index", String(index));
  text.setAttribute("data-value-label-mode", "normal");
  text.setAttribute("data-value-label-segment-start", String(metadata.segmentStart));
  text.setAttribute("data-value-label-segment-end", String(metadata.segmentEnd));
  text.setAttribute("aria-label", semanticValue);
  text.setAttribute("tabindex", "0");
  // The SVG skin stylesheet is inside the image resource. These equivalent
  // attributes keep overlaid text visually faithful in the containing SVG.
  text.setAttribute("font-family", "Helvetica");
  text.setAttribute("font-size", "11pt");
  text.setAttribute("fill", "#000");
  const title = ownerDocument.createElementNS("http://www.w3.org/2000/svg", "title");
  title.textContent = semanticValue;
  text.append(title);
}

function applyValueLabels(svg: SVGElement, labels: readonly string[], semanticValues: readonly string[], templates: readonly ValueLabelTemplate[], ownerDocument: Document): void {
  const nodes = svg.querySelectorAll<SVGElement>('text[text-anchor="middle"]');
  if (nodes.length !== labels.length || templates.length !== labels.length) throw new WaveDromAdapterError("INVALID_WAVEDROM_LABELS", "WaveDrom data label nodes do not match the WaveJSON data slots.");
  Array.from(nodes).forEach((node, index) => bindValueLabel(node, labels[index]!, semanticValues[index]!, templates[index]!, index, ownerDocument));
}

function createWaveImageSvg(rootAttributes: Readonly<Record<string, string>>, ownerDocument: Document, imageUrl: string, renderIndex: number, labels: readonly string[] = [], semanticValues: readonly string[] = [], labelTemplates: readonly ValueLabelTemplate[] = []): SVGElement {
  const svg = ownerDocument.createElementNS("http://www.w3.org/2000/svg", "svg");
  for (const [name, value] of Object.entries(rootAttributes)) {
    if (name === "id" || name === "xmlns" || name === "xmlns:xlink") continue;
    svg.setAttribute(name, value);
  }
  svg.setAttribute("id", `svgcontent_${renderIndex}`);
  const image = ownerDocument.createElementNS("http://www.w3.org/2000/svg", "image");
  image.setAttribute("x", "0");
  image.setAttribute("y", "0");
  image.setAttribute("width", "100%");
  image.setAttribute("height", "100%");
  image.setAttribute("preserveAspectRatio", "none");
  image.setAttribute("data-wave-svg-image", "");
  image.setAttribute("data-wave-svg-source", imageUrl);
  image.setAttribute("href", imageUrl);
  svg.append(image);
  for (let index = 0; index < labels.length; index += 1) {
    const metadata = labelTemplates[index];
    if (!metadata) throw new WaveDromAdapterError("INVALID_WAVEDROM_LABELS", "A shared WaveDrom data-label template is unavailable.");
    const label = metadata.template.cloneNode(true) as SVGElement;
    bindValueLabel(label, labels[index]!, semanticValues[index]!, metadata, index, ownerDocument);
    svg.append(label);
  }
  return svg;
}

function isSvgGeometryDebugMode(): boolean {
  try { return typeof location !== "undefined" && new URLSearchParams(location.search).get("geometrySource") === "svg"; }
  catch { return false; }
}

/**
 * WaveDrom 3.6.2 emits owner-specific SVG IDs by appending the render index
 * to otherwise identical markup. The geometry/rendering payload is shared, so
 * only those generated IDs (and any references to them) need to be rebound for
 * another Signal owner.
 */
function bindWaveDromRenderIndex(svg: SVGElement, renderIndex: number): void {
  if (renderIndex === 0) return;

  const elements = [svg, ...Array.from(svg.querySelectorAll("*"))];
  const idMap = new Map<string, string>();
  for (const element of elements) {
    const id = element.getAttribute("id");
    if (id?.endsWith("_0")) idMap.set(id, `${id.slice(0, -2)}_${renderIndex}`);
  }
  if (!idMap.has("svgcontent_0") || !idMap.has("lanes_0") || !idMap.has("wavelane_draw_0_0")) {
    throw new WaveDromAdapterError("INVALID_WAVEDROM_IDS", "WaveDrom SVG does not expose the expected render-indexed owner IDs.");
  }

  for (const element of elements) {
    const id = element.getAttribute("id");
    if (id) {
      const rebound = idMap.get(id);
      if (rebound) element.setAttribute("id", rebound);
    }
    for (let index = 0; index < element.attributes.length; index += 1) {
      const attribute = element.attributes.item(index);
      if (!attribute) continue;
      const name = attribute.name.toLowerCase();
      let value = attribute.value;
      if (name === "aria-labelledby" || name === "aria-describedby" || name === "for" || name === "headers") {
        value = value.split(/\s+/).map((token) => idMap.get(token) ?? token).join(" ");
      } else {
        // WaveDrom's large path/geometry attributes contain no fragment IDs.
        // Avoid running the fragment-rewrite regex across every such value
        // for every cloned owner SVG.
        if (!value.includes("#")) continue;
        value = value.replace(/#([^\s)'\"]+)/g, (match, referencedId: string) => {
          const rebound = idMap.get(referencedId);
          return rebound ? `#${rebound}` : match;
        });
      }
      if (value !== attribute.value) element.setAttribute(attribute.name, value);
    }
    if (element.localName.toLowerCase() === "style" && element.textContent?.includes("#")) {
      element.textContent = element.textContent.replace(/#([^\s)'\"]+)/g, (match, referencedId: string) => {
        const rebound = idMap.get(referencedId);
        return rebound ? `#${rebound}` : match;
      });
    }
  }
}

export class ProductionWaveDromAdapter implements WaveDromAdapter {
  readonly #renderIndices = new Map<SignalId, number>();
  readonly #active = new Map<SignalId, ActiveOwner>();
  readonly #markupCache = new Map<SignalId, SignalMarkupBinding>();
  readonly #retainedMarkupCache = new Map<SignalId, SignalMarkupBinding>();
  readonly #sharedMarkupCache = new Map<string, MarkupCacheEntry>();
  readonly #renderCallsBySignal = new Map<SignalId, number>();
  readonly #preparedDurationMs = new WeakMap<RenderedWave, number>();
  readonly #preparedArtifact = new WeakMap<RenderedWave, MarkupCacheEntry>();
  readonly #preparedDefinitions = new WeakMap<RenderedWave, SVGElement>();
  readonly #waveMarkupArtifactIdentities = new WeakMap<WaveJsonSignal, WaveMarkupArtifactIdentity>();
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
  #imageObjectUrlsCreated = 0;
  #imageObjectUrlsRevoked = 0;

  toWaveJson(source: CanonicalSignalSource): WaveJsonSignal {
    const startedAt = now();
    const result = toWaveJson(source);
    const durationMs = now() - startedAt;
    this.#waveJsonDurationMs += durationMs;
    this.#renderStageTotals.sourcePreparationMs += durationMs;
    return result;
  }

  waveMarkupArtifactKey(waveJson: WaveJsonSignal, semanticValues: readonly string[] = EMPTY_SEMANTIC_VALUES): string {
    const identity = createWaveMarkupArtifactIdentity(waveJson, semanticValues);
    this.#waveMarkupArtifactIdentities.set(waveJson, identity);
    return identity.key;
  }

  async renderWave(signalId: SignalId, waveJson: WaveJsonSignal, mount: Element, semanticValues: readonly string[] = []): Promise<RenderedWave> {
    const prepared = await this.prepareWave(signalId, waveJson, mount.ownerDocument, semanticValues);
    await prepared.svgImageReady;
    return this.installWave(prepared, mount);
  }

  async prepareWave(signalId: SignalId, waveJson: WaveJsonSignal, ownerDocument: Document, semanticValues: readonly string[] = EMPTY_SEMANTIC_VALUES): Promise<RenderedWave> {
    const startedAt = now();
    const stages = Object.fromEntries(Object.keys(this.#renderStageTotals).map((key) => [key, 0])) as Record<string, number>;
    let stageStartedAt = now();
    this.#renderCalls += 1;
    this.#renderCallsBySignal.set(signalId, (this.#renderCallsBySignal.get(signalId) ?? 0) + 1);
    const precomputedIdentity = this.#waveMarkupArtifactIdentities.get(waveJson);
    const identity = precomputedIdentity?.semanticValues === semanticValues
      ? precomputedIdentity
      : createWaveMarkupArtifactIdentity(waveJson, semanticValues);
    this.#waveMarkupArtifactIdentities.delete(waveJson);
    const { key: cacheKey, shareLabels, artifactWaveJson, artifactSemanticValues } = identity;
    stages.cacheKeySerializeMs = now() - stageStartedAt;
    let renderIndex = this.#renderIndices.get(signalId);
    let cached = this.#markupCache.get(signalId);
    if (renderIndex === undefined) {
      const retained = this.#retainedMarkupCache.get(signalId);
      if (retained?.key === cacheKey) {
        renderIndex = retained.renderIndex;
        cached = retained;
        this.#deleteBinding(this.#retainedMarkupCache, signalId);
      } else {
        this.#deleteBinding(this.#retainedMarkupCache, signalId);
      }
      if (renderIndex === undefined) renderIndex = this.#nextRenderIndex++;
      this.#renderIndices.set(signalId, renderIndex);
    }
    const signalCacheHit = cached?.key === cacheKey && cached.renderIndex === renderIndex;
    let cacheEntry = signalCacheHit ? cached?.artifact : this.#sharedMarkupCache.get(cacheKey);
    const markupCacheHit = cacheEntry !== undefined;
    let markup: string;
    if (cacheEntry) {
      this.#touchSharedMarkupCache(cacheKey, cacheEntry);
      markup = cacheEntry.markup;
      stages.waveJsonBytes = cacheEntry.waveJsonBytes;
      stages.semanticValuesBytes = cacheEntry.semanticValuesBytes;
      stages.svgMarkupBytes = cacheEntry.svgMarkupBytes;
      this.#cacheHits += 1;
    } else {
      stageStartedAt = now();
      const serializedWaveJson = identity.serializedWaveJson ?? JSON.stringify(waveJson);
      const serializedSemanticValues = identity.serializedSemanticValues ?? JSON.stringify(semanticValues);
      stages.waveJsonBytes = utf8Encoder.encode(serializedWaveJson).byteLength;
      stages.semanticValuesBytes = utf8Encoder.encode(serializedSemanticValues).byteLength;
      stages.metricCollectionOverheadMs = (stages.metricCollectionOverheadMs ?? 0) + now() - stageStartedAt;
      // Render a canonical owner-zero artifact once. The owner-specific IDs
      // are rebound on the detached SVG clone below, avoiding a full
      // WaveDrom layout/stringify pass for semantically identical signals.
      const generated = renderWaveJsonMarkupWithMetrics(artifactWaveJson, 0, artifactSemanticValues);
      markup = generated.markup;
      stages.waveDromRenderAnyMs = generated.metrics.waveDromRenderAnyMs;
      stages.onmlStringifyMs = generated.metrics.onmlStringifyMs;
      stages.valueLabelLayoutMs = generated.metrics.valueLabelLayoutMs;
      stages.markupSafetyMs = generated.metrics.markupSafetyMs;
      stages.svgMarkupBytes = generated.metrics.svgMarkupBytes;
      this.#cacheMisses += 1;
      cacheEntry = {
        markup,
        rootAttributes: generated.rootAttributes,
        waveJsonBytes: stages.waveJsonBytes,
        semanticValuesBytes: stages.semanticValuesBytes,
        svgMarkupBytes: stages.svgMarkupBytes,
        references: 0,
      };
      this.#touchSharedMarkupCache(cacheKey, cacheEntry);
    }
    const binding: SignalMarkupBinding = { key: cacheKey, renderIndex, artifact: cacheEntry };
    this.#setBinding(this.#markupCache, signalId, binding);
    const cachedSvg = cacheEntry.parsedSvgByDocument?.get(ownerDocument);
    // Keep each validated WaveDrom payload out of the parent document's DOM.
    // The canonical parsed SVG remains available for geometry extraction.
    const useSharedSvgImage = !isSvgGeometryDebugMode()
      && typeof ownerDocument.createElementNS === "function";
    const imageUrl = useSharedSvgImage ? this.#svgImageUrl(cacheEntry, ownerDocument) : undefined;
    const canUseImageWithoutParsedTree = imageUrl !== undefined && !shareLabels;
    let svg: Element | null;
    let parsedSvg: SVGElement | undefined;
    if (cachedSvg && useSharedSvgImage) {
      svg = cachedSvg;
      parsedSvg = cachedSvg;
      stages.templateParseMs = 0;
    } else if (cachedSvg) {
      svg = cachedSvg.cloneNode(true) as SVGElement;
      parsedSvg = svg as SVGElement;
      stages.templateParseMs = 0;
    } else if (canUseImageWithoutParsedTree) {
      // The browser decodes this same markup as the image payload. Non-shared
      // labels need no detached descendant tree, so use WaveDrom's root attrs
      // and avoid parsing the full SVG a second time on the cold Open path.
      svg = createWaveImageSvg(cacheEntry.rootAttributes, ownerDocument, imageUrl!, renderIndex);
      stages.templateParseMs = 0;
    } else {
      stageStartedAt = now();
      svg = parseWaveDromSvgMarkup(ownerDocument, markup);
      stages.templateParseMs = now() - stageStartedAt;
      parsedSvg = svg as SVGElement;
    }
    if (!svg || svg.namespaceURI !== "http://www.w3.org/2000/svg" || svg.localName !== "svg") {
      throw new WaveDromAdapterError("INVALID_WAVEDROM_SVG", "WaveDrom did not return an SVG root.");
    }
    const safetyCacheEntry = cacheEntry;
    // Every cached markup entry passed assertSafeWaveDromMarkup before it was
    // parsed. Re-walking its full SVG subtree here duplicates that trust-boundary
    // check for no additional input: the parsed tree is made from this exact
    // internally generated, already validated markup.
    const svgSafetyCacheHit = markupCacheHit || Boolean(cachedSvg);
    stages.svgSafetyDomWalkMs = 0;
    if (!cachedSvg && parsedSvg) {
      const parsedSvgByDocument = safetyCacheEntry.parsedSvgByDocument ??= new WeakMap<Document, SVGElement>();
      // On the production image path parsedSvg stays detached and immutable;
      // owners receive separate image wrappers, so retain it directly instead
      // of cloning the full SVG on cold Open. The inline/debug path mutates its
      // parsed node while binding labels, so it still needs a private template.
      parsedSvgByDocument.set(ownerDocument, useSharedSvgImage ? parsedSvg : parsedSvg.cloneNode(true) as SVGElement);
    }
    const labelTemplates = shareLabels ? valueLabelTemplates(safetyCacheEntry, parsedSvg!, ownerDocument, waveJson.wave, waveJson.data!.length) : undefined;
    if (shareLabels && !labelTemplates) {
      throw new WaveDromAdapterError("INVALID_WAVEDROM_LABELS", "WaveDrom did not expose the expected data-label templates for a shareable artifact.");
    }
    if (shareLabels && !useSharedSvgImage) applyValueLabels(svg as SVGElement, waveJson.data!, semanticValues, labelTemplates!, ownerDocument);
    let svgImageReady: Promise<void> | undefined;
    if (useSharedSvgImage) {
      if (imageUrl) {
        const imageOwnerSvg = canUseImageWithoutParsedTree
          ? svg as SVGElement
          : createWaveImageSvg(safetyCacheEntry.rootAttributes, ownerDocument, imageUrl, renderIndex, shareLabels ? waveJson.data : [], shareLabels ? semanticValues : [], labelTemplates ?? []);
        svg = imageOwnerSvg;
        // Start decoding now, but don't serialize independent owner decodes
        // behind WaveRenderScheduler's per-owner preparation jobs. The batch
        // waits for all image-ready promises together before publishing ready.
        svgImageReady = this.#svgImageDecode(safetyCacheEntry, ownerDocument, imageUrl).catch(() => {
          const fallbackSvg = (parsedSvg?.cloneNode(true) as SVGElement | undefined)
            ?? parseWaveDromSvgMarkup(ownerDocument, markup);
          if (!parsedSvg) {
            const parsedSvgByDocument = safetyCacheEntry.parsedSvgByDocument ??= new WeakMap<Document, SVGElement>();
            parsedSvgByDocument.set(ownerDocument, fallbackSvg.cloneNode(true) as SVGElement);
          }
          if (shareLabels) applyValueLabels(fallbackSvg, waveJson.data!, semanticValues, labelTemplates!, ownerDocument);
          if (renderIndex > 0) bindWaveDromRenderIndex(fallbackSvg, renderIndex);
          imageOwnerSvg.replaceChildren(...Array.from(fallbackSvg.childNodes));
        });
      } else {
        svg = (parsedSvg ?? parseWaveDromSvgMarkup(ownerDocument, markup)).cloneNode(true) as SVGElement;
      }
    }
    const isImageOwner = typeof svg?.querySelector === "function" && Boolean(svg.querySelector("image[data-wave-svg-image]"));
    const sharedDefinitions = isImageOwner ? undefined : prepareSharedWaveDromDefinitions(svg as SVGElement, ownerDocument);
    if (!isImageOwner) bindWaveDromRenderIndex(svg as SVGElement, renderIndex);
    const renderStages = Object.freeze({ ...stages });
    const rendered: RenderedWave = {
      signalId, ownerKey: signalId, svg: svg as SVGElement,
      ...(isImageOwner && parsedSvg ? { geometrySvg: parsedSvg } : {}),
      ...(svgImageReady ? { svgImageReady } : {}),
      renderIndex, waveJson, markupCacheHit, svgSafetyCacheHit, renderStages,
    };
    if (sharedDefinitions) this.#preparedDefinitions.set(rendered, sharedDefinitions);
    this.#preparedDurationMs.set(rendered, now() - startedAt);
    this.#preparedArtifact.set(rendered, cacheEntry);
    return rendered;
  }

  installWave(prepared: RenderedWave, mount: Element): RenderedWave {
    const preparedDurationMs = this.#preparedDurationMs.get(prepared);
    if (preparedDurationMs === undefined) throw new WaveDromAdapterError("INVALID_PREPARED_WAVE", "WaveDrom SVG must be prepared by this adapter before installation.");
    this.#preparedDurationMs.delete(prepared);
    const artifact = this.#preparedArtifact.get(prepared) ?? this.#markupCache.get(prepared.signalId)?.artifact;
    if (!artifact) throw new WaveDromAdapterError("INVALID_PREPARED_WAVE", "Prepared WaveDrom artifact ownership was released before installation.");
    this.#preparedArtifact.delete(prepared);
    this.#retainArtifact(artifact);
    const existing = this.#active.get(prepared.signalId);
    if (existing) {
      if (existing.mount !== mount) this.#clearOwner(existing);
      else this.#releaseArtifact(existing.artifact);
    }
    const stageStartedAt = now();
    const shared = this.#preparedDefinitions.get(prepared);
    const localDefinitions = typeof prepared.svg.querySelector === "function" ? prepared.svg.querySelector("defs") : null;
    const definitions = shared ?? localDefinitions;
    if (definitions) {
      installSharedWaveDromDefinitions(mount.ownerDocument, definitions);
      if (localDefinitions?.isEqualNode(definitions)) localDefinitions.remove();
    }
    this.#preparedDefinitions.delete(prepared);
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
    this.#active.set(prepared.signalId, { mount, rendered, artifact });
    this.#lastRenderStages = renderStages;
    const stageTotals = this.#renderStageTotals as Record<string, number>;
    for (const [key, value] of Object.entries(renderStages)) stageTotals[key] = (stageTotals[key] ?? 0) + value;
    this.#renderDurationMs += renderStages.totalSignalWallMs;
    this.#mounts += 1;
    return rendered;
  }

  extractLocalGeometry(rendered: RenderedWave): LocalGeometryMap {
    const extractionMetrics = { signalId: rendered.signalId, usesVisited: 0, geometryEntriesEmitted: 0, duplicateKeyChecks: 0, duplicateKeyCollisions: 0, transitionBrickLookups: 0, skinPathParses: 0, matrixReads: 0, durationMs: 0 };
    // Shared parsed templates retain WaveDrom's canonical owner-zero IDs.
    // Geometry is identical for an exact markup-cache hit, so resolve those
    // IDs against owner zero instead of cloning/rebinding the entire SVG tree
    // for every image-backed owner.
    let geometrySource = rendered.geometrySvg
      ? { ...rendered, svg: rendered.geometrySvg, renderIndex: 0 }
      : rendered;
    if (!rendered.geometrySvg && rendered.svg.querySelector("image[data-wave-svg-image]")) {
      const binding = this.#markupCache.get(rendered.signalId) ?? this.#retainedMarkupCache.get(rendered.signalId);
      const artifact = binding?.artifact;
      const ownerDocument = rendered.svg.ownerDocument;
      if (artifact && ownerDocument) {
        const parsedByDocument = artifact.parsedSvgByDocument ??= new WeakMap<Document, SVGElement>();
        let geometrySvg = parsedByDocument.get(ownerDocument);
        if (!geometrySvg) {
          geometrySvg = parseWaveDromSvgMarkup(ownerDocument, artifact.markup);
          parsedByDocument.set(ownerDocument, geometrySvg);
        }
        geometrySource = { ...rendered, svg: geometrySvg, renderIndex: 0 };
      }
    }
    const geometry = extractLocalGeometry(geometrySource, extractionMetrics);
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
    this.#deleteBinding(this.#markupCache, signalId);
    this.#deleteBinding(this.#retainedMarkupCache, signalId);
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
    this.#deleteBinding(this.#retainedMarkupCache, signalId);
    this.#retainedMarkupCache.set(signalId, cached);
    while (this.#retainedMarkupCache.size > RETAINED_MARKUP_CACHE_LIMIT) {
      const oldestSignalId = this.#retainedMarkupCache.keys().next().value as SignalId | undefined;
      if (oldestSignalId === undefined) break;
      this.#deleteBinding(this.#retainedMarkupCache, oldestSignalId);
    }
  }

  disposeAll(): void {
    for (const owner of this.#active.values()) this.#clearOwner(owner);
    this.#active.clear();
    for (const signalId of this.#markupCache.keys()) this.#deleteBinding(this.#markupCache, signalId);
    for (const signalId of this.#retainedMarkupCache.keys()) this.#deleteBinding(this.#retainedMarkupCache, signalId);
    for (const entry of this.#sharedMarkupCache.values()) this.#releaseArtifact(entry);
    this.#sharedMarkupCache.clear();
    this.#renderIndices.clear();
    this.#renderCallsBySignal.clear();
  }

  metrics(): WaveDromAdapterMetrics {
    return { renderCalls: this.#renderCalls, waveJsonDurationMs: this.#waveJsonDurationMs, renderDurationMs: this.#renderDurationMs, renderStages: Object.freeze({ last: this.#lastRenderStages, totals: Object.freeze({ ...this.#renderStageTotals }) }), renderCallsBySignal: Object.fromEntries(this.#renderCallsBySignal), cacheHits: this.#cacheHits, cacheMisses: this.#cacheMisses, mounts: this.#mounts, disposals: this.#disposals, geometryBuilds: this.#geometryBuilds, geometryMatrixReads: this.#geometryMatrixReads, activeOwners: this.#active.size, allocatedRenderIndices: this.#renderIndices.size, imageObjectUrlsCreated: this.#imageObjectUrlsCreated, imageObjectUrlsRevoked: this.#imageObjectUrlsRevoked, imageObjectUrlsRetained: this.#imageObjectUrlsCreated - this.#imageObjectUrlsRevoked };
  }

  #clearOwner(owner: ActiveOwner): void {
    this.#disposals += 1;
    if (owner.rendered.svg.parentElement === owner.mount) owner.rendered.svg.remove();
    if (owner.mount.getAttribute("data-wave-owner") === owner.rendered.signalId) owner.mount.removeAttribute("data-wave-owner");
    this.#releaseArtifact(owner.artifact);
  }

  #setBinding(cache: Map<SignalId, SignalMarkupBinding>, signalId: SignalId, binding: SignalMarkupBinding): void {
    const previous = cache.get(signalId);
    if (previous) this.#releaseArtifact(previous.artifact);
    this.#retainArtifact(binding.artifact);
    cache.set(signalId, binding);
  }

  #touchSharedMarkupCache(key: string, entry: MarkupCacheEntry): void {
    const current = this.#sharedMarkupCache.get(key);
    if (current !== entry) {
      if (current) this.#releaseArtifact(current);
      this.#retainArtifact(entry);
    }
    this.#sharedMarkupCache.delete(key);
    this.#sharedMarkupCache.set(key, entry);
    while (this.#sharedMarkupCache.size > SHARED_MARKUP_CACHE_LIMIT) {
      const oldestKey = this.#sharedMarkupCache.keys().next().value as string | undefined;
      if (oldestKey === undefined) break;
      const evicted = this.#sharedMarkupCache.get(oldestKey);
      this.#sharedMarkupCache.delete(oldestKey);
      if (evicted) this.#releaseArtifact(evicted);
    }
  }

  #deleteBinding(cache: Map<SignalId, SignalMarkupBinding>, signalId: SignalId): void {
    const binding = cache.get(signalId);
    if (!binding) return;
    cache.delete(signalId);
    this.#releaseArtifact(binding.artifact);
  }

  #retainArtifact(entry: MarkupCacheEntry): void {
    entry.references += 1;
  }

  #releaseArtifact(entry: MarkupCacheEntry): void {
    entry.references = Math.max(0, entry.references - 1);
    if (entry.references > 0) return;
    for (const [ownerDocument, resource] of entry.svgImageResourcesByDocument ?? []) {
      resource.releasePending = true;
      this.#revokeImageResourceWhenIdle(entry, ownerDocument, resource);
    }
  }

  #svgImageUrl(entry: MarkupCacheEntry, ownerDocument: Document): string | undefined {
    if (typeof URL.createObjectURL !== "function" || typeof Blob !== "function") return;
    const resources = entry.svgImageResourcesByDocument ??= new Map<Document, SvgImageResource>();
    const cached = resources.get(ownerDocument);
    if (cached) return cached.url;
    const resource = { url: URL.createObjectURL(new Blob([entry.markup], { type: "image/svg+xml;charset=utf-8" })) };
    resources.set(ownerDocument, resource);
    this.#imageObjectUrlsCreated += 1;
    return resource.url;
  }

  #svgImageDecode(entry: MarkupCacheEntry, ownerDocument: Document, url: string): Promise<void> {
    const resource = entry.svgImageResourcesByDocument?.get(ownerDocument);
    if (!resource || resource.url !== url) return Promise.reject(new WaveDromAdapterError("WAVEDROM_IMAGE_RESOURCE_MISSING", "The WaveDrom SVG image resource was released before decode."));
    if (resource.decoded) return resource.decoded;
    const ImageConstructor = ownerDocument.defaultView?.Image;
    if (!ImageConstructor) return Promise.resolve();
    const image = new ImageConstructor();
    image.src = url;
    const decode = typeof image.decode === "function"
      ? image.decode().then(() => undefined)
      : new Promise<void>((resolve, reject) => {
          image.onload = () => resolve();
          image.onerror = () => reject(new WaveDromAdapterError("WAVEDROM_IMAGE_DECODE_FAILED", "The validated WaveDrom SVG image could not be decoded."));
        });
    resource.decodePending = true;
    resource.decoded = decode.then(
      () => { resource.decodePending = false; this.#revokeImageResourceWhenIdle(entry, ownerDocument, resource); },
      (error: unknown) => { resource.decodePending = false; this.#revokeImageResourceWhenIdle(entry, ownerDocument, resource); throw error; },
    );
    return resource.decoded;
  }

  #revokeImageResourceWhenIdle(entry: MarkupCacheEntry, ownerDocument: Document, resource: SvgImageResource): void {
    if (!resource.releasePending || entry.references > 0 || resource.decodePending) return;
    if (!entry.svgImageResourcesByDocument?.delete(ownerDocument)) return;
    URL.revokeObjectURL(resource.url);
    this.#imageObjectUrlsRevoked += 1;
  }
}
