import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MinimalCycleView } from "./minimal-cycle-view.js";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("Editor root is missing");
const probe = new URLSearchParams(window.location.search).get("probe");

// Normal production startup renders the editor synchronously and never
// imports probe/architecture-acceptance code (#277) -- ArchitectureProbe,
// StableSurfaceProbe, and their direct renderer/session/adapter
// construction live in ./probes/ and are only fetched, via a dynamic
// import, when an explicit `?probe=geometry` / `?probe=stable` query
// string requests them. That keeps them out of the normal editor's
// eagerly-loaded startup chunk while still exercising the same real
// production packages (no duplicate implementation).
if (probe === "geometry") {
  void import("./probes/geometry-probe.js").then(({ ArchitectureProbe }) => {
    createRoot(root).render(<StrictMode><ArchitectureProbe /></StrictMode>);
  });
} else if (probe === "geometry-equivalence") {
  void import("./probes/geometry-equivalence-probe.js").then(({ GeometryEquivalenceProbe }) => {
    createRoot(root).render(<GeometryEquivalenceProbe />);
  });
} else if (probe === "stable") {
  void import("./probes/stable-surface-probe.js").then(({ StableSurfaceProbe }) => {
    createRoot(root).render(<StrictMode><StableSurfaceProbe /></StrictMode>);
  });
} else {
  // The production editor owns imperative renderer/runtime effects. Keeping
  // it under StrictMode causes the mount effect to be intentionally replayed
  // in the dev browser, producing a duplicate full-document startup render.
  // Probe surfaces retain StrictMode above; the real editor must mount its
  // timeline runtime exactly once per document root.
  createRoot(root).render(<MinimalCycleView />);
}
