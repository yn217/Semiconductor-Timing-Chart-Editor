import { describe, expect, it, vi } from "vitest";
import WaveDrom from "wavedrom";
import {
  ProductionWaveDromAdapter,
  WAVEDROM_STATE_TOKENS,
  WAVEDROM_UNSUPPORTED_CAPABILITIES,
  WAVEDROM_VERSION,
  assertSafeWaveDromMarkup,
  canShareValueLabelGeometry,
  renderWaveJsonMarkup,
  renderWaveJsonMarkupWithMetrics,
  toWaveJson,
  toWaveJsonWindow,
  VALUE_LABEL_LAYOUT_POLICY,
  type WaveJsonSignal,
} from "@timing-chart-v2/wavedrom-adapter";
import type { ClockSignal, SignalId, ValueSignal } from "@timing-chart-v2/schema";
import { canonicalFixture } from "../fixtures/canonical.js";

const signalId = (value: string) => value as SignalId;

function logicSignal(values: ValueSignal["values"], id = "sig_logic"): ValueSignal {
  return {
    id: signalId(id), name: "LOGIC", type: "logic", role: "internal",
    source: { instancePath: [], signalName: "LOGIC" }, display: { name: "LOGIC" }, values,
  };
}

function referenceMarkup(waveJson: WaveJsonSignal): string {
  return WaveDrom.onml.stringify(WaveDrom.renderAny(0, { signal: [waveJson] }, WaveDrom.waveSkin));
}

function createMarkupDocument(): Document {
  const createElement = () => {
    let children: FakeSvgElement[] = [];
    let parsedRoot = makeFakeSvgElement("svg", children);
    return {
      content: { get firstElementChild() { return parsedRoot; } },
      set innerHTML(markup: string) {
        const ids = [...markup.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]!);
        children = ids.filter((id) => id !== ids[0]).map((id) => makeFakeSvgElement("g", [], id));
        parsedRoot = makeFakeSvgElement("svg", children, ids[0] ?? "");
      },
    };
  };
  return { createElement } as unknown as Document;
}

interface FakeSvgElement {
  localName: string;
  namespaceURI: string;
  parentElement?: Element | null;
  textContent: string | null;
  readonly attributes: { readonly length: number; item(index: number): Attr | null };
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
  querySelectorAll(selector: string): FakeSvgElement[];
  cloneNode(deep?: boolean): FakeSvgElement;
  remove(): void;
}

function makeFakeSvgElement(localName: string, descendants: FakeSvgElement[], id?: string): FakeSvgElement {
  const values = new Map<string, string>();
  if (id) values.set("id", id);
  const element: FakeSvgElement = {
    localName,
    namespaceURI: "http://www.w3.org/2000/svg",
    parentElement: null,
    textContent: "",
    get attributes() {
      const entries = [...values.entries()].map(([name, value]) => ({ name, value }) as Attr);
      return { length: entries.length, item: (index: number) => entries[index] ?? null };
    },
    getAttribute: (name) => values.get(name) ?? null,
    setAttribute: (name, value) => { values.set(name, value); },
    removeAttribute: (name) => { values.delete(name); },
    querySelectorAll: (selector) => {
      const matches = selector === "[id]" ? descendants.filter((child) => child.getAttribute("id") !== null) : descendants;
      return Object.assign(matches, { item: (index: number) => matches[index] ?? null });
    },
    cloneNode: (deep = false) => {
      const clonedChildren = deep ? descendants.map((child) => child.cloneNode(true)) : [];
      const clone = makeFakeSvgElement(localName, clonedChildren);
      for (const [name, value] of values) clone.setAttribute(name, value);
      clone.textContent = element.textContent;
      return clone;
    },
    remove: () => { element.parentElement = null; },
  };
  return element;
}

function createMarkupMount(ownerDocument: Document): Element {
  let mounted: FakeSvgElement | undefined;
  const mount = {
    ownerDocument,
    setAttribute: vi.fn(),
    getAttribute: vi.fn(() => "owner"),
    removeAttribute: vi.fn(),
    replaceChildren(child?: FakeSvgElement) {
      mounted = child;
      if (mounted) mounted.parentElement = mount as unknown as Element;
    },
    querySelector: (selector: string) => selector === "svg" ? mounted : undefined,
  };
  return mount as unknown as Element;
}

describe(`WaveDrom adapter ${WAVEDROM_VERSION} conversion`, () => {
  it("shares large data-label geometry only when the normal label is unmodified", () => {
    const waveJson: WaveJsonSignal = {
      wave: `=${".".repeat(249)}=${".".repeat(249)}`,
      data: ["00000005", "00000006"],
    };

    expect(canShareValueLabelGeometry(waveJson, waveJson.data!)).toBe(true);
    expect(canShareValueLabelGeometry(waveJson, ["first", "second"])).toBe(true);
    expect(canShareValueLabelGeometry({ wave: "=...=...", data: ["A", "B"] }, ["A", "B"])).toBe(false);
  });

  it("materializes mandatory binary and bus continuation", () => {
    const binary = logicSignal([{ start: 0, value: 0 }, { start: 3, value: 1 }, { start: 7, value: 0 }]);
    expect(toWaveJson({ signal: binary, cycleCount: 10 })).toEqual({ wave: "0..1...0.." });
    const bus = { ...canonicalFixture().signals[1]!, values: [{ start: 0, value: "IDLE" }, { start: 3, value: "0x1000" }, { start: 7, value: "IDLE" }] } as ValueSignal;
    expect(toWaveJson({ signal: bus, cycleCount: 10 })).toEqual({ wave: "=..=...=..", data: ["IDLE", "0x1000", "IDLE"] });
  });

  it("projects sized HDL bus literals using their declared width", () => {
    const bus = {
      ...canonicalFixture().signals[1]!,
      width: 4,
      displayFormat: "hex",
      values: [{ start: 0, value: "4'hFF" }, { start: 3, value: "8'h1FF" }],
    } as ValueSignal;
    expect(toWaveJson({ signal: bus, cycleCount: 6 })).toEqual({ wave: "=..=..", data: ["0xF", "0xFF"] });
  });

  it("covers every ordered transition in the supported non-clock token manifest", () => {
    let covered = 0;
    for (const from of WAVEDROM_STATE_TOKENS) {
      for (const to of WAVEDROM_STATE_TOKENS) {
        const waveJson = toWaveJson({ signal: logicSignal([{ start: 0, value: from }, { start: 2, value: to }], `sig_${from}_${to}`), cycleCount: 6 });
        expect(waveJson).toEqual({ wave: `${from}.${to}...` });
        expect(renderWaveJsonMarkup(waveJson)).toBe(referenceMarkup({ wave: `${from}.${to}...` }));
        covered += 1;
      }
    }
    expect(covered).toBe(WAVEDROM_STATE_TOKENS.length ** 2);
  });

  it.each([
    ["binary", { wave: "0.1..." }],
    ["bus", { wave: "=.=.", data: ["ADDR", "DATA"] }],
    ["clock", { wave: "p.n.", period: 2 }],
    ["gap", { wave: "0.|.1" }],
  ])("keeps render-index output identical except for generated IDs (%s)", (_kind, waveJson) => {
    const first = renderWaveJsonMarkup(waveJson, 0);
    const second = renderWaveJsonMarkup(waveJson, 1);
    const firstIds = [...first.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]!);
    const secondIds = [...second.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]!);
    const identity = new Map(secondIds.map((id, index) => [id, firstIds[index]!]));
    const normalizedSecond = second.replace(/\bid="([^"]+)"/g, (_match, id: string) => `id="${identity.get(id) ?? id}"`);
    const firstIndexedIds = firstIds.filter((id) => id.endsWith("_0"));
    const secondIndexedIds = secondIds.filter((id) => id.endsWith("_1"));

    expect(firstIds).toHaveLength(secondIds.length);
    expect(new Set(firstIds).size).toBe(firstIds.length);
    expect(new Set(secondIds).size).toBe(secondIds.length);
    expect(firstIndexedIds.length).toBeGreaterThan(1);
    expect(secondIndexedIds).toHaveLength(firstIndexedIds.length);
    expect(firstIndexedIds.some((id) => secondIndexedIds.includes(id))).toBe(false);
    expect(normalizedSecond).toBe(first);
  });

  it("covers the persistence matrix for every supported non-clock token", () => {
    for (const token of WAVEDROM_STATE_TOKENS) {
      for (const hold of [1, 2, 4, 8]) {
        const next = token === "0" ? "1" : "0";
        const waveJson = toWaveJson({ signal: logicSignal([{ start: 0, value: token }, { start: hold, value: next }]), cycleCount: hold + 4 });
        const expected = `${token}${".".repeat(hold - 1)}${next}...`;
        expect(waveJson).toEqual({ wave: expected });
        expect(renderWaveJsonMarkup(waveJson)).toBe(referenceMarkup({ wave: expected }));
      }
    }
  });

  it.each([1, 2, 3, 4])("preserves clock period %i and phase transforms", (period) => {
    const base = canonicalFixture().signals[0] as ClockSignal;
    const clock: ClockSignal = { ...base, generator: { ...base.generator, period, phase: 0.5 } };
    const waveJson = toWaveJson({ signal: clock, cycleCount: period * 4 });
    expect(waveJson).toEqual({ wave: "p...", ...(period === 1 ? {} : { period }), phase: 0.5 });
    expect(renderWaveJsonMarkup(waveJson)).toBe(referenceMarkup(waveJson));
  });

  it("maps negative clocks, aligned gating, suppression, and gaps without inventing geometry", () => {
    const base = canonicalFixture().signals[0] as ClockSignal;
    const clock: ClockSignal = {
      ...base,
      generator: { ...base.generator, initial: 1, polarity: "negative", suppressedPeriods: [3, 5] },
      enable: [{ start: 0, value: 1 }, { start: 2, value: 0 }, { start: 4, value: 1 }],
    };
    expect(toWaveJson({ signal: clock, cycleCount: 8 })).toEqual({ wave: "n.1.n1n." });
    expect(toWaveJson({ signal: logicSignal([{ start: 0, value: 0 }, { start: 4, value: 1 }]), cycleCount: 7, gapCycles: [2] })).toEqual({ wave: "0.|.1.." });
  });

  it("expands exact half-cycle duty through standard WaveDrom clock/value tokens", () => {
    const base = canonicalFixture().signals[0] as ClockSignal;
    const duty25 = { ...base, generator: { ...base.generator, period: 2, duty: 0.25 } } as ClockSignal;
    const duty75 = { ...base, generator: { ...base.generator, period: 2, duty: 0.75 } } as ClockSignal;
    const negative = { ...base, generator: { ...base.generator, period: 2, duty: 0.25, initial: 1 as const, polarity: "negative" as const } } as ClockSignal;
    expect(toWaveJson({ signal: duty25, cycleCount: 8 })).toEqual({ wave: "p0p0p0p0", clock: { expanded: true, polarity: "positive", initial: 0 } });
    expect(toWaveJson({ signal: duty75, cycleCount: 8 })).toEqual({ wave: "1p1p1p1p", clock: { expanded: true, polarity: "positive", initial: 0 } });
    expect(toWaveJson({ signal: negative, cycleCount: 8 })).toEqual({ wave: "n1n1n1n1", clock: { expanded: true, polarity: "negative", initial: 1 } });
    const unsupported = { ...base, generator: { ...base.generator, duty: 0.25 } } as ClockSignal;
    expect(() => toWaveJson({ signal: unsupported, cycleCount: 8 })).toThrowError(expect.objectContaining({ code: "UNSUPPORTED_CLOCK_DUTY" }));
    const fractional = logicSignal([{ start: 0, value: 0 }, { start: 1.5, value: 1 }]);
    expect(() => toWaveJson({ signal: fractional, cycleCount: 8 })).toThrowError(expect.objectContaining({ code: "UNSUPPORTED_CHANGE_POINT" }));
    expect(() => toWaveJson({ signal: logicSignal([{ start: 0, value: "maybe" }]), cycleCount: 8 })).toThrowError(expect.objectContaining({ code: "UNSUPPORTED_LOGIC_VALUE" }));
    const badPeriod = { ...base, generator: { ...base.generator, period: 0 } } as ClockSignal;
    expect(() => toWaveJson({ signal: badPeriod, cycleCount: 8 })).toThrowError(expect.objectContaining({ code: "UNSUPPORTED_CLOCK_PERIOD" }));
    const badPhase = { ...base, generator: { ...base.generator, phase: 0.25 } } as ClockSignal;
    expect(() => toWaveJson({ signal: badPhase, cycleCount: 8 })).toThrowError(expect.objectContaining({ code: "UNSUPPORTED_CLOCK_PHASE" }));
    const badStart = { ...base, generator: { ...base.generator, period: 2, start: 1 } } as ClockSignal;
    expect(() => toWaveJson({ signal: badStart, cycleCount: 8 })).toThrowError(expect.objectContaining({ code: "UNALIGNED_CLOCK_START" }));
    const badEnableValue = { ...base, enable: [{ start: 0, value: "maybe" }] } as ClockSignal;
    expect(() => toWaveJson({ signal: badEnableValue, cycleCount: 8 })).toThrowError(expect.objectContaining({ code: "UNSUPPORTED_CLOCK_ENABLE" }));
    const sparseEnable = { ...base, generator: { ...base.generator, period: 2, phase: 0, duty: 0.5 }, enable: [{ start: 0, value: 1 }, { start: 4, value: 0 }, { start: 8, value: 1 }] } as ClockSignal;
    expect(toWaveJson({ signal: sparseEnable, cycleCount: 12 })).toEqual({ wave: "p.0.p.", period: 2 });
    const badEnableAlign = { ...base, generator: { ...base.generator, period: 2 }, enable: [{ start: 1, value: 1 }] } as ClockSignal;
    expect(() => toWaveJson({ signal: badEnableAlign, cycleCount: 8 })).toThrowError(expect.objectContaining({ code: "UNALIGNED_CLOCK_ENABLE" }));
  });

  it("uses WaveDrom continuation for held levels in expanded-duty clock windows", () => {
    const base = canonicalFixture().signals[0] as ClockSignal;
    const cases = [
      {
        name: "25% positive",
        signal: { ...base, generator: { ...base.generator, period: 2, duty: 0.25 } } as ClockSignal,
        full: "p0p0p0p0",
        window: "p0p0",
        windowStart: 2,
      },
      {
        name: "75% positive",
        signal: { ...base, generator: { ...base.generator, period: 2, duty: 0.75 } } as ClockSignal,
        full: "1p1p1p1p",
        window: "1p1p",
        windowStart: 2,
      },
      {
        name: "25% negative",
        signal: { ...base, generator: { ...base.generator, period: 2, duty: 0.25, initial: 1 as const, polarity: "negative" as const } } as ClockSignal,
        full: "n1n1n1n1",
        window: "n1n1",
        windowStart: 2,
      },
      {
        name: "consecutive disabled periods",
        signal: { ...base, enable: [{ start: 0, value: 1 }, { start: 2, value: 0 }, { start: 8, value: 1 }], generator: { ...base.generator, period: 2, duty: 0.25 } } as ClockSignal,
        full: "p0......p0p0",
        window: "0...p0",
        windowStart: 4,
      },
      {
        name: "consecutive suppressed periods",
        signal: { ...base, generator: { ...base.generator, period: 2, duty: 0.25, suppressedPeriods: [1, 2, 3] } } as ClockSignal,
        full: "p0......p0p0",
        window: "0.p0p0",
        windowStart: 6,
      },
    ];

    for (const testCase of cases) {
      const fullWave = toWaveJson({ signal: testCase.signal, cycleCount: testCase.full.length });
      const boundedWave = toWaveJsonWindow(
        { signal: testCase.signal, cycleCount: testCase.full.length },
        testCase.windowStart,
        testCase.windowStart + testCase.window.length,
      );
      const expandedClock = { expanded: true, polarity: testCase.signal.generator.polarity, initial: testCase.signal.generator.initial };

      expect(fullWave.wave, `${testCase.name} full conversion`).toBe(testCase.full);
      expect(boundedWave.wave, `${testCase.name} bounded conversion`).toBe(testCase.window);
      expect(renderWaveJsonMarkup(fullWave), `${testCase.name} pinned full render`).toBe(referenceMarkup({ wave: testCase.full, clock: expandedClock }));
      expect(renderWaveJsonMarkup(boundedWave), `${testCase.name} pinned bounded render`).toBe(referenceMarkup({ wave: testCase.window, clock: expandedClock }));
    }
  });

  it("pins the production and test renderer to one WaveDrom version", () => {
    expect(WaveDrom.version).toBe(WAVEDROM_VERSION);
    expect(new ProductionWaveDromAdapter().metrics()).toMatchObject({ renderCalls: 0, waveJsonDurationMs: 0, renderDurationMs: 0, renderStages: { last: undefined, totals: { sourcePreparationMs: 0, metricCollectionOverheadMs: 0, cacheKeySerializeMs: 0, waveDromRenderAnyMs: 0, onmlStringifyMs: 0, valueLabelLayoutMs: 0, markupSafetyMs: 0, templateParseMs: 0, svgSafetyDomWalkMs: 0, domInstallMs: 0, totalSignalWallMs: 0, waveJsonBytes: 0, semanticValuesBytes: 0, svgMarkupBytes: 0 } }, renderCallsBySignal: {}, cacheHits: 0, cacheMisses: 0, mounts: 0, disposals: 0, geometryBuilds: 0, geometryMatrixReads: 0, activeOwners: 0, allocatedRenderIndices: 0 });
  });

  it("reuses cache-key JSON serialization for input byte diagnostics", async () => {
    const waveJson: WaveJsonSignal = { wave: "0..1...", data: ["READY"] };
    const semanticValues = ["READY"];
    const svg = {
      localName: "svg",
      namespaceURI: "http://www.w3.org/2000/svg",
      attributes: { length: 0, item: () => null },
      querySelectorAll: () => [],
      setAttribute: vi.fn(),
      cloneNode: () => ({ ...svg, setAttribute: vi.fn() }),
    };
    const template = { content: { firstElementChild: svg }, set innerHTML(_markup: string) {} };
    const mount = {
      ownerDocument: { createElement: () => template },
      setAttribute: vi.fn(),
      replaceChildren: vi.fn(),
    } as unknown as Element;
    const stringifySpy = vi.spyOn(JSON, "stringify");

    try {
      const adapter = new ProductionWaveDromAdapter();
      const firstRender = await adapter.renderWave(signalId("sig_metrics"), waveJson, mount, semanticValues);
      const secondRender = await adapter.renderWave(signalId("sig_metrics"), waveJson, mount, semanticValues);

      expect(stringifySpy.mock.calls.filter(([value]) => value === waveJson)).toHaveLength(2);
      expect(stringifySpy.mock.calls.filter(([value]) => value === semanticValues)).toHaveLength(2);
      expect(firstRender.markupCacheHit).toBe(false);
      expect(secondRender.markupCacheHit).toBe(true);
      expect(firstRender.renderStages).toMatchObject({ waveJsonBytes: expect.any(Number), svgMarkupBytes: expect.any(Number), domInstallMs: expect.any(Number) });
      expect(secondRender.renderStages?.domInstallMs).toBe(adapter.metrics().renderStages.last?.domInstallMs);
      const totals = adapter.metrics().renderStages.totals;
      const encoder = new TextEncoder();
      expect(totals.waveJsonBytes).toBe(2 * encoder.encode(JSON.stringify(waveJson)).byteLength);
      expect(totals.semanticValuesBytes).toBe(2 * encoder.encode(JSON.stringify(semanticValues)).byteLength);
      expect(adapter.metrics()).toMatchObject({ cacheHits: 1, cacheMisses: 1 });
    } finally {
      stringifySpy.mockRestore();
    }
  });

  it("reuses one exact WaveDrom artifact across identical signal owners while rebinding SVG IDs", async () => {
    const adapter = new ProductionWaveDromAdapter();
    const waveJson: WaveJsonSignal = { wave: `0${".".repeat(31)}` };
    const ownerDocument = createMarkupDocument();
    const renderSpy = vi.spyOn(WaveDrom, "renderAny");
    try {
      const first = await adapter.renderWave(signalId("sig_shared_binary_a"), waveJson, createMarkupMount(ownerDocument));
      const second = await adapter.renderWave(signalId("sig_shared_binary_b"), waveJson, createMarkupMount(ownerDocument));
      const ids = (svg: SVGElement) => [svg.getAttribute("id"), ...Array.from(svg.querySelectorAll("[id]"), (element) => element.getAttribute("id"))].filter((id): id is string => id !== null);
      const firstIds = ids(first.svg);
      const secondIds = ids(second.svg);
      const firstDynamicIds = firstIds.filter((id) => id.endsWith("_0"));
      const secondDynamicIds = secondIds.filter((id) => id.endsWith("_1"));

      expect(first.renderIndex).toBe(0);
      expect(second.renderIndex).toBe(1);
      expect(first.markupCacheHit).toBe(false);
      expect(second.markupCacheHit).toBe(true);
      expect(first.svgSafetyCacheHit).toBe(false);
      expect(second.svgSafetyCacheHit).toBe(true);
      expect(renderSpy).toHaveBeenCalledTimes(1);
      expect(firstIds).toHaveLength(secondIds.length);
      expect(firstDynamicIds.length).toBeGreaterThan(1);
      expect(secondDynamicIds).toHaveLength(firstDynamicIds.length);
      expect(new Set(firstIds).size).toBe(firstIds.length);
      expect(new Set(secondIds).size).toBe(secondIds.length);
      expect(firstDynamicIds.some((id) => secondDynamicIds.includes(id))).toBe(false);
      expect(firstIds.filter((id) => !id.endsWith("_0"))).toEqual(secondIds.filter((id) => !id.endsWith("_1")));
      expect(adapter.metrics()).toMatchObject({ cacheHits: 1, cacheMisses: 1, activeOwners: 2 });
    } finally {
      renderSpy.mockRestore();
    }
  });

  it("reuses the scheduler's precomputed artifact identity during owner preparation", async () => {
    const adapter = new ProductionWaveDromAdapter();
    const ownerDocument = createMarkupDocument();
    const firstWaveJson: WaveJsonSignal = { wave: `0${".".repeat(31)}` };
    const secondWaveJson: WaveJsonSignal = { wave: `0${".".repeat(31)}` };
    const renderSpy = vi.spyOn(WaveDrom, "renderAny");
    const stringifySpy = vi.spyOn(JSON, "stringify");
    try {
      const first = await adapter.prepareWave(signalId("sig_identity_first"), firstWaveJson, ownerDocument);
      expect(first.markupCacheHit).toBe(false);

      const artifactKey = adapter.waveMarkupArtifactKey(secondWaveJson);
      expect(adapter.waveMarkupArtifactKey({ wave: `1${".".repeat(31)}` })).not.toBe(artifactKey);
      const stringifyCallsAfterIdentity = stringifySpy.mock.calls.length;
      const second = await adapter.prepareWave(signalId("sig_identity_second"), secondWaveJson, ownerDocument);

      expect(second.markupCacheHit).toBe(true);
      expect(second.renderIndex).not.toBe(first.renderIndex);
      expect(stringifySpy.mock.calls).toHaveLength(stringifyCallsAfterIdentity);
      expect(renderSpy).toHaveBeenCalledTimes(1);
    } finally {
      stringifySpy.mockRestore();
      renderSpy.mockRestore();
    }
  });

  it("keeps prepared SVG detached until the owner is explicitly installed", async () => {
    const adapter = new ProductionWaveDromAdapter();
    const id = signalId("sig_detached_prepare");
    const waveJson: WaveJsonSignal = { wave: "01.." };
    const svg = {
      localName: "svg",
      namespaceURI: "http://www.w3.org/2000/svg",
      attributes: { length: 0, item: () => null },
      querySelectorAll: () => [],
      setAttribute: vi.fn(),
      cloneNode: () => ({ ...svg, setAttribute: vi.fn() }),
    };
    const template = { content: { firstElementChild: svg }, set innerHTML(_markup: string) {} };
    const ownerDocument = { createElement: () => template } as unknown as Document;
    const replaceChildren = vi.fn();
    const mount = { ownerDocument, setAttribute: vi.fn(), replaceChildren } as unknown as Element;

    const prepared = await adapter.prepareWave(id, waveJson, ownerDocument);

    expect(replaceChildren).not.toHaveBeenCalled();
    expect(adapter.metrics()).toMatchObject({ mounts: 0, activeOwners: 0 });
    expect(prepared.svg).toBe(svg);

    const installed = adapter.installWave(prepared, mount);

    expect(replaceChildren).toHaveBeenCalledWith(svg);
    expect(adapter.metrics()).toMatchObject({ mounts: 1, activeOwners: 1 });
    expect(installed.renderStages?.domInstallMs).toEqual(expect.any(Number));
    expect(installed.renderStages?.svgSafetyDomWalkMs).toBe(0);
  });

  it("avoids parsing a second full SVG tree for image-backed waves without shared labels", async () => {
    const adapter = new ProductionWaveDromAdapter();
    const expectedRootAttributes = renderWaveJsonMarkupWithMetrics({ wave: "01.." }).rootAttributes;
    const nodes: Array<{ localName: string; attrs: Map<string, string>; children: unknown[] }> = [];
    let ownerDocument: Document;
    const geometryRoot = {
      localName: "svg",
      namespaceURI: "http://www.w3.org/2000/svg",
      ownerDocument: undefined as Document | undefined,
      querySelectorAll: () => [],
    };
    const template = { content: { firstElementChild: geometryRoot }, set innerHTML(_markup: string) {} };
    ownerDocument = {
      createElement: vi.fn(() => template),
      createElementNS: vi.fn((_namespace: string, localName: string) => {
        const attrs = new Map<string, string>();
        const children: unknown[] = [];
        const node = {
          localName,
          namespaceURI: "http://www.w3.org/2000/svg",
          ownerDocument,
          attrs,
          children,
          getAttribute: (name: string) => attrs.get(name) ?? null,
          setAttribute: (name: string, value: string) => { attrs.set(name, value); },
          append: (child: unknown) => { children.push(child); },
          querySelector: (selector: string) => selector === "image[data-wave-svg-image]" ? children[0] : null,
          querySelectorAll: () => [],
          cloneNode: () => node,
          get childNodes() { return children; },
        };
        nodes.push(node);
        return node;
      }),
      defaultView: {
        Image: class {
          set src(_value: string) {}
          decode() { return Promise.resolve(); }
        },
      },
    } as unknown as Document;
    geometryRoot.ownerDocument = ownerDocument;
    const createObjectUrl = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test-wave-svg");
    try {
      const prepared = await adapter.prepareWave(signalId("sig_image_fast_path"), { wave: "01.." }, ownerDocument);

      expect(ownerDocument.createElement).not.toHaveBeenCalled();
      expect(prepared.renderStages?.templateParseMs).toBe(0);
      expect(prepared.geometrySvg).toBeUndefined();
      expect(prepared.svg.localName).toBe("svg");
      expect(prepared.svg.querySelector("image[data-wave-svg-image]")).not.toBeNull();
      for (const [name, value] of Object.entries(expectedRootAttributes)) {
        if (name === "id" || name === "xmlns" || name === "xmlns:xlink") continue;
        expect(prepared.svg.getAttribute(name)).toBe(value);
      }
      await prepared.svgImageReady;
      expect(() => adapter.extractLocalGeometry(prepared)).toThrow("Rendered SVG is missing 'lanes_0'.");
      expect(ownerDocument.createElement).toHaveBeenCalledTimes(1);
    } finally {
      createObjectUrl.mockRestore();
    }
  });

  it("releases Blob URLs only after cache, retained, active, and document owners release them", async () => {
    const adapter = new ProductionWaveDromAdapter();
    let nextUrl = 0;
    const createUrl = vi.spyOn(URL, "createObjectURL").mockImplementation(() => `blob:wave-${++nextUrl}`);
    const revokeUrl = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const createSvgNode = (localName: string) => {
      const attributes = new Map<string, string>();
      const children: ReturnType<typeof createSvgNode>[] = [];
      const node = {
        localName,
        namespaceURI: "http://www.w3.org/2000/svg",
        ownerDocument: undefined as Document | undefined,
        parentElement: null as Element | null,
        setAttribute: (name: string, value: string) => { attributes.set(name, value); },
        getAttribute: (name: string) => attributes.get(name) ?? null,
        append: (child: ReturnType<typeof createSvgNode>) => { children.push(child); child.parentElement = node as unknown as Element; },
        querySelector: (selector: string) => selector === "image[data-wave-svg-image]" ? children.find((child) => child.localName === "image" && child.getAttribute("data-wave-svg-image") !== null) ?? null : null,
        querySelectorAll: () => [],
        replaceChildren: (...next: ReturnType<typeof createSvgNode>[]) => { children.splice(0, children.length, ...next); },
        cloneNode: () => node,
        remove: () => { node.parentElement = null; },
        get childNodes() { return children; },
      };
      return node;
    };
    const ownerDocument = {
      ...createMarkupDocument(),
      createElementNS: (_namespace: string, localName: string) => {
        const node = createSvgNode(localName);
        node.ownerDocument = ownerDocument as unknown as Document;
        return node;
      },
      defaultView: { Image: class { set src(_url: string) {} decode() { return Promise.resolve(); } } },
    } as unknown as Document;
    const firstId = signalId("sig_blob_lifetime_first");
    try {
      await adapter.renderWave(firstId, { wave: "0" }, createMarkupMount(ownerDocument));
      for (let index = 1; index < 65; index += 1) {
        await adapter.renderWave(signalId(`sig_blob_lifetime_${index}`), { wave: "0".repeat(index + 1) }, createMarkupMount(ownerDocument));
      }
      // The shared LRU has evicted the first entry, but its active owner still
      // uses the URL. Retaining the artifact transfers protection to reopen.
      expect(adapter.metrics()).toMatchObject({ imageObjectUrlsCreated: 65, imageObjectUrlsRevoked: 0, imageObjectUrlsRetained: 65 });
      // A Signal-binding cache hit can reinsert this artifact after its shared
      // LRU entry was evicted. That reinsertion must reacquire shared-cache
      // ownership before the Signal and active-owner references are released.
      const reinserted = await adapter.prepareWave(firstId, { wave: "0" }, ownerDocument);
      expect(reinserted.markupCacheHit).toBe(true);
      expect((await adapter.prepareWave(firstId, { wave: "0" }, ownerDocument)).markupCacheHit).toBe(true);
      adapter.retainArtifact(firstId);
      expect(adapter.metrics().imageObjectUrlsRevoked).toBe(0);
      adapter.dispose(firstId);
      expect(adapter.metrics()).toMatchObject({ imageObjectUrlsRevoked: 0, imageObjectUrlsRetained: 65 });

      adapter.disposeAll();
      expect(adapter.metrics()).toMatchObject({ imageObjectUrlsCreated: 65, imageObjectUrlsRevoked: 65, imageObjectUrlsRetained: 0 });
      expect(revokeUrl).toHaveBeenCalledTimes(65);

      // A detached prepared result must own its artifact even after its
      // per-Signal binding changes and the shared LRU evicts that artifact.
      const detachedId = signalId("sig_blob_detached_prepare");
      const detached = await adapter.prepareWave(detachedId, { wave: "0" }, ownerDocument);
      for (let index = 0; index < 64; index += 1) {
        await adapter.renderWave(signalId(`sig_blob_detached_churn_${index}`), { wave: "0".repeat(index + 2) }, createMarkupMount(ownerDocument));
      }
      const replacement = await adapter.prepareWave(detachedId, { wave: "1" }, ownerDocument);
      await Promise.all([detached.svgImageReady, replacement.svgImageReady]);
      expect(detached.markupCacheHit).toBe(false);
      expect(replacement.markupCacheHit).toBe(false);
      expect(adapter.metrics().imageObjectUrlsRevoked).toBe(65);
      adapter.installWave(detached, createMarkupMount(ownerDocument));
      expect(adapter.metrics().imageObjectUrlsRevoked).toBe(65);
      adapter.releasePrepared(replacement);
      expect(() => adapter.installWave(replacement, createMarkupMount(ownerDocument))).toThrow("must be prepared by this adapter");
      adapter.dispose(detachedId);
      adapter.disposeAll();
      expect(adapter.metrics().imageObjectUrlsCreated).toBe(adapter.metrics().imageObjectUrlsRevoked);
      expect(adapter.metrics().imageObjectUrlsRetained).toBe(0);
    } finally {
      adapter.disposeAll();
      createUrl.mockRestore();
      revokeUrl.mockRestore();
    }
  });

  it("defers Blob URL revocation until an in-flight image decode settles", async () => {
    const adapter = new ProductionWaveDromAdapter();
    const createUrl = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:pending-wave");
    const revokeUrl = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    let finishDecode!: () => void;
    const createSvgNode = (localName: string) => {
      const attrs = new Map<string, string>();
      const children: ReturnType<typeof createSvgNode>[] = [];
      const node = {
        localName, namespaceURI: "http://www.w3.org/2000/svg", parentElement: null as Element | null,
        setAttribute: (name: string, value: string) => { attrs.set(name, value); }, getAttribute: (name: string) => attrs.get(name) ?? null,
        append: (child: ReturnType<typeof createSvgNode>) => { children.push(child); child.parentElement = node as unknown as Element; },
        querySelector: (selector: string) => selector === "image[data-wave-svg-image]" ? children.find((child) => child.localName === "image") ?? null : null,
        querySelectorAll: () => [], replaceChildren: (...next: ReturnType<typeof createSvgNode>[]) => { children.splice(0, children.length, ...next); },
        cloneNode: () => node, remove: () => { node.parentElement = null; }, get childNodes() { return children; },
      };
      return node;
    };
    const ownerDocument = {
      ...createMarkupDocument(),
      createElementNS: (_namespace: string, localName: string) => createSvgNode(localName),
      defaultView: { Image: class { set src(_url: string) {} decode() { return new Promise<void>((resolve) => { finishDecode = resolve; }); } } },
    } as unknown as Document;
    try {
      const prepared = await adapter.prepareWave(signalId("sig_blob_decode_pending"), { wave: "0" }, ownerDocument);
      expect(adapter.metrics().imageObjectUrlsRetained).toBe(1);
      adapter.disposeAll();
      expect(revokeUrl).not.toHaveBeenCalled();
      finishDecode();
      await prepared.svgImageReady;
      expect(adapter.metrics()).toMatchObject({ imageObjectUrlsRevoked: 1, imageObjectUrlsRetained: 0 });
    } finally {
      adapter.disposeAll();
      createUrl.mockRestore();
      revokeUrl.mockRestore();
    }
  });

  it("reuses identical validated markup across document release without changing WaveDrom IDs", async () => {
    const adapter = new ProductionWaveDromAdapter();
    const id = signalId("sig_reopen_cache");
    const waveJson: WaveJsonSignal = { wave: "01.." };
    let templatesCreated = 0;
    const ownerDocument = {
      createElement: () => {
        templatesCreated += 1;
        let markup = "";
        const svg = {
          localName: "svg", namespaceURI: "http://www.w3.org/2000/svg", attributes: { length: 0, item: () => null },
          parentElement: undefined as unknown, removed: false, setAttribute: vi.fn(),
          querySelectorAll: (selector: string) => selector === "[id]"
            ? [...markup.matchAll(/\bid=["']([^"']+)["']/g)].map((match) => ({ id: match[1] }))
            : [],
          cloneNode: () => ({ ...svg, parentElement: undefined, removed: false, setAttribute: vi.fn() }),
          remove() { this.removed = true; this.parentElement = undefined; },
        };
        return {
          content: { firstElementChild: svg },
          set innerHTML(value: string) { markup = value; },
        };
      },
    };
    const createMount = (document = ownerDocument) => {
      let mountedSvg: Record<string, unknown> | undefined;
      const mount = {
        ownerDocument: document,
        setAttribute: vi.fn(),
        getAttribute: vi.fn(() => id),
        removeAttribute: vi.fn(),
        replaceChildren(child?: unknown) {
          mountedSvg = child as Record<string, unknown> | undefined;
          if (mountedSvg) mountedSvg.parentElement = mount;
        },
        querySelector: (selector: string) => selector === "svg" && !mountedSvg?.removed ? mountedSvg : undefined,
      };
      return mount as unknown as Element;
    };
    const firstMount = createMount();
    const first = await adapter.renderWave(id, waveJson, firstMount);
    const firstIds = [...first.svg.querySelectorAll("[id]")].map((element) => element.id);
    expect(first.markupCacheHit).toBe(false);
    expect(first.svgSafetyCacheHit).toBe(false);
    expect(templatesCreated).toBe(1);
    expect(firstIds.length).toBeGreaterThan(0);

    adapter.retainArtifact(id);
    expect(firstMount.querySelector("svg")).toBeUndefined();
    expect(adapter.metrics().activeOwners).toBe(0);

    const reopenedMount = createMount();
    const encode = vi.spyOn(TextEncoder.prototype, "encode");
    const reopened = await adapter.renderWave(id, waveJson, reopenedMount);
    expect(reopened.markupCacheHit).toBe(true);
    expect(reopened.svgSafetyCacheHit).toBe(true);
    expect(encode).not.toHaveBeenCalled();
    expect(reopened.renderStages).toMatchObject({
      waveJsonBytes: first.renderStages?.waveJsonBytes,
      semanticValuesBytes: first.renderStages?.semanticValuesBytes,
      svgMarkupBytes: first.renderStages?.svgMarkupBytes,
    });
    expect(templatesCreated).toBe(1);
    expect(reopened.renderIndex).toBe(first.renderIndex);
    expect([...reopened.svg.querySelectorAll("[id]")].map((element) => element.id)).toEqual(firstIds);
    expect((reopenedMount as unknown as { querySelector: (selector: string) => unknown }).querySelector("svg")).toBe(reopened.svg);

    adapter.retainArtifact(id);
    const secondReopened = await adapter.renderWave(id, waveJson, createMount());
    expect(secondReopened.markupCacheHit).toBe(true);
    expect(secondReopened.svgSafetyCacheHit).toBe(true);
    expect(templatesCreated).toBe(1);

    const differentDocumentMount = createMount({ createElement: ownerDocument.createElement });
    const differentDocument = await adapter.renderWave(id, waveJson, differentDocumentMount);
    expect(differentDocument.markupCacheHit).toBe(true);
    expect(differentDocument.svgSafetyCacheHit).toBe(true);
    expect(templatesCreated).toBe(2);
    expect(adapter.metrics()).toMatchObject({ cacheHits: 3, cacheMisses: 1, activeOwners: 1 });
  });

  it("does not reuse a retained WaveDrom artifact when semantic input changed", async () => {
    const adapter = new ProductionWaveDromAdapter();
    const id = signalId("sig_reopen_changed");
    const ownerDocument = createMarkupDocument();
    const createMount = () => createMarkupMount(ownerDocument);
    const firstMount = createMount();
    const first = await adapter.renderWave(id, { wave: "01.." }, firstMount);
    adapter.retainArtifact(id);

    const reopened = await adapter.renderWave(id, { wave: "10.." }, createMount());
    expect(reopened.markupCacheHit).toBe(false);
    expect(reopened.renderIndex).not.toBe(first.renderIndex);
    expect(adapter.metrics()).toMatchObject({ cacheHits: 0, cacheMisses: 2 });
  });

  it("bounds retained owner bindings while keeping shared exact artifacts reusable", async () => {
    const adapter = new ProductionWaveDromAdapter();
    const waveJson: WaveJsonSignal = { wave: "0" };
    const ownerDocument = createMarkupDocument();
    const createMount = () => createMarkupMount(ownerDocument);
    const ids = Array.from({ length: 65 }, (_, index) => signalId(`sig_reopen_lru_${index}`));
    for (const id of ids) {
      await adapter.renderWave(id, waveJson, createMount());
      adapter.retainArtifact(id);
    }

    const oldest = await adapter.renderWave(ids[0]!, waveJson, createMount());
    const newestRetained = await adapter.renderWave(ids[64]!, waveJson, createMount());
    expect(oldest.markupCacheHit).toBe(true);
    expect(oldest.renderIndex).toBe(65);
    expect(newestRetained.markupCacheHit).toBe(true);
    expect(newestRetained.renderIndex).toBe(64);
  });

  it("reports WaveDrom markup stage timings without changing serialized output", () => {
    const waveJson = { wave: "=.=.", data: ["LONG_VALUE", "NEXT"] };
    const measured = renderWaveJsonMarkupWithMetrics(waveJson, 0, ["LONG_VALUE", "NEXT"]);
    expect(measured.markup).toBe(renderWaveJsonMarkup(waveJson, 0, ["LONG_VALUE", "NEXT"]));
    expect(measured.metrics.svgMarkupBytes).toBeGreaterThan(0);
    expect(Object.values(measured.metrics).every((value) => Number.isFinite(value) && value >= 0)).toBe(true);
  });

  it("reports WaveDrom markup stage timings without changing the serialized output", () => {
    const waveJson = { wave: "=.=.", data: ["LONG_VALUE", "NEXT"] };
    const measured = renderWaveJsonMarkupWithMetrics(waveJson, 0, ["LONG_VALUE", "NEXT"]);
    expect(measured.markup).toBe(renderWaveJsonMarkup(waveJson, 0, ["LONG_VALUE", "NEXT"]));
    expect(measured.metrics.svgMarkupBytes).toBeGreaterThan(0);
    expect(Object.values(measured.metrics).every((value) => Number.isFinite(value) && value >= 0)).toBe(true);
  });

  it("preserves the left-edge value when converting a bounded source window", () => {
    const signal = logicSignal([{ start: 0, value: 0 }, { start: 50, value: 1 }, { start: 75, value: 0 }]);
    expect(toWaveJsonWindow({ signal, cycleCount: 100 }, 60, 80)).toEqual({ wave: "1..............0....", sourceWindow: { start: 60, end: 80 }, displayWindow: { start: 60, end: 80 } });
  });

  it("bounds source transition visits to a logarithmic prefix lookup plus the requested window", () => {
    const sourceChanges = Array.from({ length: 100_000 }, (_, start) => ({ start, value: start % 2 }));
    let indexedReads = 0;
    const values = new Proxy(sourceChanges, {
      get(target, property, receiver) {
        if (typeof property === "string" && /^\d+$/.test(property)) indexedReads += 1;
        return Reflect.get(target, property, receiver);
      },
    });
    const signal = logicSignal(values as ValueSignal["values"]);

    const bounded = toWaveJsonWindow({ signal, cycleCount: sourceChanges.length }, 90_000, 90_010);

    expect(bounded.wave).toBe("0101010101");
    expect(bounded.sourceWindow).toEqual({ start: 90_000, end: 90_010 });
    expect(indexedReads).toBeLessThan(50);
  });

  it("reconstructs a bounded clock window from canonical phase", () => {
    const clock = canonicalFixture().signals[0] as ClockSignal;
    const bounded = toWaveJsonWindow({ signal: clock, cycleCount: 100 }, 20, 40);
    expect(bounded.sourceWindow).toEqual({ start: 20, end: 40 });
    expect(bounded.wave).toHaveLength(20);
    expect(bounded.wave[0]).toBe("p");
    expect(bounded.wave.slice(1)).toMatch(/^\.*$/);
  });

  it("expands a bounded non-50% duty clock window without flipping its inactive initial level", () => {
    const base = canonicalFixture().signals[0] as ClockSignal;
    const clock = { ...base, generator: { ...base.generator, start: 0, period: 2, duty: 0.25, initial: 0, polarity: "positive" } } as ClockSignal;
    const full = toWaveJson({ signal: clock, cycleCount: 8 });
    const bounded = toWaveJsonWindow({ signal: clock, cycleCount: 8 }, 0, 8);
    expect(bounded.wave).toBe(full.wave);
  });

  it("allows a partial final period in a bounded non-50% duty clock window", () => {
    const base = canonicalFixture().signals[0] as ClockSignal;
    const clock = { ...base, generator: { ...base.generator, start: 0, period: 6, duty: 0.25, initial: 0, polarity: "positive" } } as ClockSignal;
    const full = toWaveJson({ signal: clock, cycleCount: 160 });
    const bounded = toWaveJsonWindow({ signal: clock, cycleCount: 160 }, 0, 160);

    expect(bounded.wave).toBe(full.wave);
    expect(bounded.wave).toHaveLength(160);
  });

  it("keeps renderer-aligned geometry origin separate from the requested source window", () => {
    const clock = canonicalFixture().signals[0] as ClockSignal;
    const bounded = toWaveJsonWindow({ signal: clock, cycleCount: 100 }, 4, 20, { start: 5, end: 20 }, { start: 4, end: 20 });
    expect(bounded.sourceWindow).toEqual({ start: 5, end: 20 });
    expect(bounded.geometryWindow).toEqual({ start: 4, end: 20 });
    expect(bounded.displayWindow).toEqual({ start: 4, end: 20 });
  });

  it("preserves a delayed Clock start when the bounded window begins before it", () => {
    const base = canonicalFixture().signals[0] as ClockSignal;
    const clock = { ...base, generator: { ...base.generator, start: 10, period: 2 } } as ClockSignal;
    const bounded = toWaveJsonWindow({ signal: clock, cycleCount: 20 }, 4, 8);
    expect(bounded.wave).toBe("0.");
    expect(bounded.sourceWindow).toEqual({ start: 4, end: 8 });
  });

  it("carries the canonical LOW enable state into a bounded Clock window", () => {
    const base = canonicalFixture().signals[0] as ClockSignal;
    const clock = { ...base, enable: [{ start: 0, value: 1 }, { start: 4, value: 0 }, { start: 12, value: 1 }] } as ClockSignal;
    const bounded = toWaveJsonWindow({ signal: clock, cycleCount: 20 }, 6, 12);
    expect(bounded.wave).toBe("0.....");
    expect(bounded.sourceWindow).toEqual({ start: 6, end: 12 });
  });

  it("retains an enable transition that occurs inside a bounded Clock window", () => {
    const base = canonicalFixture().signals[0] as ClockSignal;
    const clock = { ...base, enable: [{ start: 0, value: 0 }, { start: 8, value: 1 }] } as ClockSignal;
    const bounded = toWaveJsonWindow({ signal: clock, cycleCount: 20 }, 4, 12);
    expect(bounded.wave).toBe("0...p...");
    expect(bounded.sourceWindow).toEqual({ start: 4, end: 12 });
  });

  it("uses displayLabel only for WaveDrom data while retaining semantic values", () => {
    const bus = { ...canonicalFixture().signals[1]!, values: [{ start: 0, value: "0x12345678", displayLabel: "READY" }] } as ValueSignal;
    expect(bus.values[0]?.value).toBe("0x12345678");
    expect(toWaveJson({ signal: bus, cycleCount: 4 })).toEqual({ wave: "=...", data: ["READY"] });
  });

  it("projects State enum labels for full and bounded waves while preserving source values and unknown fallback", () => {
    const state = { ...canonicalFixture().signals[1]!, type: "state", enumId: "enum.mode", values: [{ start: 0, value: 0 }, { start: 3, value: 7 }, { start: 6, value: 1 }] } as ValueSignal;
    const enumDefinitions = [{ id: "enum.mode", name: "Mode", entries: [{ value: 0, label: "IDLE" }, { value: 1, label: "RUN" }] }] as const;
    const full = toWaveJson({ signal: state, cycleCount: 8, enumDefinitions });
    expect(full).toEqual({ wave: "=..=..=.", data: ["IDLE", "7", "RUN"] });
    expect(state.values.map((change) => change.value)).toEqual([0, 7, 1]);
    expect(toWaveJsonWindow({ signal: state, cycleCount: 8, enumDefinitions }, 2, 8).data).toEqual(["IDLE", "7", "RUN"]);
    const override = { ...state, values: [{ start: 0, value: 1, displayLabel: "CUSTOM" }] } as ValueSignal;
    expect(toWaveJson({ signal: override, cycleCount: 4, enumDefinitions }).data).toEqual(["CUSTOM"]);
  });

  it("defines Auto document defaults and presentation-only SignalValueChange overrides", () => {
    expect(VALUE_LABEL_LAYOUT_POLICY).toMatchObject({ documentDefault: "auto", signalOverride: "displayLabel", semanticSource: "value", minimumFontPt: 8 });
  });

  it("fits data labels to actual WaveDrom segment bounds without changing wave geometry", () => {
    const waveJson: WaveJsonSignal = { wave: "==..=.", data: ["0xDEADBEEF", "LONG_STATE_NAME", "NEXT"] };
    const markup = renderWaveJsonMarkup(waveJson, 0, ["0xDEADBEEF", "LONG_SYMBOLIC_STATE", "NEXT"]);
    expect(markup).toContain('data-value-label-segment-start="0" data-value-label-segment-end="40"');
    expect(markup).toContain('data-value-label-segment-start="40" data-value-label-segment-end="160"');
    expect(markup).toContain('data-value-label-segment-start="160" data-value-label-segment-end="240"');
    expect(markup).toContain('data-value-label-mode="ellipsis"');
    expect(markup).toContain('data-value-label-mode="shrink"');
    expect(markup).toContain('aria-label="0xDEADBEEF"');
    expect(markup).toContain("<title>LONG_SYMBOLIC_STATE</title>");
    expect(markup).toContain('textLength="32" lengthAdjust="spacingAndGlyphs"');
    expect(markup).toContain('x="20"');
    expect(markup).toContain('x="100"');
    expect(markup).toContain('x="200"');
    expect(markup).toContain('id="gmark_1_0" x1="40"');
    expect(waveJson).toEqual({ wave: "==..=.", data: ["0xDEADBEEF", "LONG_STATE_NAME", "NEXT"] });
  });

  it("applies suppressed clock slots relative to a delayed generator start", () => {
    const base = canonicalFixture().signals[0] as ClockSignal;
    const clock = { ...base, generator: { ...base.generator, start: 4, period: 2, suppressedPeriods: [0, 2] } } as ClockSignal;
    expect(toWaveJson({ signal: clock, cycleCount: 10 })).toMatchObject({ wave: "0..p0", period: 2 });
  });

  it("rejects executable SVG markup without stripping ordinary engineering text", () => {
    for (const tag of ["script", "foreignObject", "iframe", "object", "embed", "img"]) {
      expect(() => assertSafeWaveDromMarkup(`<svg><${tag}></${tag}></svg>`)).toThrowError(expect.objectContaining({ code: "UNSAFE_WAVEDROM_SVG" }));
    }
    expect(assertSafeWaveDromMarkup('<svg><text>DATA&lt;7:0&gt; &amp; \'clk\'</text></svg>')).toContain("DATA&lt;7:0&gt;");
    for (const href of ['"javascript:alert(1)"', "'https://example.com/x.svg'", '""', "#local", '"  #local  "']) {
      const markup = `<svg><a href=${href}>x</a></svg>`;
      if (href.startsWith("#") || href.startsWith('"  #')) expect(assertSafeWaveDromMarkup(markup)).toBe(markup);
      else expect(() => assertSafeWaveDromMarkup(markup)).toThrowError(expect.objectContaining({ code: "UNSAFE_WAVEDROM_SVG" }));
    }
    expect(assertSafeWaveDromMarkup('<svg><a href=#remote>x</a></svg>')).toContain("href=#remote");
    expect(() => assertSafeWaveDromMarkup('<svg><a href>x</a></svg>')).toThrowError(expect.objectContaining({ code: "UNSAFE_WAVEDROM_SVG" }));
    expect(assertSafeWaveDromMarkup('<svg><a xlink:href="#local">x</a></svg>')).toContain('xlink:href="#local"');
    expect(() => assertSafeWaveDromMarkup('<svg><a xlink:href="data:image/svg+xml;base64,AA">x</a></svg>')).toThrowError(expect.objectContaining({ code: "UNSAFE_WAVEDROM_SVG" }));
    expect(() => assertSafeWaveDromMarkup('<svg><text onload="alert(1)">x</text></svg>')).toThrowError(expect.objectContaining({ code: "UNSAFE_WAVEDROM_SVG" }));
    expect(() => assertSafeWaveDromMarkup('<svg><text onload>x</text></svg>')).toThrowError(expect.objectContaining({ code: "UNSAFE_WAVEDROM_SVG" }));
    expect(() => assertSafeWaveDromMarkup('<svg><text on>x</text></svg>')).toThrowError(expect.objectContaining({ code: "UNSAFE_WAVEDROM_SVG" }));
    expect(() => assertSafeWaveDromMarkup('<svg><text ONcustom:event = "alert(1)">x</text></svg>')).toThrowError(expect.objectContaining({ code: "UNSAFE_WAVEDROM_SVG" }));
    expect(assertSafeWaveDromMarkup('<svg><text data-href="engineering">x</text></svg>')).toContain('data-href="engineering"');
    const rendered = renderWaveJsonMarkup({ wave: "=", data: ["<DATA&7:0>"] });
    expect(rendered).not.toMatch(/<script|onerror\s*=/i);
    expect(rendered).toContain("&lt;DATA&amp;7:0&gt;");
  });

  it("records an explicit reason for every intentionally unsupported capability", () => {
    expect(WAVEDROM_UNSUPPORTED_CAPABILITIES.length).toBe(5);
    for (const item of WAVEDROM_UNSUPPORTED_CAPABILITIES) expect(item.reason.length).toBeGreaterThan(20);
  });
});
