import type { CanonicalDocument } from "@timing-chart-v2/schema";
import { DocumentEpoch } from "./document-epoch.js";
import { DisplayMappingCoordinator } from "./display-mapping-coordinator.js";
import { EditorSessionController } from "./editor-session-controller.js";
import { GeometryRegistry } from "./geometry-registry.js";
import { ProjectionCoordinator } from "./projection-coordinator.js";
import { RenderCoordinator } from "./render-coordinator.js";
import type { WaveformSurfaceProvider } from "@timing-chart-v2/renderer";
import { ProductionWaveDromAdapter } from "@timing-chart-v2/wavedrom-adapter";

/** Composition boundary for the editor's long-lived application services. */
export class EditorApplicationRuntime {
  readonly documentEpoch = new DocumentEpoch();
  readonly displayMapping = new DisplayMappingCoordinator();
  readonly geometry = new GeometryRegistry();
  readonly projection = new ProjectionCoordinator();
  readonly session: EditorSessionController;

  constructor(document: CanonicalDocument) {
    this.session = new EditorSessionController(document);
  }

  /** Always exposes the session's current document after Open/New replacement. */
  get document(): CanonicalDocument {
    return this.session.snapshot().document;
  }

  createRenderer(provider: WaveformSurfaceProvider): RenderCoordinator {
    return new RenderCoordinator(provider);
  }

  createWaveDromAdapter(): ProductionWaveDromAdapter {
    return new ProductionWaveDromAdapter();
  }

  /** Signal Split View (#200): the Lower pane has its own DOM renderer and
   * geometry registry while consuming the canonical lower-pane projection.
   * Signals assigned to `both` remain present in both pane projections. */
  createSignalSplitLowerPane(): { readonly geometry: GeometryRegistry; readonly projection: ProjectionCoordinator } {
    return { geometry: new GeometryRegistry(), projection: new ProjectionCoordinator({ pane: "lower" }) };
  }
}
