export const ANNOTATION_PRESENTATION_NUMERIC_RANGES = Object.freeze({
  strokeWidth: Object.freeze({ min: 1, max: 8, default: 2 }),
  strokeOpacity: Object.freeze({ min: 0, max: 1, default: 1 }),
  fillOpacity: Object.freeze({ min: 0, max: 1, default: 0.12 }),
});

export const ANNOTATION_STROKE_OPACITY = ANNOTATION_PRESENTATION_NUMERIC_RANGES.strokeOpacity;

export type AnnotationPresentationNumericField = keyof typeof ANNOTATION_PRESENTATION_NUMERIC_RANGES;

export interface AnnotationPresentationNumericStyleIssue {
  readonly field: AnnotationPresentationNumericField;
  readonly min: number;
  readonly max: number;
}

export interface AnnotationPresentationStyleIssue {
  readonly field: string;
  readonly message: string;
}

const ANNOTATION_STROKE_STYLES = new Set(["solid", "dashed", "dotted"]);
const ANNOTATION_FILL_COLOR = /^(?:none|#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8}))$/i;

/** Validate the numeric style fields exposed by Stroke/Fill controls at every
 * canonical ingress. Renderers still defensively ignore malformed legacy
 * values, but new commands and opened documents must reject them explicitly. */
export function annotationPresentationNumericStyleIssues(style: unknown): readonly AnnotationPresentationNumericStyleIssue[] {
  if (style === null || typeof style !== "object" || Array.isArray(style)) return [];
  const source = style as Record<string, unknown>;
  const issues: AnnotationPresentationNumericStyleIssue[] = [];
  for (const field of Object.keys(ANNOTATION_PRESENTATION_NUMERIC_RANGES) as AnnotationPresentationNumericField[]) {
    const value = source[field];
    if (value === undefined) continue;
    const { min, max } = ANNOTATION_PRESENTATION_NUMERIC_RANGES[field];
    if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) issues.push({ field, min, max });
  }
  return issues;
}

/** Validate the authored discrete presentation values against the exact
 * values the live renderer and export renderer understand. Silently ignoring
 * an invalid canonical value would make the visible control/document lie. */
export function annotationPresentationStyleIssues(style: unknown): readonly AnnotationPresentationStyleIssue[] {
  if (style === null || typeof style !== "object" || Array.isArray(style)) return [];
  const source = style as Record<string, unknown>;
  const issues: AnnotationPresentationStyleIssue[] = annotationPresentationNumericStyleIssues(style).map(({ field, min, max }) => ({
    field,
    message: `Annotation ${field} must be between ${min} and ${max}.`,
  }));
  if (source.strokeStyle !== undefined && (typeof source.strokeStyle !== "string" || !ANNOTATION_STROKE_STYLES.has(source.strokeStyle))) {
    issues.push({ field: "strokeStyle", message: "Annotation strokeStyle must be solid, dashed, or dotted." });
  }
  if (source.fillColor !== undefined && (typeof source.fillColor !== "string" || !ANNOTATION_FILL_COLOR.test(source.fillColor))) {
    issues.push({ field: "fillColor", message: "Annotation fillColor must be a CSS hex color or 'none'." });
  }
  return issues;
}
