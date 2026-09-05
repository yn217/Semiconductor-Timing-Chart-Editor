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

  constructor(readonly document: CanonicalDocument) {
    this.session = new EditorSessionController(document);
  }

  createRenderer(provider: WaveformSurfaceProvider): RenderCoordinator {
    return new RenderCoordinator(provider);
  }

  createWaveDromAdapter(): ProductionWaveDromAdapter {
    return new ProductionWaveDromAdapter();
  }

  /** Signal Split View (#200): the Lower pane mounts into its own DOM host
   * and cannot share the primary `geometry`/`projection` singletons -- a
   * "both"-assigned Signal renders into two hosts, and a shared
   * SignalId-keyed SVG/geometry map would have whichever pane rendered last
   * silently win the other's reference. Lower gets its own registry and a
   * projection coordinator permanently fixed to `pane: "lower"`; Upper keeps
   * using the primary `projection`/`geometry` above and switches its own
   * filter via `projection.setPane()` instead of a second instance, since
   * Upper's is the one that must revert to unfiltered when Split turns off. */
  createSignalSplitLowerPane(): { readonly geometry: GeometryRegistry; readonly projection: ProjectionCoordinator } {
    return { geometry: new GeometryRegistry(), projection: new ProjectionCoordinator({ pane: "lower" }) };
  }
}
