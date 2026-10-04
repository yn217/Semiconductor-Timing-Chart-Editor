import { DefaultProjectionService, type ProjectionRequest, type RenderProjection } from "@timing-chart-v2/projection";
import type { GroupId, SignalGroupStyle } from "@timing-chart-v2/schema";

/** Owns projection service lifetime and keeps projection calls outside React UI code. */
export class ProjectionCoordinator {
  private readonly service: DefaultProjectionService;
  private signalTreeFilter = "";
  private signalTreeTypeFilter: RenderProjection["signalTreeTypeFilter"] = "all";
  private groupStylePreview: ProjectionRequest["groupStylePreview"];
  private documentEpoch = 0;
  private projectionCalls = 0;
  private projectionDurationMs = 0;
  private fullReplaceCalls = 0;
  private viewportOnlyCalls = 0;
  private changeCalls = 0;

  constructor(options: { readonly pane?: "upper" | "lower" } = {}) {
    this.service = new DefaultProjectionService(options);
  }

  project(request: ProjectionRequest): RenderProjection {
    const startedAt = globalThis.performance?.now?.() ?? Date.now();
    const projection = this.service.project({ ...request, signalTreeFilter: this.signalTreeFilter, signalTreeTypeFilter: this.signalTreeTypeFilter, ...(this.groupStylePreview === undefined ? {} : { groupStylePreview: this.groupStylePreview }) });
    this.projectionCalls += 1;
    this.projectionDurationMs += (globalThis.performance?.now?.() ?? Date.now()) - startedAt;
    if (request.changeSet.fullDocumentReplace) this.fullReplaceCalls += 1;
    else if (request.previous && Object.keys(request.changeSet).length === 0 && request.snapshot.revision === request.previous.revision) this.viewportOnlyCalls += 1;
    else this.changeCalls += 1;
    this.documentEpoch = projection.documentEpoch;
    return projection;
  }

  setSignalTreeFilter(text: string, type: RenderProjection["signalTreeTypeFilter"]): void {
    this.signalTreeFilter = text;
    this.signalTreeTypeFilter = type;
  }

  /** Applies a temporary Inspector draft to derived row geometry only. */
  setGroupStylePreview(groupId: GroupId, style: SignalGroupStyle | undefined): void {
    this.groupStylePreview = style === undefined ? undefined : { groupId, style };
  }

  /** Current generation of this projection owner, used to reject results
   * produced by an async renderer batch for a prior document. */
  currentDocumentEpoch(): number {
    return this.documentEpoch;
  }

  /** Signal Split View (#200): switches the Upper-pane coordinator's row
   * filter between unfiltered (Split off) and pane:"upper" (Split on). The
   * Lower-pane coordinator is constructed with its pane fixed and never
   * calls this. */
  setPane(pane: "upper" | "lower" | undefined): void {
    this.service.setPane(pane);
  }

  diagnostics(): ReturnType<DefaultProjectionService["diagnostics"]> & Readonly<{ projectionCalls: number; projectionDurationMs: number; fullReplaceCalls: number; viewportOnlyCalls: number; changeCalls: number }> {
    return { ...this.service.diagnostics(), projectionCalls: this.projectionCalls, projectionDurationMs: this.projectionDurationMs, fullReplaceCalls: this.fullReplaceCalls, viewportOnlyCalls: this.viewportOnlyCalls, changeCalls: this.changeCalls };
  }
}
