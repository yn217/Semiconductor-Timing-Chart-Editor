import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

function ArchitectureProbe() {
  return <main><h1>Timing Chart Editor V2</h1><p>Phase 0 architecture probe</p></main>;
}

const root = document.getElementById("root");
if (!root) throw new Error("Editor root is missing");
createRoot(root).render(<StrictMode><ArchitectureProbe /></StrictMode>);
