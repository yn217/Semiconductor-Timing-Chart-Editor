import type { CanonicalDocument } from "@timing-chart-v2/schema";
import { DocumentEpoch } from "./document-epoch.js";
import { DisplayMappingCoordinator } from "./display-mapping-coordinator.js";
import { EditorSessionController } from "./editor-session-controller.js";
import { GeometryRegistry } from "./geometry-registry.js";
import { ProjectionCoordinator } from "./projection-coordinator.js";
import { SelectionController } from "./selection-controller.js";
import { RenderCoordinator } from "./render-coordinator.js";
import type { WaveformSurfaceProvider } from "@timing-chart-v2/renderer";

/** Composition boundary for the editor's long-lived application services. */
export class EditorApplicationRuntime {
  readonly documentEpoch = new DocumentEpoch();
  readonly displayMapping = new DisplayMappingCoordinator();
  readonly geometry = new GeometryRegistry();
  readonly projection = new ProjectionCoordinator();
  readonly selection = new SelectionController();
  readonly session: EditorSessionController;

  constructor(readonly document: CanonicalDocument) {
    this.session = new EditorSessionController(document);
  }

  createRenderer(provider: WaveformSurfaceProvider): RenderCoordinator {
    return new RenderCoordinator(provider);
  }
}
