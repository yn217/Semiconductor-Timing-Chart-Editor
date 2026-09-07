import type { AnnotationId, ClockGenerator, ClockSignal, GroupId, SignalGroupStyle } from "@timing-chart-v2/schema";
import type { RefObject } from "react";
import { assertSafeWaveDromSvg, renderWaveJsonMarkup, toWaveJson, WaveDromAdapterError } from "@timing-chart-v2/wavedrom-adapter";

function groupStyleAppliesToSurface(style: SignalGroupStyle | undefined, surface: "left" | "frozen" | "timing"): boolean {
  const scope = style?.extend ?? "both";
  return scope === "both" || (scope === "waveform" ? surface === "timing" : surface !== "timing");
}

export function refreshGroupStylePreview(host: HTMLElement, groupId: GroupId, style: SignalGroupStyle | undefined): void {
  const surfaces = [["left", "left-row", "left-group-header"], ["frozen", "frozen-row", "frozen-group-header"], ["timing", "timing-row", "timing-group-header"]] as const;
  for (const [surface, rowRole, headerRole] of surfaces) {
    const applies = groupStyleAppliesToSurface(style, surface);
    for (const element of host.querySelectorAll<HTMLElement>(`[data-role='${rowRole}'][data-group-id='${CSS.escape(groupId)}'], [data-role='${headerRole}'][data-group-id='${CSS.escape(groupId)}']`)) {
      if (applies && style?.showBackground && style.background) element.style.setProperty("--group-background", style.background); else element.style.removeProperty("--group-background");
      if (applies && style?.opacity !== undefined) element.style.opacity = String(style.opacity); else element.style.removeProperty("opacity");
      if (applies && style?.border) element.style.setProperty("--group-border", style.border); else element.style.removeProperty("--group-border");
      element.dataset.groupStylePreview = style === undefined ? "false" : "true";
    }
  }
}

export function refreshAnnotationPreview(host: HTMLElement, annotationId: AnnotationId, draft: { readonly label?: string; readonly color?: string; readonly opacity?: number } | undefined, canonical: { readonly label: string; readonly color: string | undefined; readonly opacity: number | undefined }): void {
  const owner = host.querySelector<HTMLElement>(`[data-role='annotation-owner'][data-annotation-id='${CSS.escape(annotationId)}']`);
  if (!owner) return;
  const label = owner.querySelector<HTMLElement>("[data-role='annotation-label']");
  const nextLabel = draft?.label ?? canonical.label;
  if (label && label.textContent !== nextLabel) label.textContent = nextLabel;
  if (draft?.label !== undefined) {
    if (owner.dataset.annotationAriaLabelOriginal === undefined) owner.dataset.annotationAriaLabelOriginal = owner.getAttribute("aria-label") ?? "";
    owner.setAttribute("aria-label", `${owner.dataset.annotationType}: ${nextLabel}`);
  } else if (owner.dataset.annotationAriaLabelOriginal !== undefined) {
    owner.setAttribute("aria-label", owner.dataset.annotationAriaLabelOriginal);
    delete owner.dataset.annotationAriaLabelOriginal;
  }
  const nextColor = draft?.color ?? canonical.color;
  if (nextColor) owner.style.setProperty("--annotation-color", nextColor); else owner.style.removeProperty("--annotation-color");
  const nextOpacity = draft?.opacity ?? canonical.opacity;
  if (nextOpacity !== undefined) owner.style.opacity = String(nextOpacity); else owner.style.removeProperty("opacity");
  owner.dataset.annotationPreview = draft === undefined ? "false" : "true";
}

export function refreshClockPreview(host: HTMLElement, signal: ClockSignal, draftGenerator: ClockGenerator | undefined, cycleCount: number): void {
  const mount = host.querySelector<HTMLElement>(`[data-role='wave-owner'][data-signal-id='${CSS.escape(signal.id)}']`);
  if (!mount) return;
  const canonicalSvg = mount.querySelector<SVGElement>(":scope > svg:not([data-clock-preview-svg])");
  const existingPreview = mount.querySelector<SVGElement>("[data-clock-preview-svg]");
  const restoreCanonical = () => { existingPreview?.remove(); canonicalSvg?.style.removeProperty("display"); delete mount.dataset.clockPreview; };
  if (draftGenerator === undefined) { restoreCanonical(); return; }
  try {
    const waveJson = toWaveJson({ signal: { ...signal, generator: draftGenerator }, cycleCount });
    const markup = renderWaveJsonMarkup(waveJson, 0xC10CC, []);
    const template = mount.ownerDocument.createElement("template");
    template.innerHTML = markup.trim();
    const svg = template.content.firstElementChild;
    if (!svg || svg.namespaceURI !== "http://www.w3.org/2000/svg" || svg.localName !== "svg") { restoreCanonical(); return; }
    assertSafeWaveDromSvg(svg);
    svg.setAttribute("data-clock-preview-svg", "true");
    svg.setAttribute("preserveAspectRatio", "none");
    existingPreview?.remove();
    canonicalSvg?.style.setProperty("display", "none");
    mount.appendChild(svg);
    mount.dataset.clockPreview = "true";
  } catch (error) {
    if (!(error instanceof WaveDromAdapterError)) throw error;
    restoreCanonical();
  }
}

export function applyPreviewSelection(host: RefObject<HTMLDivElement | null>, selectedId: string | undefined): void {
  for (const owner of host.current?.querySelectorAll<HTMLElement>("[data-annotation-id]") ?? []) owner.dataset.selected = String(owner.dataset.annotationId === selectedId);
}
