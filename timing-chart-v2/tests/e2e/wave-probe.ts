import type { Page } from "@playwright/test";

/**
 * Semantic probe for a Signal's rendered WaveDrom artifact.
 *
 * Wave geometry remains in a blob `<image>` while text glyphs are mirrored as SVG overlays so the editor can counter-scale them during
 * horizontal zoom. This helper reads the blob's semantic geometry and maps cycle boundaries, transitions, and label anchors to SCREEN
 * coordinates using the image's on-screen box and viewBox; glyph fidelity itself should be measured from the visible overlay DOM.
 */
export interface WaveLabel { readonly index: number; readonly text: string; /** The visible glyph text only (excludes the accessible <title> child that `text` also contains). */ readonly shownText: string; readonly x: number; readonly y: number; readonly mode: string | null }
/** Artifact-space (unscaled) value-label facts: layout mode, the cycle segment it fits, its anchor X and its accessible name/title. */
export interface WaveRawLabel { readonly index: number; readonly mode: string | null; readonly segmentStart: number; readonly segmentEnd: number; readonly x: number; readonly ariaLabel: string | null; readonly title: string | null }
export interface WaveUse { readonly href: string; readonly x: number }
export interface WaveSnapshot {
  readonly present: boolean;
  /** Screen box of the wave image. */
  readonly box: { readonly left: number; readonly top: number; readonly width: number; readonly height: number };
  /** Screen X of each cycle boundary (gmark), keyed by the artifact's cycle index. */
  readonly boundaries: Readonly<Record<number, number>>;
  /** Every `<use>` shape (wave tokens such as #0m1, #111) in document order with its screen X. */
  readonly uses: readonly WaveUse[];
  readonly labels: readonly WaveLabel[];
  readonly rawLabels: readonly WaveRawLabel[];
  /** Artifact-space X1 of every grid mark (gmark_*), in document order — unchanged by presentation zoom. */
  readonly gridX1: readonly string[];
  /** Artifact intrinsic size (viewBox) — box.width / box.height equals its aspect when glyphs are not stretched. */
  readonly intrinsic: { readonly width: number; readonly height: number };
}

const EMPTY: WaveSnapshot = { present: false, box: { left: 0, top: 0, width: 0, height: 0 }, boundaries: {}, uses: [], labels: [], rawLabels: [], gridX1: [], intrinsic: { width: 0, height: 0 } };

export async function readWave(page: Page, signalId: string): Promise<WaveSnapshot> {
  return page.evaluate(async (id) => {
    const owner = document.querySelector<SVGSVGElement>(`svg[data-wave-owner='${id}']`) ?? document.querySelector<SVGSVGElement>(`[data-signal-id='${id}'] > svg`);
    const href = owner?.querySelector("image[data-wave-svg-image]")?.getAttribute("href");
    if (!owner || !href) return null;
    const source = new DOMParser().parseFromString(await (await fetch(href)).text(), "image/svg+xml").documentElement;
    const rect = owner.getBoundingClientRect();
    const viewBox = source.getAttribute("viewBox")?.split(/[\s,]+/).map(Number);
    const width = viewBox && viewBox.length === 4 ? viewBox[2]! : Number(source.getAttribute("width"));
    const scale = rect.width / width;
    const translateX = (element: Element | null): number => {
      let total = 0;
      for (let node: Element | null = element; node && node !== source; node = node.parentElement) total += Number(/translate\(([-\d.]+)/.exec(node.getAttribute("transform") ?? "")?.[1] ?? 0);
      return total;
    };
    const screenX = (x: number) => rect.left + x * scale;
    const boundaries: Record<number, number> = {};
    for (const line of source.querySelectorAll("[id^='gmark_'][id$='_0']")) boundaries[Number(line.id.split("_")[1])] = screenX(translateX(line.parentElement) + Number(line.getAttribute("x1")));
    const uses = [...source.querySelectorAll("use")].map((node) => ({ href: node.getAttribute("xlink:href") ?? node.getAttribute("href") ?? "", x: screenX(translateX(node)) }));
    const labels = [...source.querySelectorAll("text[data-value-label-index]")].map((node) => ({
      index: Number(node.getAttribute("data-value-label-index")), text: node.textContent ?? "", shownText: (() => { const title = node.querySelector("title")?.textContent ?? ""; const full = node.textContent ?? ""; return title !== "" && full.endsWith(title) ? full.slice(0, full.length - title.length) : full; })(), x: screenX(translateX(node.parentElement) + Number(node.getAttribute("x"))), y: rect.top + Number(node.getAttribute("y")) * scale, mode: node.getAttribute("data-value-label-mode"),
    }));
    const height = viewBox && viewBox.length === 4 ? viewBox[3]! : Number(source.getAttribute("height"));
    const rawLabels = [...source.querySelectorAll("text[data-value-label-index]")].map((node) => ({
      index: Number(node.getAttribute("data-value-label-index")), mode: node.getAttribute("data-value-label-mode"), segmentStart: Number(node.getAttribute("data-value-label-segment-start")), segmentEnd: Number(node.getAttribute("data-value-label-segment-end")),
      x: Number(node.getAttribute("x")), ariaLabel: node.getAttribute("aria-label"), title: node.querySelector("title")?.textContent ?? null,
    }));
    const gridX1 = [...source.querySelectorAll("[id^='gmark_']")].map((line) => line.getAttribute("x1") ?? "");
    return { present: true, rawLabels, gridX1, intrinsic: { width, height }, box: { left: rect.left, top: rect.top, width: rect.width, height: rect.height }, boundaries, uses, labels };
  }, signalId).then((snapshot) => snapshot ?? EMPTY);
}

/** Wave token hrefs (e.g. `#0m1`) in order; changes whenever the rendered waveform changes. */
export const waveUseHrefs = async (page: Page, signalId: string): Promise<readonly string[]> => (await readWave(page, signalId)).uses.map((use) => use.href);

/** Screen X of every transition shape (a token that is not a steady level). */
export const waveTransitionXs = async (page: Page, signalId: string): Promise<readonly number[]> => (await readWave(page, signalId)).uses.filter((use) => use.href.includes("m")).map((use) => use.x);
