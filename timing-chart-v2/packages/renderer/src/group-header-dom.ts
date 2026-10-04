import type { GroupHeaderLayoutEntry } from "@timing-chart-v2/projection";
import { createLeftTreeIcon } from "./tree-row-dom.js";
import { groupBackgroundColor } from "./group-background.js";

type GroupHeaderSurface = "left" | "frozen" | "timing";

/** Owns incremental DOM reconciliation and accessible controls for group headers. */
export function syncGroupHeaderLayer(
  layer: HTMLElement,
  cache: Map<string, HTMLElement>,
  headerIds: readonly GroupHeaderLayoutEntry["rowId"][],
  headers: readonly GroupHeaderLayoutEntry[],
  surface: GroupHeaderSurface,
): { creates: number; destroys: number; moves: number } {
  const active = new Set<string>(headerIds);
  let creates = 0, destroys = 0, moves = 0;
  for (const [id, shell] of cache) if (!active.has(id)) { shell.remove(); cache.delete(id); destroys += 1; }
  const byId = new Map(headers.map((header) => [header.rowId, header]));
  const ordered: HTMLElement[] = [];
  for (const id of headerIds) {
    const header = byId.get(id);
    if (!header) continue;
    let shell = cache.get(id);
    if (!shell) {
      shell = layer.ownerDocument.createElement("div");
      shell.dataset.role = `${surface}-group-header`;
      shell.style.position = "absolute";
      shell.dataset.rowId = id;
      cache.set(id, shell);
      creates += 1;
    }
    const signature = `${surface}\u0000${header.groupId}\u0000${header.groupName}\u0000${header.collapsed}\u0000${JSON.stringify(header.groupStyle ?? {})}`;
    if (shell.dataset.presentationSignature !== signature) {
      shell.dataset.groupId = header.groupId;
      shell.dataset.groupName = header.groupName;
      shell.dataset.groupHeader = "true";
      if (surface === "left") {
        shell.setAttribute("role", "treeitem");
        shell.tabIndex = -1;
        shell.setAttribute("aria-level", "1");
        shell.setAttribute("aria-expanded", String(!header.collapsed));
        shell.setAttribute("aria-selected", "false");
      }
      const applies = groupStyleAppliesToSurface(header.groupStyle?.extend, surface);
      const background = applies && header.groupStyle?.showBackground
        ? groupBackgroundColor(header.groupStyle.background, header.groupStyle.opacity)
        : undefined;
      if (background) shell.style.setProperty("--group-background", background);
      else shell.style.removeProperty("--group-background");
      if (applies && header.groupStyle?.border) shell.style.setProperty("--group-border", header.groupStyle.border);
      else shell.style.removeProperty("--group-border");
      if (surface === "left") populateGroupHeader(shell, header);
      else if (shell.textContent !== header.groupName) shell.textContent = header.groupName;
      shell.dataset.presentationSignature = signature;
    }
    place(shell, header);
    ordered.push(shell);
  }
  const currentRows = Array.from(layer.children).filter((child) => !(child as HTMLElement).dataset.groupHeader) as HTMLElement[];
  const combined = [...currentRows, ...ordered];
  combined.sort((left, right) => {
    const y = (item: HTMLElement) => Number.parseFloat(item.style.transform.match(/translateY\((-?[0-9.]+)px\)/)?.[1] ?? "0");
    return y(left) - y(right);
  });
  const current = Array.from(layer.children);
  const existing = new Set(current);
  const expectedExisting = combined.filter((shell) => existing.has(shell));
  const preservesExistingOrder = current.length === expectedExisting.length
    && current.every((shell, index) => shell === expectedExisting[index]);
  if (preservesExistingOrder) {
    for (let index = 0; index < combined.length; index += 1) {
      const shell = combined[index]!;
      if (existing.has(shell)) continue;
      const nextExisting = combined.slice(index + 1).find((candidate) => existing.has(candidate));
      layer.insertBefore(shell, nextExisting ?? null);
      existing.add(shell);
      moves += 1;
    }
  } else if (combined.length !== current.length || combined.some((shell, index) => current[index] !== shell)) {
    layer.replaceChildren(...combined);
    moves += combined.length;
  }
  return { creates, destroys, moves };
}

function populateGroupHeader(shell: HTMLElement, header: GroupHeaderLayoutEntry): void {
  const document = shell.ownerDocument;
  const branch = document.createElement("span");
  branch.dataset.role = "tree-branch";
  branch.dataset.groupId = header.groupId;
  branch.draggable = true;
  branch.setAttribute("aria-label", `Select ${header.groupName} group`);
  const collapse = document.createElement("button");
  collapse.type = "button";
  collapse.dataset.role = "tree-collapse";
  collapse.dataset.groupId = header.groupId;
  collapse.setAttribute("aria-label", `${header.collapsed ? "Expand" : "Collapse"} ${header.groupName} group`);
  collapse.setAttribute("aria-expanded", String(!header.collapsed));
  collapse.dataset.collapsed = String(header.collapsed);
  collapse.append(createLeftTreeIcon(document, header.collapsed ? "chevron-right" : "chevron-down", "surface-icon chevron-icon"));
  branch.append(collapse, document.createTextNode(` ${header.groupName}`));
  const more = document.createElement("button");
  more.type = "button";
  more.dataset.role = "tree-group-more";
  more.dataset.groupId = header.groupId;
  more.setAttribute("aria-label", `More actions for ${header.groupName}`);
  more.append(createLeftTreeIcon(document, "more", "surface-icon more-icon"));
  shell.replaceChildren(branch, more);
}

function groupStyleAppliesToSurface(extend: "label" | "waveform" | "both" | undefined, surface: GroupHeaderSurface): boolean {
  const scope = extend ?? "both";
  const isWaveform = surface === "timing";
  return scope === "both" || (scope === "waveform" ? isWaveform : !isWaveform);
}

function place(element: HTMLElement, row: Pick<GroupHeaderLayoutEntry, "y" | "height">): void {
  const transform = `translateY(${row.y}px)`;
  const height = `${row.height}px`;
  if (element.style.transform !== transform) element.style.transform = transform;
  if (element.style.height !== height) element.style.height = height;
  const borderBottomWidth = row.height === 0 ? "0px" : "";
  if (element.style.borderBottomWidth !== borderBottomWidth) element.style.borderBottomWidth = borderBottomWidth;
}
