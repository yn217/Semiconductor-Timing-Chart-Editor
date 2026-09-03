import type { WaveJsonSignal } from "./types.js";

export type ValueLabelLayoutMode = "normal" | "shrink" | "ellipsis";

export interface ValueLabelLayoutEvidence {
  readonly index: number;
  readonly mode: ValueLabelLayoutMode;
  readonly segmentStart: number;
  readonly segmentEnd: number;
  readonly visibleLabel: string;
  readonly semanticValue: string;
}

const BASE_FONT_PT = 11;
const MIN_FONT_PT = 8;
const SEGMENT_PADDING = 8;

/** Document-wide Auto is the default; each SignalValueChange.displayLabel is
 * the optional per-value presentation override, while value stays semantic. */
export const VALUE_LABEL_LAYOUT_POLICY = Object.freeze({
  documentDefault: "auto" as const,
  signalOverride: "displayLabel" as const,
  semanticSource: "value" as const,
  baseFontPt: BASE_FONT_PT,
  minimumFontPt: MIN_FONT_PT,
  segmentPadding: SEGMENT_PADDING,
});

function xml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function estimatedWidth(value: string, fontPt: number): number {
  const pixelsPerPoint = 96 / 72;
  return [...value].reduce((width, character) => {
    const factor = /[ilI.,'`|]/.test(character) ? 0.28
      : /[MW@#%&]/.test(character) ? 0.9
        : /[^\x00-\x7f]/.test(character) ? 0.95
          : /\s/.test(character) ? 0.33
            : 0.58;
    return width + factor * fontPt * pixelsPerPoint;
  }, 0);
}

function ellipsisLabel(value: string, width: number): string {
  if (estimatedWidth("…", MIN_FONT_PT) > width) return "…";
  let result = "";
  for (const character of value) {
    const candidate = `${result}${character}…`;
    if (estimatedWidth(candidate, MIN_FONT_PT) > width) break;
    result += character;
  }
  return `${result}…`;
}

function gridPositions(markup: string): number[] {
  return [...markup.matchAll(/<line\s+id="gmark_[^"]+"\s+x1="([^\"]+)"/g)]
    .map((match) => Number(match[1]))
    .filter(Number.isFinite);
}

function dataSlots(wave: string): number[] {
  return [...wave].flatMap((token, index) => token === "=" ? [index] : []);
}

function replaceAttribute(attributes: string, name: string, value: string): string {
  const pattern = new RegExp(`\\s${name}="[^"]*"`);
  return pattern.test(attributes) ? attributes.replace(pattern, ` ${name}="${value}"`) : `${attributes} ${name}="${value}"`;
}

/**
 * Fit only the presentation text emitted by WaveDrom. The grid remains the
 * source of segment geometry, and no WaveJSON token or semantic value is
 * changed. The resulting attributes also make the fitting decision inspectable
 * in browser and exported SVG evidence.
 */
export function applyValueLabelLayout(markup: string, waveJson: WaveJsonSignal, semanticValues: readonly string[] = []): string {
  if (!waveJson.data?.length) return markup;
  const grid = gridPositions(markup);
  const slots = dataSlots(waveJson.wave);
  if (grid.length < waveJson.wave.length + 1 || slots.length === 0) return markup;
  let dataIndex = 0;
  return markup.replace(/<text\b([^>]*\btext-anchor="middle"[^>]*)>(<tspan>)([\s\S]*?)(<\/tspan>[\s\S]*?)<\/text>/g, (whole, rawAttributes: string, prefix: string, rawLabel: string, suffix: string) => {
    const index = dataIndex++;
    const slot = slots[index];
    if (slot === undefined) return whole;
    const endSlot = slots[index + 1] ?? waveJson.wave.length;
    const segmentStart = grid[slot]!;
    const segmentEnd = grid[endSlot]!;
    const width = Math.max(1, segmentEnd - segmentStart - SEGMENT_PADDING);
    const label = waveJson.data?.[index] ?? rawLabel;
    const semanticValue = semanticValues[index] ?? label;
    const naturalWidth = estimatedWidth(label, BASE_FONT_PT);
    const minimumWidth = estimatedWidth(label, MIN_FONT_PT);
    let mode: ValueLabelLayoutMode = "normal";
    let visibleLabel = label;
    let fontSize: string | undefined;
    if (naturalWidth > width && minimumWidth <= width) {
      mode = "shrink";
      fontSize = `${Math.max(MIN_FONT_PT, Math.min(BASE_FONT_PT, BASE_FONT_PT * width / naturalWidth)).toFixed(2)}pt`;
    } else if (naturalWidth > width) {
      mode = "ellipsis";
      visibleLabel = ellipsisLabel(label, width);
      fontSize = `${MIN_FONT_PT}pt`;
    }
    let attributes = replaceAttribute(rawAttributes, "x", `${(segmentStart + segmentEnd) / 2}`);
    attributes += ` data-value-label-index="${index}" data-value-label-mode="${mode}" data-value-label-segment-start="${segmentStart}" data-value-label-segment-end="${segmentEnd}" aria-label="${xml(semanticValue)}" tabindex="0"`;
    if (fontSize) attributes += ` style="font-size:${fontSize}" textLength="${width}" lengthAdjust="spacingAndGlyphs"`;
    const trailing = suffix.startsWith("</tspan>") ? suffix.slice("</tspan>".length) : suffix;
    return `<text${attributes}>${prefix}${xml(visibleLabel)}</tspan><title>${xml(semanticValue)}</title>${trailing}</text>`;
  });
}
