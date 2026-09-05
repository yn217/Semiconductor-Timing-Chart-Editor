import { DefaultProjectionService, type ProjectionRequest, type RenderProjection } from "@timing-chart-v2/projection";

/** Owns projection service lifetime and keeps projection calls outside React UI code. */
export class ProjectionCoordinator {
  private readonly service: DefaultProjectionService;

  constructor(options: { readonly pane?: "upper" | "lower" } = {}) {
    this.service = new DefaultProjectionService(options);
  }

  project(request: ProjectionRequest): RenderProjection {
    return this.service.project(request);
  }

  /** Signal Split View (#200): switches the Upper-pane coordinator's row
   * filter between unfiltered (Split off) and pane:"upper" (Split on). The
   * Lower-pane coordinator is constructed with its pane fixed and never
   * calls this. */
  setPane(pane: "upper" | "lower" | undefined): void {
    this.service.setPane(pane);
  }

  diagnostics(): ReturnType<DefaultProjectionService["diagnostics"]> {
    return this.service.diagnostics();
  }
}
