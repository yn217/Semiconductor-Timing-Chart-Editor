import type { RowLayoutEntry } from "@timing-chart-v2/projection";
import { LEFT_TREE_ICON_DOTS, LEFT_TREE_ICON_PATHS, LEFT_TREE_ICON_PUPIL, type LeftTreeIconPathName } from "./left-tree-icon-spec.js";

export function createLeftTreeIcon(document: Document, name: LeftTreeIconPathName | "more" | "comment", className: string): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("class", className);
  svg.setAttribute("data-icon", name);
  svg.setAttribute("aria-hidden", "true");
  const append = (tag: "path" | "circle") => {
    const element = document.createElementNS("http://www.w3.org/2000/svg", tag);
    svg.append(element);
    return element;
  };
  if (name in LEFT_TREE_ICON_PATHS) {
    const path = append("path");
    const pathName = name as LeftTreeIconPathName;
    path.setAttribute("d", LEFT_TREE_ICON_PATHS[pathName]);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "currentColor");
    path.setAttribute("stroke-width", pathName.startsWith("chevron") ? "2" : "1.6");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    if (pathName === "eye") {
      const pupil = append("circle");
      pupil.setAttribute("cx", String(LEFT_TREE_ICON_PUPIL.cx));
      pupil.setAttribute("cy", String(LEFT_TREE_ICON_PUPIL.cy));
      pupil.setAttribute("r", String(LEFT_TREE_ICON_PUPIL.r));
      pupil.setAttribute("fill", "none");
      pupil.setAttribute("stroke", "currentColor");
      pupil.setAttribute("stroke-width", "1.6");
    }
  } else if (name === "more") {
    for (const { cx, cy, r } of LEFT_TREE_ICON_DOTS) {
      const dot = append("circle");
      dot.setAttribute("cx", String(cx));
      dot.setAttribute("cy", String(cy));
      dot.setAttribute("r", String(r));
      dot.setAttribute("fill", "currentColor");
    }
  } else if (name === "comment") {
    const path = append("path");
    path.setAttribute("d", "M4 4h16v12H9l-5 4z");
    path.setAttribute("fill", "#f1dcff");
    path.setAttribute("stroke", "currentColor");
    path.setAttribute("stroke-width", "1.6");
  }
  return svg;
}

export function createRoleBadge(document: Document, kind: RowLayoutEntry["kind"], role: RowLayoutEntry["role"], className: string): HTMLSpanElement {
  const badge = document.createElement("span");
  badge.dataset.role = className === "tree-signal-role" ? "tree-signal-role" : "signal-role";
  badge.dataset.presentation = kind === "comment" ? "comment" : role ?? "internal";
  badge.className = className;
  if (kind === "comment") badge.append(createLeftTreeIcon(document, "comment", "surface-icon comment-icon"));
  else badge.textContent = role === "input" ? "i" : role === "output" ? "o" : "wire";
  return badge;
}
