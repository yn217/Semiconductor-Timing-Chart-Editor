/**
 * Apply Group opacity to the background paint only. Setting opacity on the
 * row shell also fades its text, controls, waveform and selection descendants.
 */
export function groupBackgroundColor(background: string | undefined, opacity: number | undefined): string | undefined {
  if (background === undefined) return undefined;
  const alpha = Number.isFinite(opacity) ? Math.min(1, Math.max(0, opacity!)) : 1;
  if (alpha >= 1) return background;
  if (alpha <= 0) return "transparent";
  return `color-mix(in srgb, ${background} ${alpha * 100}%, transparent)`;
}
